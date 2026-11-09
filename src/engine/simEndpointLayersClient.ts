import type {FoldGraph} from '../core/types';
import type {SimulationLayerOrder} from './simLayerOrder';

/** Closing/reloading the simulator terminates even a busy layer solver. */
export function startSimulationEndpointLayers(fold:FoldGraph){
  let worker:Worker|undefined,settled=false;
  let resolve!:(value:SimulationLayerOrder|null)=>void,reject!:(error:Error)=>void;
  const promise=new Promise<SimulationLayerOrder|null>((done,fail)=>{resolve=done;reject=fail;});
  const fail=(error:Error)=>{if(settled)return;settled=true;worker?.terminate();reject(error);};
  try{
    worker=new Worker(new URL('../workers/simEndpointLayers.worker.ts',import.meta.url),{type:'module'});
    worker.onmessage=(event:MessageEvent<{order:SimulationLayerOrder|null;error?:string}>)=>{
      if(settled)return;
      if(event.data.error){fail(new Error(event.data.error));return;}
      settled=true;worker?.terminate();resolve(event.data.order);
    };
    worker.onerror=()=>fail(new Error('平折显示层序计算线程异常。'));
    worker.onmessageerror=()=>fail(new Error('无法读取平折显示层序。'));
    worker.postMessage(fold);
  }catch(error){fail(error instanceof Error?error:new Error('无法启动平折显示层序计算。'));}
  return {promise,cancel:()=>fail(new DOMException('模拟已关闭，层序计算已取消。','AbortError'))};
}
