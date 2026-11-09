import type {FlatFoldResult} from '../core/types';
import type {FlatSide} from './flatPresentation';
import type {ModelShadowBoundaries} from './modelShadowBoundaries';

export interface ModelShadowRequest {result:FlatFoldResult;side:FlatSide;rotation:number}
export type ModelShadowReply = {status:'complete';analysis:ModelShadowBoundaries}
  | {status:'error'|'cancelled'|'timeout';message:string};
export interface ModelShadowTask {promise:Promise<ModelShadowReply>;cancel():void}

/** Dedicated worker: terminate also interrupts synchronous planarization/coverage loops. */
export function startModelShadowAnalysis(result:FlatFoldResult,side:FlatSide,rotation=0,timeoutMs=Infinity):ModelShadowTask{
  let worker:Worker|undefined,timer:ReturnType<typeof setTimeout>|undefined,settled=false;
  let resolve!:(reply:ModelShadowReply)=>void;
  const promise=new Promise<ModelShadowReply>(r=>{resolve=r;});
  const finish=(reply:ModelShadowReply)=>{
    if(settled)return;
    settled=true;
    if(timer!==undefined)clearTimeout(timer);
    worker?.terminate();
    resolve(reply);
  };
  try{
    if(!Number.isFinite(rotation))throw new Error('模型旋转角度必须为有限数值。');
    if(timeoutMs!==Infinity&&(!Number.isFinite(timeoutMs)||timeoutMs<=0))throw new Error('阴影计算时限必须为正数，或设为不限时。');
    if(side!=='front'&&side!=='back')throw new Error('模型观察方向无效。');
    worker=new Worker(new URL('../workers/modelShadow.worker.ts',import.meta.url),{type:'module'});
    worker.onmessage=(event:MessageEvent<ModelShadowReply>)=>finish(event.data);
    worker.onerror=event=>finish({status:'error',message:`阴影计算线程异常：${event.message||'未知错误'}`});
    worker.onmessageerror=()=>finish({status:'error',message:'无法读取阴影计算线程的结果。'});
    // Clone explicitly so pending work never observes later edits to the model/view.
    worker.postMessage(structuredClone({result,side,rotation} satisfies ModelShadowRequest));
    if(!settled&&timeoutMs!==Infinity)timer=setTimeout(()=>finish({status:'timeout',message:'纸层阴影计算超时，未改变模型或层序。'}),Math.max(10,Math.min(2_147_483_647,timeoutMs)));
  }catch(error){
    finish({status:'error',message:`无法启动阴影分析：${error instanceof Error?error.message:String(error)}`});
  }
  return {promise,cancel:()=>finish({status:'cancelled',message:'已取消纸层阴影计算。'})};
}
