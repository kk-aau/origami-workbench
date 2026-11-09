import type {Doc} from '../core/types';
import type {SimulationPose} from '../engine/simPose';
import type {prepareDiagramSimulationEditable} from './diagramSimulationEditable';

export function startDiagramSimulationEditable(doc:Doc,pose:SimulationPose){
 const worker=new Worker(new URL('../workers/diagramSimulationEditable.worker.ts',import.meta.url),{type:'module'});let done=false,rejectTask!:(error:Error)=>void;
 const promise=new Promise<ReturnType<typeof prepareDiagramSimulationEditable>>((resolve,reject)=>{
  rejectTask=reject;
  worker.onmessage=event=>{if(done)return;done=true;worker.terminate();event.data.ok?resolve(event.data.value):reject(Error(event.data.message));};
  worker.onerror=event=>{if(done)return;done=true;worker.terminate();reject(Error(event.message||'可编辑立体姿态生成失败。'));};
  worker.postMessage({doc,pose});
 });
 return {promise,cancel(){if(done)return;done=true;worker.terminate();rejectTask(Error('已停止生成可编辑立体姿态。'));}};
}
