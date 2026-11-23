import type {DiagramPose} from './diagramProject';
import {WEB_APP} from './webRuntime';

export interface DiagramPoseCacheStore {read(key:string):Promise<unknown>;write(key:string,value:unknown):Promise<void>}
export async function encodeDiagramPoseCache(value:unknown){
  const compressed=await new Response(new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  const bytes=new Uint8Array(compressed);let text='';
  for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return {encoding:'gzip-v1',data:btoa(text)};
}
export async function decodeDiagramPoseCache(value:unknown):Promise<unknown>{
  const record=value as {encoding?:string;data?:string};
  if(record?.encoding!=='gzip-v1'||typeof record.data!=='string'||record.data.length>4*1024*1024)return;
  const bytes=Uint8Array.from(atob(record.data),c=>c.charCodeAt(0));
  const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks:Uint8Array<ArrayBuffer>[]=[];let size=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>8*1024*1024)throw Error('姿态缓存解压超出容量。');chunks.push(value);}}finally{await reader.cancel();}
  return JSON.parse(await new Blob(chunks).text());
}
export function createDiagramPoseRestoreCache(version:string,store:DiagramPoseCacheStore){
  const stats={hits:0,misses:0,readMs:0,writeMs:0,computeMs:0};
  const writes=new Map<string,Promise<void>>();
  const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
  return {stats,async flush(){await Promise.all(writes.values());},async restore(pose:DiagramPose,previous:DiagramPose|undefined,compute:()=>void){
    const start=performance.now();let key:string|undefined,cached:unknown;
    try{
      // Complete preceding pose binds the material relations inherited by this
      // arm. Captions and unrelated steps are deliberately outside this input.
      const input=JSON.stringify([pose,previous]);
      if(input.length<=4*1024*1024){key=await digest(JSON.stringify(['pose-restore-v1',version,input]));await writes.get(key);cached=await store.read(key);}
    }catch{/* Cache failures cannot make a valid project unopenable. */}
    stats.readMs+=performance.now()-start;
    const entry=cached as {version?:number;pose?:DiagramPose}|undefined;
    if(entry?.version===1&&entry.pose?.sourceStateId===pose.sourceStateId&&entry.pose.sourceRevision===pose.sourceRevision&&entry.pose.result?.geometry&&entry.pose.result?.layers){
      const restored=entry.pose;
      for(const property of Object.keys(pose))delete (pose as unknown as Record<string,unknown>)[property];
      Object.assign(pose,restored);stats.hits++;return;
    }
    stats.misses++;const computeStart=performance.now();compute();stats.computeMs+=performance.now()-computeStart;
    if(!key)return;
    // Compress/write a bounded number of immutable snapshots while the next
    // step is restored. Never retain the complete project twice in memory.
    if(writes.size>=4)await Promise.race(writes.values());
    const value={version:1,pose};if(JSON.stringify(value).length>2*1024*1024)return;
    const frozen=structuredClone(value),writeKey=key,writeStart=performance.now();
    const writing=store.write(writeKey,frozen).catch(()=>{}).finally(()=>{stats.writeMs+=performance.now()-writeStart;writes.delete(writeKey);});
    writes.set(writeKey,writing);
  }};
}

/** Native checksum-protected sidecars; no cache supplied inside a user file is trusted. */
export async function openDiagramPoseRestoreCache(){
  if(WEB_APP||!import.meta.env?.PROD||!import.meta.env.VITE_DIAGRAM_OPEN_VERSION)return;
  try{
    const response=await fetch('/api/health',{signal:AbortSignal.timeout(3000)});if(!response.ok)return;
    const {token}=await response.json();if(typeof token!=='string'||!token)return;
    const headers={'X-Zhezhi-Token':token};
    return createDiagramPoseRestoreCache(import.meta.env.VITE_DIAGRAM_OPEN_VERSION,{
      async read(key){const r=await fetch('/api/diagram-open-cache/'+key,{headers,cache:'no-store',signal:AbortSignal.timeout(3000)});return r.ok&&r.status!==204?decodeDiagramPoseCache(await r.json()):undefined;},
      async write(key,value){await fetch('/api/diagram-open-cache/'+key,{method:'POST',headers,body:JSON.stringify(await encodeDiagramPoseCache(value)),signal:AbortSignal.timeout(3000)});},
    });
  }catch{return;}
}
