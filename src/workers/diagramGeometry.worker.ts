import {diagramGeometryOperations,type DiagramGeometryKind} from '../app/diagramGeometryOperations';
import {setDiagramWorkReporter,flushDiagramWork} from '../app/diagramWork';
self.onmessage=(event:MessageEvent<{kind:DiagramGeometryKind;args:never[]}>)=>{
  try{
    setDiagramWorkReporter(operations=>self.postMessage({type:'progress',operations}));
    const run=diagramGeometryOperations[event.data.kind] as (...args:never[])=>unknown;
    const value=run(...event.data.args);flushDiagramWork();self.postMessage({type:'result',value});
  }catch(error){self.postMessage({type:'error',message:error instanceof Error?error.message:String(error)});}
};
