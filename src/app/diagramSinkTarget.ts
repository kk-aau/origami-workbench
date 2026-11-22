import {prepareSimulationDocument} from '../engine/simmodel';
import {buildDiagramFold,polygonArea} from '../core/geometry';
import {recomputeFlatLayers} from '../core/flatFold';
import {diagramFoldStartingFace} from './diagramFoldLink';
import {resolveStartingFace} from './flatFoldSettings';
import {requestedDiagramLayerSolutionIndex} from './diagramLayerAnalysis';
import {diagramIllustrationMesh} from './diagramIllustrationMesh';
import {mapDiagramMaterialOrders,registerDiagramPositions,sampleDiagramMaterialPoint} from './diagramAnimationRegistration';
import {createDiagramSpatialPose,DEFAULT_DIAGRAM_SPATIAL_CAMERA,diagramSpatialContactOrders,hasNonFlatFoldAngles,prepareDiagramSpatialHistory,validateDiagramSpatialPose} from './diagramSpatialPose';
import type {DiagramPose,DiagramProject} from './diagramProject';
import type {DiagramStepAnimationClip} from './diagramStepAnimation';

type Point3=[number,number,number];
export interface DiagramSinkTarget {positions:number[];faceOrders?:[number,number,number][]}

function previousSinkPoses(project:DiagramProject,index:number):DiagramPose[]{
  const history:DiagramPose[]=[];
  for(let i=index;i>=0;i--){
    const step=project.steps[i],pose=step.paperStates?.spatial??step.paperStates?.flat??step.pose;
    const input=project.states[i];
    if(!pose||step.beforeId!==input?.id||pose.sourceStateId!==input.id||pose.sourceRevision!==input.revision||
      i<index&&step.afterId!==project.steps[i+1].beforeId)break;
    history.unshift(pose);
    if(!pose.spatial)break;
  }
  return history;
}

/** The next step's saved starting pose is the authored end of this leg.
 * Re-sample on this leg's material mesh and keep its fixed face stationary. */
export function targetForDiagramSinkLeg(project:DiagramProject,index:number,clip:DiagramStepAnimationClip,guidePose?:DiagramPose):DiagramSinkTarget|undefined {
  const step=project.steps[index],next=project.steps[index+1];
  const state=project.states.find(s=>s.id===step?.afterId);
  const states=next?.paperStates;
  if(!state||next&&next.beforeId!==state.id)return;
  let pose=guidePose??(states?.active==='flat'?states.flat:states?.spatial)??states?.flat??next?.pose;
  const history=previousSinkPoses(project,index);
  if(!pose){
    // The closing leg starts in the opened spatial guide. Use the same
    // contact-aware solve as advancing the workspace from that guide, even
    // when no drawing has been created after the final CP yet.
    if(!history.at(-1)?.spatial)return;
    const chain=structuredClone(history);
    prepareDiagramSpatialHistory(chain);
    const fixed=step.foldLink?.enabled?step.foldLink.fixed:undefined;
    const graph=buildDiagramFold(state.doc).graph;
    const root=fixed?diagramFoldStartingFace(state.doc,fixed,graph):resolveStartingFace(state.doc,graph).face;
    const previous=chain.at(-1)!;
    const camera=hasNonFlatFoldAngles(state.doc)?previous.spatial!.camera:DEFAULT_DIAGRAM_SPATIAL_CAMERA;
    const target=createDiagramSpatialPose(state.doc,root,fixed,previous,camera);
    pose={sourceDoc:state.doc,sourceStateId:state.id,sourceRevision:state.revision,...target};
  }
  if(pose.result.geometry.status!=='ready')throw Error('沉折目标尚未生成，请重新计算对应折图。');
  if(pose.sourceStateId!==state.id||pose.sourceRevision!==state.revision||JSON.stringify(pose.sourceDoc)!==JSON.stringify(state.doc))throw Error('沉折目标的来源 CP 已变化，请重新计算对应折图。');
  if(pose.spatial)validateDiagramSpatialPose(pose,true);
  else if(hasNonFlatFoldAngles(state.doc))throw Error('沉折中间态包含部分折角，请先保存它的立体姿态。');

  // Exclude display projections, camera rotation and illustration drag handles.
  const {baseGraph,triangles}=diagramIllustrationMesh({sourceDoc:pose.sourceDoc,result:pose.result});
  const geometry=pose.result.geometry;
  if(JSON.stringify(baseGraph.faces_vertices)!==JSON.stringify(geometry.faces))throw Error('沉折目标纸面与来源 CP 不一致，请重新计算对应折图。');
  const vertices=pose.spatial?.vertices??geometry.vertices.map(([x,y]):Point3=>[x,y,0]);
  if(vertices.length!==baseGraph.vertices_coords.length)throw Error('沉折目标缺少原纸顶点的对应位置。');
  const winding=(ids:number[])=>Math.sign(polygonArea(ids.map(v=>baseGraph.vertices_coords[v])));
  const oriented=triangles.flatMap((row,f)=>row.map(t=>winding(t)===winding(geometry.faces[f])?t:[t[0],t[2],t[1]]));
  const boundary={
    cp:baseGraph.vertices_coords,indices:new Uint32Array(oriented.flat()),sourceFaces:triangles.flatMap((row,i)=>row.map(()=>i)),
    positions:vertices.flatMap(([x,y,z])=>[x,z,-y]),
  };
  const {prepared}=prepareSimulationDocument(clip.fold);
  const cp=prepared.fold.vertices_coords.map(p=>[p[0],-p[2]]);
  const initial=cp.map((_,i):Point3=>[clip.animation.initialPositions[i*3],clip.animation.initialPositions[i*3+1],clip.animation.initialPositions[i*3+2]]);
  const fixed=clip.animation.bendingFixedVertices??clip.animation.fixedVertices;
  if(!fixed||fixed.length<3)throw Error('沉折缺少用于定位的固定纸面。');
  const distance3=(a:Point3,b:Point3)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  const a=fixed[0],materialDistance=(b:number)=>Math.hypot(cp[b][0]-cp[a][0],cp[b][1]-cp[a][1]);
  const b=fixed.reduce((best,i)=>materialDistance(i)>materialDistance(best)?i:best,a);
  const scale=distance3(initial[a],initial[b])/materialDistance(b);
  if(!Number.isFinite(scale)||scale<=0)throw Error('沉折固定纸面的尺寸无效。');
  const target=cp.map(p=>sampleDiagramMaterialPoint(boundary,p).position.map(n=>n*scale) as Point3);
  for(const [i,j] of prepared.edgesVertices){
    const restLength=Math.hypot(cp[i][0]-cp[j][0],cp[i][1]-cp[j][1])*scale;
    if(Math.abs(distance3(target[i],target[j])-restLength)>2e-5)throw Error('沉折目标与当前材料网格的边长不一致，请重新计算对应折图。');
  }
  const positions=registerDiagramPositions(target.flat(),initial,fixed,'沉折目标与当前固定纸面的形状不一致，请检查固定侧。');
  let contacts:DiagramSinkTarget['faceOrders'];
  if(pose.spatial)contacts=diagramSpatialContactOrders(pose,history);
  else{
    // Reopened files carry their chosen candidate, while the layer proof is
    // deliberately cleared. Rebuild on the exact saved geometry and keep its
    // constraints; recomputing the CP here could select a different stack.
    const index=requestedDiagramLayerSolutionIndex(pose);
    let layers=pose.result.layers;
    if(layers.status!=='solved'||(layers.solutionIndex??0)!==index){
      layers=recomputeFlatLayers(pose.result,{solutionIndex:index,constraints:layers.constraints,relativeConstraints:layers.relativeConstraints}).layers;
      if(layers.status!=='solved'||(layers.solutionIndex??0)!==index)throw Error('沉折终态的所选纸层顺序无法确认：'+layers.message);
    }
    contacts=layers.faceOrders??[];
  }
  return {positions,faceOrders:mapDiagramMaterialOrders(prepared,boundary,contacts)};
}
