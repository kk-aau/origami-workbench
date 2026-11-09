import {diagramDrawingFrame} from './diagramDrawing';
import type {PreparedDiagramImage} from './diagramImageImport';
import {updateDiagramImages,updateDiagramPoseView,type DiagramProject} from './diagramProject';
import {defaultModelView} from './modelViewState';
import type {DiagramImage} from './diagramImages';

/** Place artwork in the paper's coordinate system, independently from CPs. */
export function insertDiagramImage(project:DiagramProject,stepId:string,input:PreparedDiagramImage,id:string):{project:DiagramProject;image:DiagramImage}{
  const step=project.steps.find(item=>item.id===stepId);
  if(!step)throw new Error('目标步骤已不存在，请重新插入图片。');
  const paper=project.states.find(state=>state.id===step.beforeId)!.doc.paper;
  const images=step.images??[],last=images.at(-1);
  const frame=diagramDrawingFrame(step.pose,[],undefined,images,step.paperVisible!==false);
  const scale=Math.min(paper.width/input.pixelWidth,paper.height/input.pixelHeight);
  const width=input.pixelWidth*scale,height=input.pixelHeight*scale;
  const cx=last?last.position[0]+last.width/2+8:frame.x+frame.width/2;
  const cy=last?last.position[1]+last.height/2+8:frame.y+frame.height/2;
  const image:DiagramImage={...input,id,position:[cx-width/2,cy-height/2],width,height,rotation:0};
  // Also fit when insertion brings a previously unmounted overview canvas back.
  const prepared=step.pose?updateDiagramPoseView(project,stepId,{...(step.pose.view??defaultModelView()),cameras:{}}):project;
  return {project:updateDiagramImages(prepared,stepId,[...images,image],images.length?step.paperVisible!==false:false),image};
}
