import type {FlatFoldResult} from '../core/types';
import {startFlatLayerReanalysis,type FlatFoldTask} from '../core/workerClient';
import {exportDiagramProject,type DiagramPose,type DiagramProject,type DiagramStep} from './diagramProject';
import {applyDiagramStepLayerAnalysis,diagramPaperLayerAnalysisReason,diagramStepLayerAnalysisKey,requestedDiagramLayerSolutionIndex,validDiagramLayerCertificate} from './diagramLayerAnalysis';
import {diagramLocalSurface,diagramLocalSurfaceIssue} from './diagramLocalSurface';
import {validateDiagramSpatialPose} from './diagramSpatialPose';

export interface DiagramLayerDisplayState {status:'ready'|'pending'|'unsupported';key:string|null;message?:string}
export interface DiagramLayerDisplayIssue {stepId:string;message:string}
export interface DiagramLayerDisplayProgress {completed:number;total:number;stepId:string}
export interface DiagramLayerDisplayPreparation {project:DiagramProject;issues:DiagramLayerDisplayIssue[];cancelled:boolean}
export interface DiagramLayerDisplayOptions {stepIds?:readonly string[];timeoutMs?:number;onProgress?:(progress:DiagramLayerDisplayProgress)=>void}

/** Display preparation adds only disposable certificates. Normalize the
 * implicit default candidate before the normal saving boundary so a legacy
 * unknown -> freshly solved candidate zero is not mistaken for a user edit. */
export function diagramLayerDisplaySignature(project:DiagramProject):string {
  const normalize=(pose:DiagramPose):DiagramPose=>pose.layerSolutionIndex===undefined?{...pose,layerSolutionIndex:requestedDiagramLayerSolutionIndex(pose)}:pose;
  const snapshot={...project,steps:project.steps.map(step=>({...step,pose:step.pose?normalize(step.pose):null,...(step.paperStates?{paperStates:{...step.paperStates,
    ...(step.paperStates.flat?{flat:normalize(step.paperStates.flat)}:{}),...(step.paperStates.spatial?{spatial:normalize(step.paperStates.spatial)}:{}),...(step.paperStates.pulled?{pulled:normalize(step.paperStates.pulled)}:{})}}:{})}))};
  return exportDiagramProject(snapshot);
}

function validDisplayOrder(pose:DiagramPose):boolean {
  const count=pose.result.geometry.faces.length,order=pose.displayOrder;
  return !!order&&order.length===count&&new Set(order).size===count&&order.every(face=>Number.isSafeInteger(face)&&face>=0&&face<count);
}
function illustrationDisplay(step:DiagramStep):boolean {
  const pose=step.pose!;
  // These are explicit illustration choices. Layer preparation must not turn
  // an X-ray, sculpted material, or a torn inspection window into opaque paper.
  return !!pose.view?.xray||validDisplayOrder(pose)||!!diagramPaperLayerAnalysisReason(pose)||
    !!step.annotations?.some(annotation=>annotation.kind==='symbol'&&annotation.symbol==='tearWindow'&&annotation.cutawayFaces?.length);
}

/** Cheap readiness for the rail. No solving or polygon partitioning happens
 * during render; preparation validates the local surface outside that path. */
export function diagramLayerDisplayState(project:DiagramProject,stepId:string):DiagramLayerDisplayState {
  const step=project.steps.find(step=>step.id===stepId);
  if(!step)return {status:'unsupported',key:null,message:'指定的折序步骤不存在。'};
  const pose=step.pose;
  if(!pose||step.paperVisible===false)return {status:'ready',key:null};
  if(pose.spatial){
    // A saved spatial pose is already solved in world coordinates. Sending
    // its foreshortened projection to the flat solver would change its depth.
    try{
      validateDiagramSpatialPose(pose);
      const source=project.states.find(state=>state.id===pose.sourceStateId);
      if(!source||source.revision!==pose.sourceRevision||JSON.stringify(source.doc)!==JSON.stringify(pose.sourceDoc)||pose.result.geometry.status!=='ready'||pose.result.layers.status!=='solved'||!validDiagramLayerCertificate(pose.result,pose))throw Error();
      return {status:'ready',key:null};
    }catch{return {status:'unsupported',key:null,message:'空间纸层顺序须随真实折角与视角重新计算，请进入该步骤重新计算空间姿态。'};}
  }
  if(illustrationDisplay(step))return {status:'ready',key:null};
  const key=diagramStepLayerAnalysisKey(project,stepId);
  if(!key)return {status:'unsupported',key:null,message:'保存的纸面或来源 CP 已变化，无法直接恢复显示层序；请进入该步骤重新计算。'};
  const layers=pose.result.layers;
  const solved=layers.status==='solved'&&validDiagramLayerCertificate(pose.result,pose)&&
    (layers.solutionIndex??0)===requestedDiagramLayerSolutionIndex(pose);
  return {status:solved?'ready':'pending',key,...(!solved?{message:'正在准备纸面遮挡层序。'}:{})};
}

interface CachedCertificate {layers:FlatFoldResult['layers'];bytes:number}
const certificates=new Map<string,CachedCertificate>();
let cacheBytes=0;
const MAX_CACHE_ENTRIES=16,MAX_CACHE_BYTES=8_000_000;
function cached(key:string):FlatFoldResult['layers']|undefined {
  const entry=certificates.get(key);if(!entry)return;
  certificates.delete(key);certificates.set(key,entry);return structuredClone(entry.layers);
}
function remember(key:string,result:FlatFoldResult):void {
  const layers=structuredClone(result.layers),bytes=(key.length+JSON.stringify(layers).length)*2;
  if(bytes>MAX_CACHE_BYTES)return;
  const previous=certificates.get(key);if(previous){cacheBytes-=previous.bytes;certificates.delete(key);}
  certificates.set(key,{layers,bytes});cacheBytes+=bytes;
  while(certificates.size>MAX_CACHE_ENTRIES||cacheBytes>MAX_CACHE_BYTES){
    const oldest=certificates.keys().next().value!;cacheBytes-=certificates.get(oldest)!.bytes;certificates.delete(oldest);
  }
}

/** Runtime-only fresh certificates can be reused after reopening a snapshot.
 * Persisted certificates are still cleared by the project import contract. */
export function reuseDiagramLayerDisplay(project:DiagramProject,stepIds:readonly string[]=project.steps.map(step=>step.id)):DiagramProject {
  let next=project;
  for(const stepId of new Set(stepIds)){
    const state=diagramLayerDisplayState(next,stepId);if(state.status!=='pending'||!state.key)continue;
    const layers=cached(state.key),pose=next.steps.find(step=>step.id===stepId)?.pose;
    if(layers&&pose)next=applyDiagramStepLayerAnalysis(next,stepId,state.key,{...pose.result,layers});
  }
  return next;
}

function localDisplayIssue(step:DiagramStep):string|undefined {
  const pose=step.pose;
  if(!pose||step.paperVisible===false)return;
  if(pose.spatial){
    try{validateDiagramSpatialPose(pose,true);return;}
    catch(error){return '空间纸面姿态需要重新计算。'+(error instanceof Error?error.message:'空间姿态验证失败。');}
  }
  if(illustrationDisplay(step))return;
  const count=pose.result.geometry.faces.length,global=pose.result.layers.faceOrder;
  if(global&&global.length===count&&new Set(global).size===count)return;
  if(pose.paperDeformation?.nodes.length)return;
  const surface=diagramLocalSurface(pose),issue=diagramLocalSurfaceIssue(pose);
  if(issue)return issue;
  if(!surface)return '该步骤的局部遮挡尚未准备完成。';
  if(surface.regions.some(region=>region.layers.status!=='ordered'))return '该步骤存在未确认或冲突的局部层序，请先调整纸层顺序。';
}

/** Analyse each selected saved geometry in a worker before thumbnails/exports
 * consume it. The captured snapshot is isolated from live edits. Cancellation
 * terminates the active worker, discards partial results, and never fills the
 * shared cache with an answer received after cancellation. */
export function startDiagramLayerDisplayPreparation(project:DiagramProject,options:DiagramLayerDisplayOptions={}):{promise:Promise<DiagramLayerDisplayPreparation>;cancel():void} {
  const ids=[...new Set(options.stepIds??project.steps.map(step=>step.id))],selected=new Set(ids),states=new Set<string>();
  const steps=project.steps.map(step=>{
    if(!selected.has(step.id))return step;
    states.add(step.beforeId);states.add(step.afterId);if(step.pose)states.add(step.pose.sourceStateId);
    return structuredClone(step);
  });
  const snapshot={...project,steps,states:project.states.map(state=>states.has(state.id)?structuredClone(state):state)};
  let cancelled=false,active:FlatFoldTask|undefined;
  const promise=(async():Promise<DiagramLayerDisplayPreparation>=>{
    let next=snapshot;const issues:DiagramLayerDisplayIssue[]=[];
    for(let index=0;index<ids.length;index++){
      if(cancelled)break;
      const stepId=ids[index];let state=diagramLayerDisplayState(next,stepId),issue:string|undefined;
      if(state.status==='unsupported')issue=state.message;
      else if(state.status==='pending'&&state.key){
        const pose=next.steps.find(step=>step.id===stepId)!.pose!,key=state.key;
        let result:FlatFoldResult;
        const reused=cached(key);
        if(reused)result={...pose.result,layers:reused};
        else{
          active=startFlatLayerReanalysis(pose.result,{timeoutMs:options.timeoutMs??15_000,solutionIndex:requestedDiagramLayerSolutionIndex(pose),constraints:pose.result.layers.constraints});
          result=await active.promise;active=undefined;
        }
        if(cancelled)break;
        if(result.layers.status!=='solved')issue=result.layers.message||'纸面层序分析未完成，请重试。';
        else{
          const merged=applyDiagramStepLayerAnalysis(next,stepId,key,result);
          if(merged===next)issue='纸面层序结果与保存的几何或所选方案不一致，未采用该结果。';
          else{
            next=merged;state=diagramLayerDisplayState(next,stepId);
            issue=state.status==='ready'?localDisplayIssue(next.steps.find(step=>step.id===stepId)!):state.message??'纸面层序尚未确认。';
            if(!issue&&!reused)remember(key,result);
          }
        }
      }else if(state.status==='ready')issue=localDisplayIssue(next.steps.find(step=>step.id===stepId)!);
      if(issue)issues.push({stepId,message:issue});
      if(!cancelled)options.onProgress?.({completed:index+1,total:ids.length,stepId});
    }
    return cancelled?{project,issues:[],cancelled:true}:{project:next,issues,cancelled:false};
  })();
  return {promise,cancel(){cancelled=true;active?.cancel();}};
}
