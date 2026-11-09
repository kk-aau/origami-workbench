import {blankDoc} from '../../src/app/state';
import {buildDiagramFold} from '../../src/core/geometry';
import {computeFlatGeometry} from '../../src/core/flatFold';
import {adoptDiagramPose,appendDiagramStep,createDiagramProject,updateDiagramFoldLink,updateDiagramStep,updateDiagramPoseView} from '../../src/app/diagramProject';
import {alignDiagramFoldResult,diagramFoldStartingFace,pickDiagramFoldAnchor} from '../../src/app/diagramFoldLink';
import {reconcileDiagramFoldAnnotations} from '../../src/app/diagramFoldTransactions';
import {defaultModelView} from '../../src/app/modelViewState';
import {modelProjection} from '../../src/app/modelProjection';

/** A square is first folded into a two-sheet triangle. The next valley fold
 * moves both superimposed sheets together, retaining the first 180° hinge.
 * From the default front-side camera the visible sheet is the PAPER BACK
 * before and after the fold. Drawing source face 0 first gives the wrong front
 * colour, although every material edge, fixed vertex and angle is correct. */
export function diagramOverlappingTriangleColorFixture(){
  let serial=0,project=createDiagramProject(blankDoc('已折三角形颜色回归',100,100),()=>`triangle-colors-${++serial}`);
  const actions=[
    {a:[0,100],b:[100,0],fixed:[20,20],title:'对角谷折'},
    {a:[0,0],b:[50,50],fixed:[40,5],title:'两层再次谷折'},
  ] as const;
  for(const [index,action] of actions.entries()){
    const step=project.steps[index],state=project.states.find(s=>s.id===step.beforeId)!;
    const previous=index?project.steps[index-1].foldLink?.fixed:undefined;
    const geometry=computeFlatGeometry(buildDiagramFold(state.doc).graph,1e-6,previous?{startingFace:diagramFoldStartingFace(state.doc,previous)}:undefined);
    const pose=previous?alignDiagramFoldResult(state.doc,geometry,previous):geometry;
    if(pose.geometry.status!=='ready')throw Error(pose.geometry.message);
    project=adoptDiagramPose(project,step.id,step.beforeId,pose);
    project=updateDiagramFoldLink(project,step.id,{enabled:true,layers:'all',selectedFaces:[],fixed:pickDiagramFoldAnchor(project.steps[index].pose!,[...action.fixed])});
    project=reconcileDiagramFoldAnnotations(project,step.id,[{id:`triangle-colors-crease-${index}`,kind:'line',a:[...action.a],b:[...action.b],style:'valley',color:'#293d35',width:.7}]);
    project=updateDiagramStep(project,step.id,{title:action.title,description:'已叠合纸层的可见面应保持正确，不能由三角网格绘制先后决定颜色。'});
    const view=defaultModelView();view.colors={front:'#FF0000',back:'#0000FF',line:'#222222'};
    project=updateDiagramPoseView(project,step.id,view);
    if(index<actions.length-1)project=appendDiagramStep(project,()=>`triangle-colors-${++serial}`);
  }
  return {project,stepId:project.steps[1].id};
}

/** Four real document steps: precrease the middle, fold it, precrease only the
 * upper free corner, then fold that corner. The final CP3 -> CP4 contact must
 * expose the red paper front ABOVE a blue folded sheet. A rotated back-side
 * drawing exercises inverse view mapping and the mountain/valley inversion. */
export function diagramFourthCornerColorFixture(side:'front'|'back'='back',rotation=37){
  let serial=0,project=createDiagramProject(blankDoc('第四步接触颜色回归',100,100),()=>`fourth-colors-${++serial}`);
  for(let index=0;index<4;index++){
    const step=project.steps[index],state=project.states.find(s=>s.id===step.beforeId)!,previous=index?project.steps[index-1].foldLink?.fixed:undefined,graph=buildDiagramFold(state.doc).graph;
    const calculated=computeFlatGeometry(graph,1e-6,previous?{startingFace:diagramFoldStartingFace(state.doc,previous)}:undefined),pose=previous?alignDiagramFoldResult(state.doc,calculated,previous):calculated;
    if(pose.geometry.status!=='ready')throw Error(pose.geometry.message);
    project=adoptDiagramPose(project,step.id,step.beforeId,pose);
    const view=defaultModelView();view.colors={front:'#FF0000',back:'#0000FF',line:'#222222'};
    if(index>=2){view.side=side;view.rotation=rotation;}project=updateDiagramPoseView(project,step.id,view);
    const activePose=project.steps[index].pose!,projection=modelProjection(activePose.result.geometry.vertices,view.side==='back',view.rotation);
    const top=index>=2?graph.faces_vertices!.findIndex(face=>face.reduce((s,v)=>s+graph.vertices_coords[v][0],0)/face.length>50):-1;
    const fixedFace=index>=2?graph.faces_vertices!.findIndex((_,f)=>f!==top):0;
    project=updateDiagramFoldLink(project,step.id,{enabled:true,layers:index>=2?'selected':'all',selectedFaces:index>=2?[top]:[],fixed:pickDiagramFoldAnchor(activePose,projection.project([20,80]),fixedFace)});
    const a=projection.project(index>=2?[0,40]:[50,0]),b=projection.project(index>=2?[20,0]:[50,100]);
    const style=index>=2&&side==='back'?'mountain':'valley';
    project=reconcileDiagramFoldAnnotations(project,step.id,[{id:`fourth-colors-crease-${index}`,kind:'line',a,b,style,foldAction:index===0||index===2?'precrease':'fold',color:'#222222',width:.7}]);
    project=updateDiagramStep(project,step.id,{title:['中线预折','沿中线谷折','上层纸角预折','沿已有预折痕折角'][index]});
    if(index<3)project=appendDiagramStep(project,()=>`fourth-colors-${++serial}`);
  }
  return {project,stepId:project.steps[3].id};
}
