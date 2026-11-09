import type {FlatFoldResult} from '../core/types';
import {startFlatLayerReanalysis,type FlatFoldTask} from '../core/workerClient';
import {foldedModelSVG} from './foldedModelSVG';
import {flatPresentation,type FlatSide} from './flatPresentation';
import {hasCompleteModelSurface} from './modelRenderMode';
import {startModelOverlapAnalysis} from './modelOverlapTask';
import type {ModelSurfaceData} from './modelRegionSVG';
import {validateModelColors,type ModelColors} from './modelColors';
import {startModelShadowAnalysis} from './modelShadowTask';
import type {ModelShadowBoundaries} from './modelShadowBoundaries';
import type {ModelDisplayStyle} from './modelViewState';

export interface LayerBatchItem {index:number;svg:string}
export interface LayerBatchResult {
  status:'completed'|'exhausted'|'cancelled'|'timeout'|'error'|'size-limit';
  message:string;
  startIndex:number;
  requested:number;
  items:LayerBatchItem[];
}
interface BatchOptions {
  name:string;side:FlatSide;xray?:boolean;rotation?:number;colors?:ModelColors;shadows?:boolean;antiAlias?:boolean;displayNumbers?:boolean;displayStyle?:ModelDisplayStyle;
  /** Zero based; default starts after current solved candidate, like original AS100. */
  startIndex?:number;count?:number;timeoutMs?:number;
  onProgress?:(progress:{completed:number;requested:number;index:number})=>void;
}
type Solver=(input:FlatFoldResult,options:{solutionIndex:number;timeoutMs?:number})=>FlatFoldTask;

/** Each candidate is isolated and cancellable. Never updates the editor's active model. */
export function startLayerBatch(input:FlatFoldResult,options:BatchOptions,solve:Solver=startFlatLayerReanalysis,analyzeShadows:typeof startModelShadowAnalysis=startModelShadowAnalysis,analyzeRegions:typeof startModelOverlapAnalysis=startModelOverlapAnalysis):{promise:Promise<LayerBatchResult>;cancel:()=>void}{
  const source=structuredClone(input),startIndex=options.startIndex??((input.layers.solutionIndex??-1)+1),count=options.count??100;
  if(input.geometry.status!=='ready')throw new Error('请先生成有效的模型几何。');
  if(!Number.isSafeInteger(startIndex)||startIndex<0||!Number.isInteger(count)||count<1||count>100||!Number.isSafeInteger(startIndex+count))throw new Error('批量范围无效：起始编号须有效，每批为 1—100 个候选。');
  if(options.side!=='front'&&options.side!=='back')throw new Error('批量输出方向无效。');
  if(options.rotation!==undefined&&!Number.isFinite(options.rotation))throw new Error('批量输出旋转角度无效。');
  if(options.colors!==undefined)validateModelColors(options.colors);
  if(options.shadows!==undefined&&typeof options.shadows!=='boolean')throw new Error('批量阴影设置必须为布尔值。');
  if(options.antiAlias!==undefined&&typeof options.antiAlias!=='boolean')throw new Error('批量抗锯齿设置必须为布尔值。');
  if(options.displayNumbers!==undefined&&typeof options.displayNumbers!=='boolean')throw new Error('批量编号设置必须为布尔值。');
  if(options.displayStyle!==undefined&&!['paper','wire'].includes(options.displayStyle))throw new Error('批量显示样式无效。');
  if(options.timeoutMs!==undefined&&options.timeoutMs!==Infinity&&(!Number.isFinite(options.timeoutMs)||options.timeoutMs<=0))throw new Error('批量计算时限必须为正数，或设为不限时。');
  // Snapshot nested presentation options too; changes cannot retarget an active batch.
  const config={...options,timeoutMs:options.timeoutMs??Infinity,...(options.colors?{colors:structuredClone(options.colors)}:{})},items:LayerBatchItem[]=[];
  let cancelled=false,active:{cancel():void}|undefined,bytes=0;
  const finish=(status:LayerBatchResult['status'],message:string):LayerBatchResult=>({status,message,startIndex,requested:count,items});
  const promise=(async()=>{
    // Caller receives the task before the first worker starts, so immediate cancel is effective.
    await Promise.resolve();
    try{
      for(let index=startIndex;index<startIndex+count;index++){
        if(cancelled)return finish('cancelled','批量计算已取消，已完成的结果图保留。');
        const solver=solve(source,{solutionIndex:index,timeoutMs:config.timeoutMs});active=solver;
        const result=await solver.promise;active=undefined;
        if(cancelled||result.layers.status==='cancelled')return finish('cancelled','批量计算已取消，已完成的结果图保留。');
        if(result.layers.status==='timeout')return finish('timeout',`第 ${index+1} 解计算超时，保留此前结果；超时不代表无解。`);
        const exact=result.layers.solutionCountExact;
        const total=exact&&/^\d+$/.test(exact)?BigInt(exact):undefined;
        if(total!==undefined&&BigInt(index)>=total)return finish('exhausted','当前引擎的候选已取完。');
        if(result.layers.status!=='solved'||result.layers.solutionIndex!==index)return finish('error',`第 ${index+1} 解未完成：${result.layers.message}`);
        if(JSON.stringify(result.geometry.vertices)!==JSON.stringify(source.geometry.vertices)||JSON.stringify(result.geometry.faces)!==JSON.stringify(source.geometry.faces))return finish('error','候选求解改变了模型几何，已停止批量输出。');
        let shadows:ModelShadowBoundaries|undefined;
        let regions:ModelSurfaceData|undefined;
        const hasOrder=flatPresentation(result,config.side,config.rotation).hasOrder;
        if(config.displayStyle!=='wire'&&!config.xray&&!hasOrder){
          const task=analyzeRegions(result,config.timeoutMs,config.side);active=task;
          const reply=await task.promise;active=undefined;
          if(cancelled||reply.status==='cancelled')return finish('cancelled','批量局部层序计算已取消，已完成的结果图保留。');
          if(reply.status!=='complete')return finish(reply.status,`第 ${index+1} 解局部层序未完成：${reply.message}`);
          if(!hasCompleteModelSurface(reply))return finish('error',`第 ${index+1} 解局部层序或可见边线结果不完整，已保留此前结果。`);
          if(config.shadows&&!(reply.exact?reply.exact.shadows:reply.shadows))return finish('error',`第 ${index+1} 解局部阴影结果不完整。`);
          regions=reply.exact?{exact:{...reply.exact,shadows:config.shadows?reply.exact.shadows:undefined},exactAnalysis:reply.exactAnalysis}:{regions:reply.regions,omittedThinRegions:reply.analysis.omittedThinRegions,boundaries:reply.boundaries,shadows:config.shadows?reply.shadows:undefined};
        }
        if(config.displayStyle!=='wire'&&config.shadows&&!config.xray&&hasOrder){
          const task=analyzeShadows(result,config.side,config.rotation??0,config.timeoutMs);active=task;
          const reply=await task.promise;active=undefined;
          if(cancelled||reply.status==='cancelled')return finish('cancelled','批量阴影计算已取消，已完成的结果图保留。');
          if(reply.status!=='complete')return finish(reply.status,`第 ${index+1} 解阴影未完成：${reply.message}`);
          if(reply.analysis.status!=='ready')return finish('error',`第 ${index+1} 解阴影需要已确认的统一层序，已保留此前结果。`);
          shadows=reply.analysis;
        }
        const svg=foldedModelSVG(result,{name:config.name,side:config.side,xray:config.xray,rotation:config.rotation,colors:config.colors,shadows,antiAlias:config.antiAlias,displayNumbers:config.displayNumbers,displayStyle:config.displayStyle,regions});
        bytes+=new TextEncoder().encode(svg).byteLength;
        if(bytes>64_000_000)return finish('size-limit','本批结果图达到 64 MB 内存预算，已保留此前结果；请分批输出。');
        items.push({index,svg});config.onProgress?.({completed:items.length,requested:count,index});
        if(cancelled)return finish('cancelled','批量计算已取消，已完成的结果图保留。');
        if(total!==undefined&&BigInt(index+1)>=total)return finish('exhausted','当前引擎的候选已取完。');
      }
      return finish('completed','已完成请求范围的候选结果图；这不代表全部候选已取完。');
    }catch(e){return finish('error',`批量计算未完成：${e instanceof Error?e.message:String(e)}`);}
    finally{active?.cancel();active=undefined;}
  })();
  return {promise,cancel:()=>{cancelled=true;active?.cancel();}};
}
