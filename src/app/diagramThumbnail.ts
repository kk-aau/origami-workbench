import type {DiagramCPState,DiagramStep} from './diagramProject';
import type {DiagramFoldPreviewSegment} from './diagramFoldLinkTypes';
import type {DiagramLineDefaults} from './diagramLineStyles';
import type {DiagramZoomRegion} from './diagramZoomGeometry';
import {drawingSVG} from './diagramDrawing';
import {projectDiagramFoldCP} from './diagramFoldLink';
import {diagramCalloutCPMarkup} from './diagramCalloutSVG';
import {defaultCreaseDisplay} from './creaseDisplay';

export interface DiagramThumbnailOptions {
  lineDefaults:DiagramLineDefaults;
  adaptiveLines:boolean;
  zoom?:DiagramZoomRegion|null;
}

/** Thumbnails are the same illustration as the authored SVG. Only their output
 * pixel size differs; paper visibility, local surfaces, masks and exterior
 * action symbols must not gain a separate interpretation in the step rail. */
export function diagramThumbnailSVG(step:DiagramStep,states:readonly DiagramCPState[],options:DiagramThumbnailOptions):string {
  const before=states.find(state=>state.id===step.beforeId),after=states.find(state=>state.id===step.afterId),pose=step.pose;
  let preview:DiagramFoldPreviewSegment[]|undefined;
  if(step.paperVisible!==false&&step.foldLink?.enabled&&pose&&before&&after&&pose.sourceStateId===before.id&&pose.sourceRevision===before.revision&&JSON.stringify(pose.sourceDoc)===JSON.stringify(before.doc)){
    try{preview=projectDiagramFoldCP(pose,before.doc,after.doc,before,step.foldLink.precreases).preview;}
    catch{/* A stale or intentionally independent illustration remains usable. */}
  }
  const cpMarkup=(stateId:string,sourceUnits?:number,hideExistingCreases?:boolean)=>{
    const state=states.find(state=>state.id===stateId);
    return state?diagramCalloutCPMarkup(state.doc,defaultCreaseDisplay(),{enabled:options.adaptiveLines,units:sourceUnits,hideExistingCreases}):'';
  };
  return drawingSVG(pose,step.annotations??[],'','',preview,step.images,step.paperVisible!==false,options.lineDefaults,step.callouts,cpMarkup,{enabled:options.adaptiveLines,outputSize:{width:128,height:96}},options.zoom,step.canvas?.drawingRotation??0,step.simulationSurface);
}
