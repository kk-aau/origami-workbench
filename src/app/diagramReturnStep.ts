import {buildDiagramFold,distance,epsilonFor,pointOnSegment,polygonArea} from '../core/geometry';
import {hasMaterialTopology} from '../core/materialTopology';
import {applyRigidFoldTransform,solveRigidFoldGeometry,type RigidFoldPoint3} from '../core/rigidFoldGeometry';
import type {Doc,FlatFoldResult,FoldGraph,Point,Segment} from '../core/types';
import {advanceDiagramStep,defaultDiagramCanvas,selectDiagramStep,updateDiagramCP,validateDiagramProject,type DiagramCPState,type DiagramIdFactory,type DiagramPose,type DiagramProject,type DiagramStep} from './diagramProject';
import {getDiagramReturnTarget} from './diagramReturnReference';
import {isDiagramPaperPulled,isDiagramPaperPoseIsometric,switchDiagramPaperState} from './diagramPaperState';
import {buildDiagramPoseFold} from './diagramFoldGeometry';
import {applyDiagramFoldSegments,diffDiagramFoldCP,applyDiagramFoldMatrix,type DiagramFoldMatrix} from './diagramFoldLink';
import {normalizeDiagramCP} from './diagramCP';
import {refreshDiagramFoldDrawing,defaultDiagramFoldLink} from './diagramFoldTransactions';
import {inheritDiagramFixedAnchor} from './diagramStepInheritance';
import {projectDiagramSpatialPoint,restoreDiagramSpatialLayers,validateDiagramSpatialPose} from './diagramSpatialPose';
import {validDiagramLayerCertificate} from './diagramLayerAnalysis';

const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);

/** Returning restores physical aggregation, never a drawing-only pulled corner.
 * A pulled target needs its retained spatial/flat physical snapshot. */
export function diagramReturnAggregationPose(step:DiagramStep):DiagramPose|null {
  if(!step.pose)return null;
  try{
    const pose=isDiagramPaperPulled(step)?step.paperStates?.spatial??step.paperStates?.flat:step.pose;
    return pose&&isDiagramPaperPoseIsometric(pose)?pose:null;
  }catch{return null;}
}

function sameCP(a:Doc,b:Doc):boolean {
  return same(a.paper,b.paper)&&!diffDiagramFoldCP(a,b).length&&!diffDiagramFoldCP(b,a).length;
}
function boundary(doc:Doc):Doc {return {...doc,segments:doc.segments.filter(s=>s.assignment==='B')};}

/** Historical marks remain real CP geometry. The target's active folds own
 * their original coverage; later folds are dormant F/0 marks after returning. */
function returnCP(project:DiagramProject,current:DiagramStep,pose:DiagramPose):Doc {
  const source=project.states.findIndex(s=>s.id===pose.sourceStateId),end=project.states.findIndex(s=>s.id===current.afterId);
  if(source<0||source>end)throw Error('返回目标的来源 CP 不在当前步骤之前，不能恢复。');
  const state=project.states[source];
  if(state.revision!==pose.sourceRevision||!same(state.doc,pose.sourceDoc))throw Error('返回目标的来源 CP 已变化，请先重新计算该目标步骤的聚合状态。');
  const history=project.states.slice(source,end+1),original=pose.sourceDoc;
  if(history.some(s=>hasMaterialTopology(s.doc))||hasMaterialTopology(original))throw Error('返回步骤暂不支持独立材料或切口拓扑，未修改当前步骤。');
  if(history.some(s=>!same(s.doc.paper,original.paper)||!sameCP(boundary(s.doc),boundary(original))))throw Error('返回期间的纸张尺寸或边界已改变，无法对应同一聚合纸面。');
  const latest=project.states[end].doc;
  let result:Doc={...structuredClone(latest),segments:[...structuredClone(original.segments.filter(s=>s.assignment==='B')),...structuredClone(latest.segments.filter(s=>s.assignment==='A'))]};
  for(const [index,snapshot] of history.entries()){
    const marks=snapshot.doc.segments.filter(s=>s.assignment!=='A'&&s.assignment!=='B').map((s,i):Segment=>({...structuredClone(s),id:`return-mark-${index}-${i}`,assignment:'F',angle:0}));
    if(marks.length)result=applyDiagramFoldSegments(result,marks);
  }
  result=applyDiagramFoldSegments(result,structuredClone(original.segments.filter(s=>s.assignment!=='A'&&s.assignment!=='B')));
  const cleaned=normalizeDiagramCP(result);
  if(cleaned.conflicts)throw Error('累计折痕存在重叠赋型冲突，未生成返回步骤。');
  // Repeated navigation must not increment a shared CP revision merely because
  // a geometric union chose different equivalent segment IDs or subdivisions.
  return sameCP(cleaned.doc,latest)?latest:cleaned.doc;
}

function simplifiedRing(graph:FoldGraph,indices:number[],eps:number):Point[] {
  const ring=indices.map(v=>graph.vertices_coords[v]);let changed=true;
  while(changed&&ring.length>3){changed=false;for(let i=0;i<ring.length;i++){
    if(pointOnSegment(ring[i],{id:'return-ring',a:ring[(i+ring.length-1)%ring.length],b:ring[(i+1)%ring.length],assignment:'F',angle:0},eps)){ring.splice(i,1);changed=true;break;}
  }}return ring;
}
function sameRing(a:Point[],b:Point[],eps:number):boolean {
  return a.length===b.length&&Math.sign(polygonArea(a))===Math.sign(polygonArea(b))&&b.some((_,offset)=>a.every((p,i)=>distance(p,b[(offset+i)%b.length])<=eps));
}
function sameFace(a:FoldGraph,f:number,b:FoldGraph,g:number,eps:number):boolean {
  const left=[a.faces_vertices![f],...(a.faces_holes?.[f]??[])].map(r=>simplifiedRing(a,r,eps));
  const right=[b.faces_vertices![g],...(b.faces_holes?.[g]??[])].map(r=>simplifiedRing(b,r,eps));
  if(left.length!==right.length||!sameRing(left[0],right[0],eps))return false;
  const holes=right.slice(1);
  for(const ring of left.slice(1)){const index=holes.findIndex(other=>sameRing(ring,other,eps));if(index<0)return false;holes.splice(index,1);}return true;
}
/** One-to-one complete oriented contours, including holes, prove unchanged
 * material faces. Equal counts or centroid containment alone do not. */
function faceMap(old:FoldGraph,next:FoldGraph,eps:number):number[] {
  const before=old.faces_vertices??[],after=next.faces_vertices??[];
  if(!before.length||before.length!==after.length)throw Error('累计折痕改变了目标的物理纸面拓扑，无法安全保留聚合状态。');
  const used=new Set<number>(),mapped=before.map((_,face)=>{
    const choices=after.flatMap((_,index)=>sameFace(old,face,next,index,eps)?[index]:[]);
    if(choices.length!==1||used.has(choices[0]))throw Error('返回目标与累计 CP 的材料纸面无法一一对应，未复制旧姿态或旧层序。');
    used.add(choices[0]);return choices[0];
  });return mapped;
}
/** -1 is boundary, 0 outside, 1 inside. Hole boundaries still belong to paper. */
function insideRing(point:Point,ring:Point[],eps:number):number {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[j],b=ring[i];if(pointOnSegment(point,{id:'return-edge',a,b,assignment:'B',angle:0},eps))return -1;
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }return inside?1:0;
}
function contains(graph:FoldGraph,face:number,point:Point,eps:number):boolean {
  return insideRing(point,graph.faces_vertices![face].map(v=>graph.vertices_coords[v]),eps)!==0&&
    !(graph.faces_holes?.[face]??[]).some(ring=>insideRing(point,ring.map(v=>graph.vertices_coords[v]),eps)===1);
}
function flatMatrix(pose:DiagramPose,graph:FoldGraph,face:number,eps:number):DiagramFoldMatrix {
  const ids=graph.faces_vertices![face],p=graph.vertices_coords[ids[0]],a=pose.result.geometry.vertices[ids[0]];
  for(let j=1;j<ids.length;j++)for(let k=j+1;k<ids.length;k++){
    const q=graph.vertices_coords[ids[j]],r=graph.vertices_coords[ids[k]],det=cross(p,q,r);if(Math.abs(det)<=eps*eps)continue;
    const b=pose.result.geometry.vertices[ids[j]],c=pose.result.geometry.vertices[ids[k]],xx=((b[0]-a[0])*(r[1]-p[1])-(c[0]-a[0])*(q[1]-p[1]))/det,
      xy=((c[0]-a[0])*(q[0]-p[0])-(b[0]-a[0])*(r[0]-p[0]))/det,
      yx=((b[1]-a[1])*(r[1]-p[1])-(c[1]-a[1])*(q[1]-p[1]))/det,
      yy=((c[1]-a[1])*(q[0]-p[0])-(b[1]-a[1])*(r[0]-p[0]))/det;
    const matrix:DiagramFoldMatrix=[xx,yx,xy,yy,a[0]-xx*p[0]-xy*p[1],a[1]-yx*p[0]-yy*p[1]];
    if(matrix.some(n=>!Number.isFinite(n))||ids.some(v=>distance(applyDiagramFoldMatrix(matrix,graph.vertices_coords[v]),pose.result.geometry.vertices[v])>eps*20))break;
    return matrix;
  }throw Error('返回目标的纸面不具有可信的刚体映射，请先恢复平整或立体聚合状态。');
}

function mappedLayers(pose:DiagramPose,map:number[]):FlatFoldResult['layers'] {
  if(!validDiagramLayerCertificate(pose.result,pose))throw Error('返回目标的纸层记录无效，请重新确认目标层序。');
  const {solutionCount:_count,solutionCountExact:_exact,solutionIndex:_index,conflicts:_conflicts,...layers}=structuredClone(pose.result.layers);
  if(layers.faceOrders)layers.faceOrders=layers.faceOrders.map(([a,b,sign])=>[map[a],map[b],sign]);
  if(layers.faceOrder)layers.faceOrder=layers.faceOrder.map(face=>map[face]);
  if(layers.constraints)layers.constraints=layers.constraints.map(constraint=>({...constraint,face:map[constraint.face]}));
  if(layers.relativeConstraints)layers.relativeConstraints=layers.relativeConstraints.map(pair=>({...pair,below:map[pair.below],above:map[pair.above]}));
  if(layers.status==='solved')layers.message='已按完全对应的材料纸面保留目标聚合层序。';
  return layers;
}

function rebaseAggregation(pose:DiagramPose,state:DiagramCPState):{pose:DiagramPose;faceMap:number[]} {
  const old=buildDiagramPoseFold(pose).graph,graph=buildDiagramFold(state.doc).graph,eps=Math.max(epsilonFor(pose.sourceDoc),epsilonFor(state.doc)),mapping=faceMap(old,graph,eps);
  const matrices=pose.spatial?[]:old.faces_vertices!.map((_,f)=>flatMatrix(pose,old,f,eps));
  const world:RigidFoldPoint3[]=[],vertices:Point[]=graph.vertices_coords.map(point=>{
    const owners=old.faces_vertices!.flatMap((_,face)=>contains(old,face,point,eps)?[face]:[]);
    if(!owners.length)throw Error('累计折痕含有目标纸面以外的点，不能投影到返回状态。');
    if(pose.spatial){
      const points=owners.map(f=>applyRigidFoldTransform(pose.spatial!.faceTransforms[f],point)),first=points[0];
      if(points.some(p=>Math.hypot(...p.map((v,i)=>v-first[i]))>eps*20))throw Error('返回目标的空间纸面在共用材料点处不连续。');
      world.push(first);const projected=projectDiagramSpatialPoint(first,pose.spatial.camera);return [projected[0],projected[1]];
    }
    const points=owners.map(f=>applyDiagramFoldMatrix(matrices[f],point));
    if(points.some(p=>distance(p,points[0])>eps*20))throw Error('返回目标的聚合纸面在共用材料点处不连续。');
    return points[0];
  });
  const startingFace=mapping[pose.result.geometry.startingFace??0];
  const result:FlatFoldResult={geometry:{...structuredClone(pose.result.geometry),vertices,faces:structuredClone(graph.faces_vertices!),graph:{...structuredClone(graph),vertices_coords:vertices},startingFace},layers:mappedLayers(pose,mapping),warnings:structuredClone(pose.result.warnings)};
  const next:DiagramPose={sourceStateId:state.id,sourceRevision:state.revision,sourceDoc:structuredClone(state.doc),result,
    ...(pose.view?{view:structuredClone(pose.view)}:{}),...(pose.displayOrder?{displayOrder:pose.displayOrder.map(f=>mapping[f])}:{}),...(pose.hiddenFaces?{hiddenFaces:pose.hiddenFaces.map(f=>mapping[f])}:{})};
  if(pose.spatial){
    const angles=graph.edges_foldAngle.map((angle,index)=>{
      if(angle!==null||!['M','V'].includes(graph.edges_assignment[index]))return angle;
      const [a,b]=graph.edges_vertices[index].map(v=>graph.vertices_coords[v]);
      const source=old.edges_vertices.findIndex(([u,v])=>{
        const line:Segment={id:'return-angle',a:old.vertices_coords[u],b:old.vertices_coords[v],assignment:'F',angle:0};
        return pointOnSegment(a,line,eps)&&pointOnSegment(b,line,eps);
      });
      if(source<0||pose.spatial!.measuredAngles[source]===null)throw Error('返回目标的自适应折角无法对应到累计折痕。');
      return pose.spatial!.measuredAngles[source];
    });
    const solved=solveRigidFoldGeometry(graph,{startingFace,fixedFaceTransform:pose.spatial.faceTransforms[pose.result.geometry.startingFace??0],edgesFoldAngle:angles});
    if(solved.status!=='ready')throw Error('返回目标的真实空间姿态无法恢复：'+solved.message);
    if(solved.vertices.some((p,i)=>Math.hypot(...p.map((v,k)=>v-world[i][k]))>solved.diagnostics.positionToleranceMm*4))throw Error('累计折痕的空间解与目标聚合姿态不同，未替换目标状态。');
    next.spatial={version:1,vertices:solved.vertices,faceTransforms:solved.faceTransforms,measuredAngles:solved.measuredAngles,camera:structuredClone(pose.spatial.camera)};
    validateDiagramSpatialPose(next,true);restoreDiagramSpatialLayers(next,pose);
    if(pose.displayOrder)next.displayOrder=pose.displayOrder.map(f=>mapping[f]);
  }
  if(!isDiagramPaperPoseIsometric(next)||!validDiagramLayerCertificate(next.result,next))throw Error('返回姿态或对应层序未能通过材料几何校验，未修改工程。');
  return {pose:next,faceMap:mapping};
}

function sameAggregation(a:DiagramPose,b:DiagramPose):boolean {
  const eps=Math.max(epsilonFor(a.sourceDoc),epsilonFor(b.sourceDoc))*20;
  const {cameras:_aCameras,board:_aBoard,...aView}=a.view??{}, {cameras:_bCameras,board:_bBoard,...bView}=b.view??{};
  const layerState=(pose:DiagramPose)=>{
    const {status,faceOrders,faceOrder,constraints,relativeConstraints}=pose.result.layers;
    return {status,faceOrders,faceOrder,constraints,relativeConstraints};
  };
  return a.sourceStateId===b.sourceStateId&&a.sourceRevision===b.sourceRevision&&same(a.sourceDoc,b.sourceDoc)&&
    same(a.result.geometry.faces,b.result.geometry.faces)&&a.result.geometry.vertices.length===b.result.geometry.vertices.length&&
    a.result.geometry.vertices.every((p,i)=>distance(p,b.result.geometry.vertices[i])<=eps)&&
    same(layerState(a),layerState(b))&&same(a.displayOrder,b.displayOrder)&&same(a.hiddenFaces,b.hiddenFaces)&&same(aView,bView)&&
    !!a.spatial===!!b.spatial&&(!a.spatial||same(a.spatial.camera,b.spatial!.camera)&&a.spatial.vertices.every((p,i)=>Math.hypot(...p.map((v,k)=>v-b.spatial!.vertices[i][k]))<=eps));
}

/** Apply one bound return instruction atomically. Both adjacent CP references
 * remain the same N+1 boundary chain; the next pose is genuinely rebased to its
 * new before CP. A populated next step is navigated only when it already has
 * that physical aggregation, otherwise no branch of the input is changed. */
export function advanceDiagramReturnStep(project:DiagramProject,idFactory?:DiagramIdFactory):DiagramProject {
  validateDiagramProject(project);
  const current=project.steps.find(s=>s.id===project.activeStepId)!,target=getDiagramReturnTarget(project,current.id);
  if(!target)throw Error('本步尚未为返回符号选择目标步骤。');
  if(current.simulationSurface||target.simulationSurface)throw Error('返回符号暂不能将任意模拟曲面转换为保留累计折痕的聚合状态；请在三维模拟中调整姿态后应用到下一步。');
  const aggregation=diagramReturnAggregationPose(target);
  if(!aggregation)throw Error('返回目标缺少可信的平整或立体聚合状态，请先在目标步骤计算纸面。');
  // Isometric drawing anchors add no physical shape. New CP vertices replace
  // their material sampling without carrying target-only illustration objects.
  const {paperDeformation:_anchors,...reference}=aggregation;
  const doc=returnCP(project,current,reference),index=project.steps.findIndex(s=>s.id===current.id),following=project.steps[index+1],after=project.states[index+1];
  if(following){
    const existing=diagramReturnAggregationPose(following),before=project.states[index+1];
    if(existing&&sameCP(before.doc,doc)){
      const expected=rebaseAggregation(reference,before).pose;
      if(sameAggregation(existing,expected)&&(following.canvas?.drawingRotation??0)===(target.canvas?.drawingRotation??0)){
        const selected=selectDiagramStep(project,following.id);
        // Equality above compares the archived physical pose. Display that
        // pose too, keeping the user's pulled illustration available to restore.
        return isDiagramPaperPulled(following)?switchDiagramPaperState(selected,following.id,expected.spatial?'spatial':'flat'):selected;
      }
    }
    const nextAfter=project.states[index+2];
    if(following.pose||following.simulationSurface||(following.annotations?.length??0)||(following.images?.length??0)||(following.callouts?.length??0)||!sameCP(before.doc,nextAfter.doc))
      throw Error('下一步已有不同折图或绘制内容，返回操作未覆盖；请在末尾或空白下一步使用返回。');
  }
  let next=same(doc,after.doc)?project:updateDiagramCP(project,after.id,doc);
  next=advanceDiagramStep(next,idFactory);
  let step=next.steps.find(s=>s.id===next.activeStepId)!;
  const source=next.states.find(s=>s.id===step.beforeId)!,followingAfter=next.states.find(s=>s.id===step.afterId)!;
  if(!same(followingAfter.doc,source.doc))next=updateDiagramCP(next,followingAfter.id,source.doc);
  const rebased=rebaseAggregation(reference,source),mode=rebased.pose.spatial?'spatial':'flat';
  const settings:ReturnType<typeof defaultDiagramFoldLink>={...defaultDiagramFoldLink(),enabled:true,layers:target.foldLink?.layers??'top',selectedFaces:(target.foldLink?.selectedFaces??[]).map(f=>rebased.faceMap[f])};
  const fixed=inheritDiagramFixedAnchor(reference,rebased.pose,target.foldLink?.fixed,step.afterId,source.doc);
  if(target.foldLink?.fixed&&!fixed)throw Error('目标固定纸面无法对应到返回状态，请先在目标步骤重新固定纸面。');
  step={...step,pose:rebased.pose,annotations:[],paperVisible:true,viewMode:'manual',canvas:{...(step.canvas??defaultDiagramCanvas(source.doc.paper.width)),drawingRotation:target.canvas?.drawingRotation??0},
    paperStates:{active:mode,[mode]:structuredClone(rebased.pose)},foldLink:{...settings,...(fixed?{fixed}:{})}};
  delete step.pendingView;
  next={...next,steps:next.steps.map(s=>s.id===step.id?step:s)};
  next=refreshDiagramFoldDrawing(next,step.id);
  validateDiagramProject(next);return next;
}
