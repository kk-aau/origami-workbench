import {resyncDiagramStepViews,updateDiagramCanvas,updateDiagramCallouts,updateDiagramAnnotations,updateDiagramAnnotationsBatch,type DiagramProject,type DiagramPose} from './diagramProject';
import {prepareDiagramFoldDrawing,refreshDiagramFoldDrawing} from './diagramFoldTransactions';
import type {DiagramAnnotation} from './diagramAnnotations';
import {cleanDiagramAnimationTimings} from './diagramAnimationTiming';
import {diagramPoseView as poseView} from './diagramDrawing';
import {modelProjection} from './modelProjection';
import {isDiagramPaperPulled} from './diagramPaperState';
import {diagramCalloutLocator} from './diagramCallouts';
import type {ModelViewState} from './modelViewState';
import type {Point} from '../core/types';

export function prepareExistingCreases(project:DiagramProject):DiagramProject {
  let next=refreshChangedViewDrawings(resyncDiagramStepViews(project),project);
  const updates:{stepId:string;annotations:DiagramAnnotation[]}[]=[];
  for(const step of next.steps){
    if(!step.foldLink?.enabled||!step.pose||step.pose.sourceStateId!==step.beforeId)continue;
    const after=project.states.find(state=>state.id===step.afterId);
    if(!after?.doc.segments.some(segment=>segment.assignment==='F'))continue;
    try{
      const annotations=cleanDiagramAnimationTimings(prepareDiagramFoldDrawing(next,step.id,undefined,true));
      // A saved drawing may already contain every inherited crease. Preserve
      // its immutable branch instead of committing an identical replacement.
      // Older files still need the first-symbol bookkeeping on first restore.
      const needsSymbolRecord=!step.firstSymbolPlaced&&annotations.some(item=>item.kind==='symbol');
      if(!needsSymbolRecord&&JSON.stringify(annotations)===JSON.stringify(step.annotations??[]))continue;
      updates.push({stepId:step.id,annotations});
    }catch{/* Keep stale model snapshots until the user regenerates them. */}
  }
  try{return updateDiagramAnnotationsBatch(next,updates);}
  catch{
    // Retain the previous per-step recovery behavior if one legacy overlay
    // cannot be committed. Never publish a partially validated batch.
    for(const {stepId,annotations} of updates){try{next=updateDiagramAnnotations(next,stepId,annotations);}catch{/* Keep the saved overlay. */}}
    return next;
  }
}

function reframeConstructionPoints(points:Point[],pose:DiagramPose,from:ModelViewState,to:ModelViewState):Point[]{
  const old=modelProjection(pose.result.geometry.vertices,from.side==='back',from.rotation,from?.projectionCenter),shown=modelProjection(pose.result.geometry.vertices,to.side==='back',to.rotation,to?.projectionCenter),zero=old.project([0,0]);
  return points.map(p=>shown.project(old.unprojectDelta([p[0]-zero[0],p[1]-zero[1]])));
}

/** Reproject material-bound drawing aids when an inherited paper direction changes. */
export function refreshChangedViewDrawings(next:DiagramProject,previous:DiagramProject):DiagramProject {
  if(next.steps===previous.steps)return next;
  const previousSteps=new Map(previous.steps.map(step=>[step.id,step]));
  let result=next;
  for(const step of next.steps){
    const old=previousSteps.get(step.id),pose=step.pose;if(step===old)continue;
    if(!pose||!old?.pose||pose.sourceStateId!==old.pose.sourceStateId||pose.sourceRevision!==old.pose.sourceRevision)continue;
    const from=poseView(old.pose),to=poseView(pose);
    if(from.side===to.side&&from.rotation===to.rotation)continue;
    if(step.canvas?.constructionPoints?.length&&!isDiagramPaperPulled(step))result=updateDiagramCanvas(result,step.id,{...step.canvas,constructionPoints:reframeConstructionPoints(step.canvas.constructionPoints,old.pose,from,to)});
    if(step.callouts?.length)result=updateDiagramCallouts(result,step.id,step.callouts.map(callout=>{
      const locator=diagramCalloutLocator(callout),center=reframeConstructionPoints([locator.center],old.pose!,from,to)[0];
      return {...callout,source:callout.source.kind==='paper'?{...callout.source,center}:{...callout.source,locator:{...locator,center}}};
    }));
    if(step.foldLink?.enabled&&pose.sourceStateId===step.beforeId){try{result=refreshDiagramFoldDrawing(result,step.id,from);}catch{/* Keep stale CP snapshots until they are recalculated. */}}
  }
  return result;
}

