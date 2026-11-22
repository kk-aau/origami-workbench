import {prepareParsedDiagramProject,type DiagramProject} from '../app/diagramProject';
import {openDiagramContactCache} from '../app/diagramOpenContacts';
import {normalizeImportedDiagramCP} from '../app/diagramCP';
import {withDiagramOpenMemo} from '../core/diagramOpenMemo';
import {encodePreparedCaptionEdits,encodePreparedDiagramFile,inspectPreparedDiagram} from '../app/diagramPreparedFile';
import {prepareExistingCreases} from '../app/diagramProjectPreparation';
import type {DiagramProjectImportReply,DiagramProjectImportRequest,DiagramOpenTiming} from '../app/diagramProjectImportTask';
import {artworkTransferChunks} from '../app/artworkImportTransfer';
import {createDiagramProjectSaveBlob} from '../app/diagramProjectTransport';
import {diagramFileName} from '../app/diagramFileName';

const reply=(value:DiagramProjectImportReply)=>self.postMessage(value);
let resumeTransfer:(()=>void)|undefined,started=false;
const isAcknowledgement=(value:DiagramProjectImportRequest):value is {type:'continue-diagram'}=>'type' in value&&value.type==='continue-diagram';
async function publish(project:DiagramProject,mark:(stage:string)=>void,timings:DiagramOpenTiming[],fileName?:string):Promise<void>{
  const storedName=project.name,name=fileName&&diagramFileName(fileName);
  if(name&&storedName!==name)project={...project,name};
  const send=async(value:DiagramProjectImportReply)=>{const acknowledged=new Promise<void>(resolve=>{resumeTransfer=resolve;});reply(value);await acknowledged;};
  // Blob cloning shares immutable bytes. The UI forwards them to its save
  // Worker without another large geometry walk or a main-thread stringify.
  const saveBlob=createDiagramProjectSaveBlob(project);mark('准备入库数据');
  await send({type:'diagram-begin',saveBlob});
  let chunks=0;
  for(const operations of artworkTransferChunks(project))await send({type:'diagram-chunk',index:chunks++,operations});
  mark('分批传输到画布');reply({type:'diagram-complete',chunks,timings,...(project.name!==storedName?{storedName}:{})});
}
self.onmessage=async(event:MessageEvent<DiagramProjectImportRequest>)=>{
  if(isAcknowledgement(event.data)){const resume=resumeTransfer;resumeTransfer=undefined;resume?.();return;}
  try{
    if(started)throw Error('当前折序工程尚未接收完成。');started=true;
    if('edits' in event.data){
      const raw=await event.data.source.text(),receipt=await openDiagramContactCache(raw,false);
      const text=receipt?.prepared?await encodePreparedCaptionEdits(raw,event.data.edits):undefined;
      if(!text){self.postMessage({type:'needs-full-export'});return;}
      const cache=await openDiagramContactCache(text,false);
      await cache?.markPrepared();
      self.postMessage({type:'diagram-file',text,reused:true});return;
    }
    if('project' in event.data){
      const {text,complete}=await encodePreparedDiagramFile(event.data.project);
      if(complete){
        const cache=await openDiagramContactCache(text,false);
        await cache?.markPrepared();
      }
      self.postMessage({type:'diagram-file',text});
      return;
    }
    const timings:DiagramOpenTiming[]=[];let last=performance.now();
    const mark=(stage:string,count?:number)=>{const now=performance.now();timings.push({stage,durationMs:Math.round(now-last),...(count===undefined?{}:{count})});last=now;};
    reply({type:'progress',message:'正在读取工程…'});
    const stored='storedText' in event.data;
    let raw=stored?event.data.storedText:await event.data.text();
    mark('读取工程文本');
    reply({type:'progress',message:'正在解析和校验工程…'});
    const fileName=stored?undefined:event.data.name;
    const decode=():unknown=>{
      let record;
      try{record=JSON.parse(raw);}catch{throw Error('折序工程不是有效 JSON。');}
      mark('解析 JSON');
      if(!stored)return record;
      if(!record||record.format!=='zhezhi-diagram-library-document'||record.version!==1||!record.project||record.thumbnail!==null&&(typeof record.thumbnail!=='string'||record.thumbnail.length>120_000))throw Error('绘图内容格式损坏。');
      return record.project;
    };
    const cache=await openDiagramContactCache(raw,stored);
    mark('查找本机缓存');
    const stage=(name:string,count?:number)=>mark(name==='validate'?'校验工程及几何':'恢复姿态和纸层',count);
    let decoded=decode();
    const file=inspectPreparedDiagram(decoded);
    if(file?.complete&&cache?.prepared){
      mark('直接恢复已保存的步骤、纸层和折痕');
      await publish(file.project,mark,timings,fileName);
      return;
    }
    const originalMatches=file?.complete&&cache&&await file.matches(file.project);
    let project:DiagramProject|undefined;
    if(cache?.saved){
      let index=0;
      const saved=cache.saved;
      try{
        const restored=withDiagramOpenMemo(()=>prepareParsedDiagramProject(decoded,()=>{
          if(index>=saved.length)throw Error('缓存记录不完整。');
          return saved[index++];
        },stage));
        if(index===saved.length)project=restored;
      }catch{/* Retry from freshly decoded, unmodified source data. */}
    }
    const reused=!!project;
    if(cache?.saved&&!project)decoded=decode();
    project??=withDiagramOpenMemo(()=>prepareParsedDiagramProject(decoded,cache?compute=>{
      const contacts=compute();cache.collect(contacts);return contacts;
    }:undefined,stage));
    reply({type:'progress',message:'正在整理折痕和步骤…'});
    const normalized=normalizeImportedDiagramCP(project).project;mark('整理 CP');
    // A changed CP, a repaired snapshot or different geometry invalidates an
    // authored canvas. Otherwise only unresolved legacy overlays need rebuilding.
    const saved=await file?.matchingDrawings(normalized),failed=new Set<string>();
    const next=withDiagramOpenMemo(()=>prepareExistingCreases(normalized,{saved,failed}));
    mark('恢复画布折痕',saved?.size);
    raw='';
    // Compare the verified output to the actual file body as well. A forged
    // digest alone must never promote edited geometry to a verified receipt.
    if(originalMatches&&file&&cache&&!failed.size&&await file.matches(next))await cache.markPrepared();
    else if(!reused)await cache?.write();
    mark('更新本机缓存');
    reply({type:'progress',message:'正在准备工程显示数据…'});
    await publish(next,mark,timings,fileName);
  }catch(error){reply({type:'error',message:error instanceof Error?error.message:String(error)});}
  finally{started=false;}
};
