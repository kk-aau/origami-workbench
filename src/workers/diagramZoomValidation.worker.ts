import {exportDiagramProject,type DiagramProject} from '../app/diagramProject';

self.onmessage=(event:MessageEvent<DiagramProject>)=>{
  try{
    self.postMessage({type:'progress',message:'正在校验工程与放大选区…'});
    // Same validation and serialization as the original confirmation path.
    // No CP normalization, fold calculation or project mutation is introduced.
    exportDiagramProject(event.data);
    self.postMessage({type:'complete'});
  }catch(error){self.postMessage({type:'error',message:error instanceof Error?error.message:String(error)});}
};
