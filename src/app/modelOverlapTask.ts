import type {FlatFoldResult} from '../core/types';
import type {ModelOverlapRegions} from './modelOverlapRegions';
import type {ModelLayerRegion} from './modelRegionLayers';
import type {FlatSide} from './flatPresentation';

import type {ModelRegionBoundaries} from './modelRegionBoundaries';
import type {ModelRegionShadows} from './modelRegionShadows';
import {hasCompleteModelSurface} from './modelRenderMode';
import {exactSurfaceIssue,exactSurfacePairIssue,type ExactSurfaceData} from './modelExactSurfaceData';
import {captureFlatSurfaceBinding,flatSurfaceBindingMatches,flatSurfaceBindingValuesMatch,type FlatSurfaceBinding} from './flatExactProof';
export interface ModelSurface {regions:ModelLayerRegion[];boundaries:ModelRegionBoundaries;shadows?:ModelRegionShadows}
export interface ModelOverlapOptions {bothSides?:boolean;shadows?:boolean}
export interface ModelOverlapProgress {stage:'coverage'|'layers'|'boundaries';pass:number;epsilon:number}
export interface ModelOverlapRequest extends ModelOverlapOptions {result:FlatFoldResult;side?:FlatSide}
export type ModelOverlapReply=({status:'complete';analysis:ModelOverlapRegions;regions?:ModelLayerRegion[];boundaries?:ModelRegionBoundaries;shadows?:ModelRegionShadows;opposite?:ModelSurface;exact?:never;exactAnalysis?:never}|({status:'complete';analysis?:never;regions?:never;boundaries?:never;shadows?:never;opposite?:ExactSurfaceData}&ExactSurfaceData))|{status:'error'|'cancelled'|'timeout';message:string};
export interface ModelOverlapTask {promise:Promise<ModelOverlapReply>;cancel():void}

/** A dedicated worker can be terminated even inside synchronous geometry loops. */
export function startModelOverlapAnalysis(result:FlatFoldResult,timeoutMs=Infinity,side?:FlatSide,options:ModelOverlapOptions={}):ModelOverlapTask{
 let worker:Worker|undefined,timer:ReturnType<typeof setTimeout>|undefined,settled=false;
 let resolve!:(reply:ModelOverlapReply)=>void;
 const promise=new Promise<ModelOverlapReply>(r=>resolve=r);
 const finish=(reply:ModelOverlapReply)=>{if(settled)return;settled=true;if(timer!==undefined)clearTimeout(timer);worker?.terminate();resolve(reply);};
 try{
  if(timeoutMs!==Infinity&&(!Number.isFinite(timeoutMs)||timeoutMs<=0))throw new Error('重叠预览计算时限必须为正数，或设为不限时。');
  if(side!==undefined&&side!=='front'&&side!=='back')throw new Error('重叠区域观察方向无效。');
  const binding=captureFlatSurfaceBinding(result),bothSides=Boolean(options.bothSides),shadows=options.shadows!==false;
  worker=new Worker(new URL('../workers/modelOverlap.worker.ts',import.meta.url),{type:'module'});
  worker.onmessage=(event:MessageEvent<ModelOverlapReply|{type:'progress';progress:ModelOverlapProgress}>)=>{
   if(settled)return;
   if(!event.data||typeof event.data!=='object'){finish({status:'error',message:'重叠预览回复格式无效。'});return;}
   if('type' in event.data)return;
   const reply=event.data;
   if(reply.status==='complete'&&(side!==undefined||reply.exact)&&!flatSurfaceBindingMatches(result,binding)){finish({status:'error',message:'当前模型或选中层序在计算期间已改变，未复用旧纸面。'});return;}
   if(reply.status==='complete'&&reply.exact){
    const issue=exactSurfaceIssue(reply,result)||reply.exact.side!==(side??'front')&&'精确纸面回复不是请求的观察方向'
     ||bothSides&&(!reply.opposite?.exact?'精确纸面缺少另一面':exactSurfacePairIssue(reply,reply.opposite,result,side??'front'))
     ||shadows&&(!reply.exact.shadows||bothSides&&!reply.opposite?.exact?.shadows)&&'精确纸面阴影回复不完整';
    if(issue){finish({status:'error',message:String(issue)});return;}
   }
   if(side!==undefined&&reply.status==='complete'&&(!hasCompleteModelSurface(reply)||reply.exact&&exactSurfaceIssue(reply,result))){finish({status:'error',message:'重叠区域显示结果不完整：缺少局部层序或可见边线。'});return;}
   if(bothSides&&reply.status==='complete'&&(!hasCompleteModelSurface(reply.opposite)||reply.exact&&(!reply.opposite?.exact||exactSurfaceIssue(reply.opposite,result))||!reply.exact&&reply.opposite&&'regions' in reply.opposite&&reply.opposite.regions.length!==reply.analysis.cells.length)){finish({status:'error',message:'重叠区域显示结果不完整：缺少另一面的局部层序或可见边线。'});return;}
   finish(reply);
  };
  worker.onerror=event=>finish({status:'error',message:`重叠预览线程异常：${event.message||'未知错误'}`});
  worker.onmessageerror=()=>finish({status:'error',message:'无法读取重叠预览计算结果。'});
  // postMessage takes the synchronous snapshot; do not copy the whole model twice.
  worker.postMessage({result,...(side===undefined?{}:{side}),...options} satisfies ModelOverlapRequest);
  if(!settled&&timeoutMs!==Infinity)timer=setTimeout(()=>finish({status:'timeout',message:'重叠预览计算超时；未修改模型或层序。'}),Math.max(10,Math.min(2_147_483_647,timeoutMs)));
 }catch(e){finish({status:'error',message:`无法启动重叠预览：${e instanceof Error?e.message:String(e)}`});}
 return {promise,cancel:()=>finish({status:'cancelled',message:'已取消重叠预览。'})};
}

interface SharedSurface {task:ModelOverlapTask;users:number;settled:boolean;binding:FlatSurfaceBinding;reply?:ModelOverlapReply}
// Results are immutable React snapshots. A weak cache releases a model with its
// owner and lets front/back panes share geometry, validation and worker transfer.
const sharedSurfaces=new WeakMap<FlatFoldResult,Map<boolean,SharedSurface>>();
/** Reuse the worker's already certified contours without saving the topology
 * in the engineering document or copying it back into a second worker. */
export function rememberCompletedModelSurface(result:FlatFoldResult,reply:ModelOverlapReply):void {
 if(result.layers.status!=='solved'||reply.status!=='complete'||!reply.exact||!reply.opposite?.exact||exactSurfacePairIssue(reply,reply.opposite,result))throw Error('完整纸面缓存与计算结果不一致。');
 if(reply.exact.side==='back')reply={status:'complete',...reply.opposite,opposite:{exact:reply.exact,exactAnalysis:reply.exactAnalysis}};
 const shadows=Boolean(reply.exact.shadows&&reply.opposite!.exact.shadows);
 const task:ModelOverlapTask={promise:Promise.resolve(reply),cancel(){}};
 sharedSurfaces.set(result,new Map([[shadows,{task,users:0,settled:true,binding:captureFlatSurfaceBinding(result),reply}]]));
}
/** Preserve only completed weak-cache entries across an equal history clone.
 * No computation starts and no surface is attached to the saved model. */
export function copyCompletedModelSurface(source:FlatFoldResult,target:FlatFoldResult):void {
 if(source===target)return;const entries=sharedSurfaces.get(source);if(!entries)return;const copied=new Map<boolean,SharedSurface>();
 for(const [shadows,entry]of entries){
  if(!entry.settled||entry.reply?.status!=='complete'||!flatSurfaceBindingMatches(source,entry.binding)||!flatSurfaceBindingValuesMatch(target,entry.binding))continue;
  const reply=entry.reply;if(reply.exact&&(!reply.opposite?.exact||exactSurfacePairIssue(reply,reply.opposite,target,'front')))continue;
  const binding={...entry.binding,layers:target.layers,orders:target.layers.faceOrders,faceOrder:target.layers.faceOrder};
  copied.set(shadows,{task:{promise:Promise.resolve(reply),cancel(){}},users:0,settled:true,binding,reply});
 }
 if(copied.size)sharedSurfaces.set(target,copied);
}
export function acquireModelSurface(result:FlatFoldResult,side:FlatSide,shadows=false):ModelOverlapTask{
 if(side!=='front'&&side!=='back')return {promise:Promise.resolve({status:'error',message:'重叠区域观察方向无效。'}),cancel(){}};
 let entries=sharedSurfaces.get(result);if(!entries){entries=new Map();sharedSurfaces.set(result,entries);}
 for(const [key,entry]of entries)if(!flatSurfaceBindingMatches(result,entry.binding)){if(!entry.settled)entry.task.cancel();entries.delete(key);}
 let entry=entries.get(shadows)||(!shadows?entries.get(true):undefined);
 if(!entry){
   // User calculations wait for complete surfaces at any size. Releasing the
   // last subscriber still terminates synchronous work immediately.
   entry={task:startModelOverlapAnalysis(result,Infinity,'front',{bothSides:true,shadows}),users:0,settled:false,binding:entries.values().next().value?.binding??captureFlatSurfaceBinding(result)};
  entries.set(shadows,entry);const created=entry;
  entry.task.promise.then(reply=>{created.settled=true;created.reply=reply;if(reply.status!=='complete'&&entries.get(shadows)===created)entries.delete(shadows);});
 }
 const current=entry;current.users++;
 let resolve!:(reply:ModelOverlapReply)=>void,released=false,settled=false;
 const promise=new Promise<ModelOverlapReply>(r=>resolve=r);
 current.task.promise.then(reply=>{
  if(settled)return;settled=true;
  if(side==='back'&&reply.status==='complete'&&reply.opposite)resolve(reply.exact?{status:'complete',...(reply.opposite as ExactSurfaceData)}:{status:'complete',analysis:reply.analysis,...reply.opposite});
  else resolve(reply);
 });
 return {promise,cancel(){
  if(released)return;released=true;current.users--;
  if(!settled){settled=true;resolve({status:'cancelled',message:'已取消重叠预览。'});}
  if(!current.users&&!current.settled){
   for(const [key,value] of entries)if(value===current)entries.delete(key);
   current.task.cancel();
  }
 }};
}

/** Draft scheduler: latest input only; cancellation also suppresses queued callbacks.
 * Separate from model/history updates. Dispose with cancel when the overlay unmounts.
 */
export function createModelOverlapPreview(publish:(reply:ModelOverlapReply,ticket:number)=>void,delayMs=80,start:typeof startModelOverlapAnalysis=startModelOverlapAnalysis){
 if(!Number.isFinite(delayMs)||delayMs<0)throw new Error('重叠预览等待时间无效。');
 let serial=0,timer:ReturnType<typeof setTimeout>|undefined,active:ModelOverlapTask|undefined,pending:FlatFoldResult|undefined;
 const cancel=()=>{serial++;pending=undefined;if(timer!==undefined){clearTimeout(timer);timer=undefined;}active?.cancel();active=undefined;};
 return {cancel,submit(result:FlatFoldResult){
  // Replace the waiting draft without moving its deadline. Continuous pointer
  // events therefore cannot postpone all work indefinitely.
  serial++;active?.cancel();active=undefined;pending=structuredClone(result);
  const ticket=serial;if(timer!==undefined)return ticket;
  timer=setTimeout(()=>{
   timer=undefined;const identity=serial,source=pending!;pending=undefined;
   try{
    const task=start(source);active=task;
    task.promise.then(reply=>{if(identity!==serial)return;active=undefined;publish(reply,identity);},e=>{if(identity!==serial)return;active=undefined;publish({status:'error',message:`重叠预览失败：${e instanceof Error?e.message:String(e)}`},identity);});
   }catch(e){if(identity===serial)publish({status:'error',message:`重叠预览失败：${e instanceof Error?e.message:String(e)}`},identity);}
  },delayMs);
  return ticket;
 }};
}
