import {parentPort} from 'node:worker_threads';
import {register} from 'tsx/esm/api';
register();
const {diagramGeometryOperations}=await import('../../src/app/diagramGeometryOperations.ts');
const {setDiagramWorkReporter}=await import('../../src/app/diagramWork.ts');
parentPort.on('message',({kind,args})=>{
  try{
    setDiagramWorkReporter(operations=>parentPort.postMessage({type:'progress',operations}));
    const value=diagramGeometryOperations[kind](...args);
    parentPort.postMessage({type:'result',value});
  }catch(error){parentPort.postMessage({type:'error',message:error.message});}
});
