import type {FoldGraph,FlatFoldResult} from '../core/types';
import type {SimulationStepAnimation} from './simStepAnimation';

export interface SimulationStepPlanningResult {animation:SimulationStepAnimation;checkedIntervals:number;method:string;warnings?:string[];fold?:FoldGraph}
export interface SimulationStepPlanningTask {promise:Promise<SimulationStepPlanningResult>;cancel():void}

/** One worker per preview: closing the dialog also stops CPU-bound path search. */
export function startSimulationStepPlanning(fold:FoldGraph,animation:SimulationStepAnimation,options:{timeoutMs?:number;onProgress?:(message:string)=>void;initialGeometry?:FlatFoldResult;initialContactOrder?:import('./simStepContactOrder').SimulationStepInitialOrder}={}):SimulationStepPlanningTask{
  let worker:Worker|undefined,timer:ReturnType<typeof setTimeout>|undefined,settled=false;
  let resolve!:(value:SimulationStepPlanningResult)=>void,reject!:(reason:Error)=>void;
  const promise=new Promise<SimulationStepPlanningResult>((done,fail)=>{resolve=done;reject=fail;});
  const cleanup=()=>{if(timer)clearTimeout(timer);worker?.terminate();};
  const fail=(error:Error)=>{if(settled)return;settled=true;cleanup();reject(error);};
  try{
    worker=new Worker(new URL('../workers/simStepPlanning.worker.ts',import.meta.url),{type:'module'});
    worker.onmessage=(event:MessageEvent<{type:'progress'|'result'|'error';message?:string;result?:SimulationStepPlanningResult}>)=>{
      if(settled)return;
      if(event.data.type==='progress'){options.onProgress?.(event.data.message??'正在检查纸层运动…');return;}
      if(event.data.type==='error'||!event.data.result){fail(new Error(event.data.message??'未能生成这一步的折叠路径。'));return;}
      settled=true;cleanup();resolve(event.data.result);
    };
    worker.onerror=()=>fail(new Error('折叠路径计算遇到错误，请重新打开动画或简化本步动作。'));
    worker.onmessageerror=()=>fail(new Error('无法读取折叠路径计算结果，请重新打开动画。'));
    worker.postMessage({fold,animation,initialGeometry:options.initialGeometry,initialContactOrder:options.initialContactOrder});
    if(options.timeoutMs!==undefined&&Number.isFinite(options.timeoutMs)&&options.timeoutMs>0)timer=setTimeout(()=>fail(new Error('已达到指定的路径检查等待时限。')),Math.max(100,options.timeoutMs));
  }catch{fail(new Error('无法启动折叠路径计算，请重新打开动画。'));}
  return {promise,cancel:()=>fail(new DOMException('已关闭步骤动画，路径计算取消。','AbortError'))};
}
