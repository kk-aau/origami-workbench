import {importDiagramProject} from '../app/diagramProject';
import {normalizeDiagramProjectCP} from '../app/diagramCP';
import {prepareExistingCreases} from '../app/diagramProjectPreparation';
import type {DiagramProjectImportReply} from '../app/diagramProjectImportTask';

const reply=(value:DiagramProjectImportReply)=>self.postMessage(value);
self.onmessage=async(event:MessageEvent<File>)=>{
  try{
    reply({type:'progress',message:'正在读取工程…'});
    const raw=await event.data.text();
    reply({type:'progress',message:'正在解析和校验工程…'});
    const project=importDiagramProject(raw);
    reply({type:'progress',message:'正在整理折痕和步骤…'});
    const next=prepareExistingCreases(normalizeDiagramProjectCP(project).project);
    reply({type:'result',project:next});
  }catch(error){reply({type:'error',message:error instanceof Error?error.message:String(error)});}
};
