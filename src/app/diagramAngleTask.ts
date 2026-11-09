import type {Doc,FoldGraph} from '../core/types';
import type {SimulationPose} from '../engine/simPose';
import type {applyDiagramSimulationAngles,DiagramSimulationAngleOptions} from './diagramSimulationAngles';
export function startDiagramAngleTask(doc:Doc):{promise:Promise<FoldGraph>;cancel:()=>void};
export function startDiagramAngleTask(doc:Doc,pose:SimulationPose,options?:DiagramSimulationAngleOptions):{promise:Promise<ReturnType<typeof applyDiagramSimulationAngles>>;cancel:()=>void};
export function startDiagramAngleTask(doc:Doc,pose?:SimulationPose,options?:DiagramSimulationAngleOptions){
 const worker=new Worker(new URL('../workers/diagramAngles.worker.ts',import.meta.url),{type:'module'});let rejectTask:(reason:Error)=>void=()=>{},done=false;
 const promise=new Promise<any>((resolve,reject)=>{rejectTask=reject;worker.onmessage=event=>{if(done)return;done=true;worker.terminate();event.data.ok?resolve(event.data.value):reject(Error(event.data.message));};worker.onerror=event=>{if(done)return;done=true;worker.terminate();reject(Error(event.message||'折角计算失败。'));};worker.postMessage({doc,pose,options});});
 return {promise,cancel(){if(done)return;done=true;worker.terminate();rejectTask(Error('已取消折角计算。'));}};
}
