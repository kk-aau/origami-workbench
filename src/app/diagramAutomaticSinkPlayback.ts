import type {DiagramCPState,DiagramPose,DiagramProject,DiagramStep} from './diagramProject';
import {diagramFoldStartingFace} from './diagramFoldLink';
import {spatialFaceMatrix} from './diagramSpatialPose';
import {findAutomaticSinkPattern,isDiagramSinkDisplayStep,type AutomaticSinkPattern,type createAutomaticSinkGuide} from './diagramSinkGuide';

export interface AutomaticSinkOperation {index:number;pattern:AutomaticSinkPattern}

/** A finished illustration with unchanged CP may replay the preceding fold. */
export function automaticSinkOperation(project:DiagramProject,stepId:string):AutomaticSinkOperation|undefined {
  const selected=project.steps.findIndex(s=>s.id===stepId);
  if(selected<0)return;
  const step=project.steps[selected],a=project.states[selected],b=project.states[selected+1];
  if(!a||!b||step.beforeId!==a.id||step.afterId!==b.id)return;
  const direct=findAutomaticSinkPattern(a.doc,b.doc);
  if(direct)return {index:selected,pattern:direct};
  if(!selected)return;
  const previous=project.steps[selected-1],before=project.states[selected-1];
  if(previous.beforeId!==before.id||previous.afterId!==a.id)return;
  const pattern=findAutomaticSinkPattern(before.doc,a.doc);
  if(pattern&&isDiagramSinkDisplayStep(step,a,b))return {index:selected-1,pattern};
}

/** Two playback legs share the computed pose. No state is inserted in the user's drawing. */
export function buildAutomaticSinkPlaybackProject(project:DiagramProject,index:number,guide:ReturnType<typeof createAutomaticSinkGuide>):DiagramProject {
  const first=project.steps[index],before=project.states[index],after=project.states[index+1];
  const state:DiagramCPState={id:crypto.randomUUID(),doc:guide.doc,revision:0};
  const pose:DiagramPose={...guide.pose,sourceDoc:guide.doc,sourceStateId:state.id,sourceRevision:state.revision,
    ...(first.pose?.view?{view:first.pose.view}:{})};
  const fixed=first.foldLink?.fixed;
  const anchorFace=fixed?diagramFoldStartingFace(guide.doc,fixed):undefined;
  const closing:DiagramStep={id:crypto.randomUUID(),beforeId:state.id,afterId:after.id,title:'向内沉折',description:'',
    pose,paperStates:{active:'spatial',spatial:pose},canvas:first.canvas,
    ...(fixed&&anchorFace!==undefined?{foldLink:{enabled:true,layers:'all',selectedFaces:[],fixed:{point:fixed.point,
      matrix:spatialFaceMatrix(guide.pose.spatial,anchorFace),spatialTransform:guide.pose.spatial.faceTransforms[anchorFace]}}}:{})};
  const opening:DiagramStep={id:first.id,beforeId:before.id,afterId:state.id,title:'撑开纸层',description:first.description,
    pose:first.pose,paperStates:first.paperStates,canvas:first.canvas,
    ...(fixed?{foldLink:{enabled:true,layers:'all',selectedFaces:[],fixed}}:{})};
  const steps=[opening,closing],states=[before,state,after],following=project.steps[index+1];
  if(following?.beforeId===after.id){
    steps.push(following);states.push(project.states[index+2]);
  }
  return {format:project.format,version:project.version,name:project.name,activeStepId:first.id,steps,states,basicSettings:project.basicSettings};
}
