import {importDiagramProject,type DiagramProject} from '../app/diagramProject';
import {normalizeDiagramProjectCP} from '../app/diagramCP';
import {prepareExistingCreases} from '../app/diagramProjectPreparation';
import type {DiagramProjectImportReply,DiagramProjectImportRequest} from '../app/diagramProjectImportTask';
import {artworkTransferChunks} from '../app/artworkImportTransfer';
import {createDiagramProjectSaveBlob} from '../app/diagramProjectTransport';

const reply=(value:DiagramProjectImportReply)=>self.postMessage(value);
let resumeTransfer:(()=>void)|undefined,started=false;
const isAcknowledgement=(value:DiagramProjectImportRequest):value is {type:'continue-diagram'}=>'type' in value&&value.type==='continue-diagram';
async function publish(project:DiagramProject):Promise<void>{
  const send=async(value:DiagramProjectImportReply)=>{const acknowledged=new Promise<void>(resolve=>{resumeTransfer=resolve;});reply(value);await acknowledged;};
  // Blob cloning shares immutable bytes. The UI forwards them to its save
  // Worker without another large geometry walk or a main-thread stringify.
  await send({type:'diagram-begin',saveBlob:createDiagramProjectSaveBlob(project)});
  let chunks=0;
  for(const operations of artworkTransferChunks(project))await send({type:'diagram-chunk',index:chunks++,operations});
  reply({type:'diagram-complete',chunks});
}
self.onmessage=async(event:MessageEvent<DiagramProjectImportRequest>)=>{
  if(isAcknowledgement(event.data)){const resume=resumeTransfer;resumeTransfer=undefined;resume?.();return;}
  try{
    if(started)throw Error('当前折序工程尚未接收完成。');started=true;
    reply({type:'progress',message:'正在读取工程…'});
    const stored='storedText' in event.data;
    let raw=stored?event.data.storedText:await event.data.text();
    reply({type:'progress',message:'正在解析和校验工程…'});
    if(stored){
      const record=JSON.parse(raw);
      if(!record||record.format!=='zhezhi-diagram-library-document'||record.version!==1||!record.project||record.thumbnail!==null&&(typeof record.thumbnail!=='string'||record.thumbnail.length>120_000))throw Error('绘图内容格式损坏。');
      raw=JSON.stringify(record.project);
    }
    const project=importDiagramProject(raw);
    reply({type:'progress',message:'正在整理折痕和步骤…'});
    const next=prepareExistingCreases(normalizeDiagramProjectCP(project).project);
    raw='';
    reply({type:'progress',message:'正在准备工程显示数据…'});
    await publish(next);
  }catch(error){reply({type:'error',message:error instanceof Error?error.message:String(error)});}
  finally{started=false;}
};
