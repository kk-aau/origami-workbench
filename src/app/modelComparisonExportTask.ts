import type {FlatFoldResult} from '../core/types';
import {copyModelView,type ModelViewState} from './modelViewState';
import {modelViewPanes} from './modelViewPanes';
import {flatPresentation} from './flatPresentation';
import {hasCompleteModelSurface} from './modelRenderMode';
import {startModelShadowAnalysis,type ModelShadowTask} from './modelShadowTask';
import {acquireModelSurface,copyCompletedModelSurface,startModelOverlapAnalysis,type ModelOverlapTask,type ModelOverlapReply} from './modelOverlapTask';
import {foldedModelComparisonSVG,type ModelPaneRegions,type ModelPaneShadows,type ModelExportFraming} from './foldedModelComparisonSVG';

export type ModelComparisonExportReply={status:'complete';svg:string}|{status:'cancelled'|'timeout'|'error';message:string};
export interface ModelComparisonExportTask {promise:Promise<ModelComparisonExportReply>;cancel():void}

/** Captures all inputs before yielding; never publishes intermediate panes or edits the model. */
export function startModelComparisonExport(result:FlatFoldResult,name:string,view:ModelViewState,timeoutMs=Infinity,analyze:typeof startModelShadowAnalysis=startModelShadowAnalysis,framing:ModelExportFraming='full',analyzeRegions:typeof startModelOverlapAnalysis=startModelOverlapAnalysis):ModelComparisonExportTask{
 if(framing!=='full'&&framing!=='camera')throw new Error('模型导出范围无效。');
 const source=structuredClone(result),saved=copyModelView(view);
 copyCompletedModelSurface(result,source);
 if(timeoutMs!==Infinity&&(!Number.isFinite(timeoutMs)||timeoutMs<=0))throw new Error('组合图阴影计算时限必须为正数，或设为不限时。');
 let cancelled=false,active:ModelShadowTask|ModelOverlapTask|undefined;
 const stopped=():ModelComparisonExportReply=>({status:'cancelled',message:'组合图导出已取消，未生成下载文件。'});
 const promise=(async():Promise<ModelComparisonExportReply>=>{
  await Promise.resolve();
  try{
   if(cancelled)return stopped();
   const shadows:ModelPaneShadows={},regions:ModelPaneRegions={};
   for(const pane of modelViewPanes(saved)){
    if(cancelled)return stopped();
    if(saved.displayStyle!=='wire'&&!pane.xray&&!flatPresentation(source,pane.side,saved.rotation).hasOrder&&source.layers.status==='solved'){
     const shared=analyzeRegions===startModelOverlapAnalysis;
     const task=shared?acquireModelSurface(source,pane.side,saved.shadows):analyzeRegions(source,timeoutMs,pane.side);active=task;
     let timer:ReturnType<typeof setTimeout>|undefined,reply:ModelOverlapReply;
     try{
      const timeout=shared&&timeoutMs!==Infinity?new Promise<ModelOverlapReply>(resolve=>{
       const started=performance.now(),arm=()=>{const delay=timeoutMs-(performance.now()-started);if(delay<=0){resolve({status:'timeout',message:'组合图纸面计算超时，未生成下载文件。'});task.cancel();}else timer=setTimeout(arm,Math.min(2_147_483_647,delay));};arm();
      }):undefined;
      reply=await (timeout?Promise.race([task.promise,timeout]):task.promise);
     }finally{if(timer!==undefined)clearTimeout(timer);if(shared)task.cancel();active=undefined;}
     if(cancelled||reply.status==='cancelled')return stopped();
     if(reply.status!=='complete')return {status:reply.status,message:`${pane.label}：${reply.message}`};
     if(!hasCompleteModelSurface(reply))return {status:'error',message:`${pane.label}局部层序或可见边线结果不完整。`};
     if(saved.shadows&&!(reply.exact?reply.exact.shadows:reply.shadows))return {status:'error',message:`${pane.label}局部阴影结果不完整。`};
     regions[pane.key]=reply.exact?{exact:{...reply.exact,shadows:saved.shadows?reply.exact.shadows:undefined},exactAnalysis:reply.exactAnalysis}:{regions:reply.regions,omittedThinRegions:reply.analysis.omittedThinRegions,boundaries:reply.boundaries,shadows:saved.shadows?reply.shadows:undefined};
    }
    if(saved.displayStyle==='wire'||!saved.shadows||pane.xray||!flatPresentation(source,pane.side,saved.rotation).hasOrder)continue;
    active=analyze(source,pane.side,saved.rotation,timeoutMs);
    const reply=await active.promise;active=undefined;
    if(cancelled||reply.status==='cancelled')return stopped();
    if(reply.status!=='complete')return {status:reply.status,message:`${pane.label}：${reply.message}`};
    if(reply.analysis.status!=='ready')return {status:'error',message:`${pane.label}阴影尚未确认，未导出组合图。`};
    shadows[pane.key]=reply.analysis;
   }
   if(cancelled)return stopped();
   return {status:'complete',svg:foldedModelComparisonSVG(source,name,saved,shadows,framing,regions)};
  }catch(error){return {status:'error',message:`组合图导出失败：${error instanceof Error?error.message:String(error)}`};}
  finally{active?.cancel();active=undefined;}
 })();
 return {promise,cancel:()=>{cancelled=true;active?.cancel();}};
}
