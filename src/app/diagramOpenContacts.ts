import type {RestoreContactSolution} from './diagramSpatialPose';
import {WEB_APP} from './webRuntime';

type Orders=ReturnType<RestoreContactSolution>;
const entryLimit=8*1024*1024;

/** The sidecar comes only from this installation. The complete document text,
 * envelope type and content-hashed worker build bind the ordered solver calls. */
export async function openDiagramContactCache(raw:string,stored:boolean){
  if(WEB_APP||!import.meta.env?.PROD||raw.length<256*1024)return;
  const workerPath=self.location.pathname;
  if(!/\/diagramProjectImport\.worker-[\w-]+\.js$/.test(workerPath))return;
  try{
    const encoder=new TextEncoder();
    const digest=async(input:Uint8Array<ArrayBuffer>)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',input)),n=>n.toString(16).padStart(2,'0')).join('');
    const key=await digest(encoder.encode(JSON.stringify([workerPath,stored,await digest(encoder.encode(raw))])));
    const health=await fetch('/api/health',{signal:AbortSignal.timeout(3000)});
    if(!health.ok)return;
    const {token}=await health.json();
    if(typeof token!=='string'||!token)return;
    const headers={'X-Zhezhi-Token':token},url='/api/diagram-open-cache/'+key;
    const response=await fetch(url,{headers,cache:'no-store',signal:AbortSignal.timeout(3000)});
    if(!response.ok)return;
    let saved:Orders[]|undefined,prepared=false;
    if(response.status!==204){
      try{
        const value:unknown=await response.json();
        prepared=!!value&&typeof value==='object'&&'preparedDiagram' in value&&value.preparedDiagram===1;
        if(Array.isArray(value)&&value.every(rows=>Array.isArray(rows)&&rows.every(row=>Array.isArray(row)&&row.length===3&&row.slice(0,2).every(f=>Number.isSafeInteger(f)&&f>=0)&&row[0]!==row[1]&&Math.abs(row[2])===1)))saved=value;
      }catch{/* Recreate an unreadable entry from the source. */}
    }
    let parts:string[]|undefined=[];
    let size=2;
    return {saved,prepared,async markPrepared(){
      try{await fetch(url,{method:'POST',headers,body:'{"preparedDiagram":1}',signal:AbortSignal.timeout(3000)});}catch{/* The next open can verify the file again. */}
    },collect(orders:Orders){
      if(!parts)return;
      // A tuple takes at least seven ASCII bytes. Skip an oversized result
      // without serializing it, and release earlier entries when the cap is hit.
      if(size+orders.length*7>entryLimit){parts=undefined;return;}
      const part=JSON.stringify(orders);
      size+=part.length+(parts.length?1:0);
      if(size>entryLimit){parts=undefined;return;}
      parts.push(part);
    },async write(){
      if(!parts?.length)return;
      const body=new Blob(['[',parts.join(','),']'],{type:'application/json'});
      try{await fetch(url,{method:'POST',headers,body,signal:AbortSignal.timeout(3000)});}catch{/* Optional acceleration. */}
    }};
  }catch{return;}
}
