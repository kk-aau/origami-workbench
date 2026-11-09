import {diagramDepthAvailable,type DiagramDepth} from './diagramDepth';
import {updateDiagramPoseView,updateDiagramAnnotations,type DiagramProject} from './diagramProject';
import {defaultModelView} from './modelViewState';
import {followDiagramPaperAnnotations} from './diagramPaperFollow';
import {refreshDiagramFoldDrawing} from './diagramFoldTransactions';

/** Appearance-only transaction. Source CP revisions and solver results stay
 * intact; artwork follows the same material coordinates before regenerating F.
 */
export function updateDiagramDepth(project:DiagramProject,stepId:string,depth:DiagramDepth):DiagramProject {
 const step=project.steps.find(s=>s.id===stepId),previous=step?.pose;if(!step||!previous)throw Error('请先计算本步骤的折图。');
 if(depth.amount>0&&!diagramDepthAvailable(previous))throw Error('图解立体化需要已确认层序的平折图；真实立体和拖角姿态保留原样。');
 if(JSON.stringify(previous.view?.depth)===JSON.stringify(depth))return project;
 let next=updateDiagramPoseView(project,stepId,{...(previous.view??defaultModelView()),depth,cameras:{}});
 const pose=next.steps.find(s=>s.id===stepId)!.pose!;
 next=updateDiagramAnnotations(next,stepId,followDiagramPaperAnnotations(previous,pose,step.annotations??[],true));
 if(step.foldLink?.enabled)next=refreshDiagramFoldDrawing(next,stepId,undefined,true);
 return next;
}
