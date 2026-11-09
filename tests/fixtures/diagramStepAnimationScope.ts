import {blankDoc} from '../../src/app/state';
import {buildDiagramFold} from '../../src/core/geometry';
import {computeFlatGeometry} from '../../src/core/flatFold';
import {adoptDiagramPose,createDiagramProject,updateDiagramFoldLink,updateDiagramPoseView,updateDiagramStep} from '../../src/app/diagramProject';
import {pickDiagramFoldAnchor} from '../../src/app/diagramFoldLink';
import {reconcileDiagramFoldAnnotations} from '../../src/app/diagramFoldTransactions';
import {defaultModelView} from '../../src/app/modelViewState';
import {normalizeDiagramCP} from '../../src/app/diagramCP';

/** Two superimposed material layers share the retained 180-degree crease.
 * Only the top layer's free corner is creased; the complete lower sheet and
 * the rest of the top layer form one stationary material component. */
export function diagramSingleLayerCornerFixture(line:{a:[number,number];b:[number,number]}={a:[0,40],b:[20,0]},foldAction:'fold'|'precrease'='fold'){
  let before=blankDoc('仅折上层外角',100,100);
  before.segments.push({id:'retained-valley',a:[50,0],b:[50,100],assignment:'V',angle:180});
  before=normalizeDiagramCP(before).doc;
  let id=0,project=createDiagramProject(before,()=>`scope-demo-${++id}`),step=project.steps[0];
  const graph=buildDiagramFold(before).graph,result=computeFlatGeometry(graph,1e-6);
  if(result.geometry.status!=='ready')throw Error(result.geometry.message);
  project=adoptDiagramPose(project,step.id,step.beforeId,result);
  const topFace=graph.faces_vertices!.findIndex(face=>face.reduce((sum,v)=>sum+graph.vertices_coords[v][0],0)/face.length>50);
  const lowerFace=graph.faces_vertices!.findIndex((_,f)=>f!==topFace);
  const fixed=pickDiagramFoldAnchor(project.steps[0].pose!,[20,80],lowerFace);
  project=updateDiagramFoldLink(project,step.id,{enabled:true,layers:'selected',selectedFaces:[topFace],fixed});
  project=reconcileDiagramFoldAnnotations(project,step.id,[{id:'top-corner-crease',kind:'line',a:line.a,b:line.b,style:'valley',foldAction,color:'#293d35',width:.7}]);
  project=updateDiagramStep(project,step.id,{title:'仅折上层外角',description:'只折上层自由纸角，下面完整的纸层及上层其余部分保持不动。'});
  const view=defaultModelView();view.colors={front:'#F04646',back:'#2459EB',line:'#18253C'};
  project=updateDiagramPoseView(project,step.id,view);
  return {project,stepId:step.id,before,topFace,lowerFace};
}
