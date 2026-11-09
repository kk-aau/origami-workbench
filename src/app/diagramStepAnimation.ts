import {buildDiagramFold,buildFold,distance,epsilonFor,pointOnSegment,polygonArea,splitIntersections} from '../core/geometry';
import {computeFlatGeometry} from '../core/flatFold';
import {hasMaterialTopology} from '../core/materialTopology';
import {validateDoc,type Doc,type FlatFoldResult,type FoldGraph,type Point,type Segment} from '../core/types';
import {prepareSimulationDocument} from '../engine/simmodel';
import {simulationSourceSignature} from '../engine/simLayerOrder';
import {validateSimulationStepAnimationStructure,type SimulationStepAnimation} from '../engine/simStepAnimation';
import {adjacentSimulationStepFoldedEdges,switchSimulationStepPrecreaseEdges} from '../engine/simStepRefold';
import {buildDiagramPoseFold} from './diagramFoldGeometry';
import {mapDiagramFoldLines,applyDiagramFoldMatrix,type DiagramFoldMatrix} from './diagramFoldLink';
import type {DiagramPose,DiagramProject} from './diagramProject';
import {resolveStartingFace} from './flatFoldSettings';
import {defaultModelColors,type ModelColors} from './modelColors';
import {buildDiagramPartialCreaseAnimation} from './diagramPartialCreaseAnimation';
import {inferDiagramPrecreaseActions} from './diagramInferredPrecrease';
import {diagramAnimationSourceSegments,diagramAnimationMaterialTimings} from './diagramAnimationTiming';
import {hasSpatialFoldAngles} from './diagramSpatialPose';
import {buildDiagramSpatialStepAnimation} from './diagramSpatialStepAnimation';

export interface DiagramStepAnimationClip {
  fold:FoldGraph;
  animation:SimulationStepAnimation;
  beforeLabel:string;
  afterLabel:string;
  colors:ModelColors;
  finalGeometry?:FlatFoldResult;
  initialGeometry?:FlatFoldResult;
  initialContactOrder?:import('../engine/simStepContactOrder').SimulationStepInitialOrder;
  warnings?:string[];
}
type Route={segment:Segment;fromAngle:number;toAngle:number;viaAngle?:number};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const covers=(line:Pick<Segment,'a'|'b'>,segment:Segment,eps:number)=>pointOnSegment(line.a,segment,eps)&&pointOnSegment(line.b,segment,eps);
function angle(segment:Segment|undefined):number {
  if(!segment||segment.assignment==='F')return 0;
  if(segment.assignment==='B'||segment.assignment==='A')return 0;
  if(segment.assignment==='U'||segment.angle===null)throw Error('步骤动画需要明确的山谷折类型和折角，请先处理未赋型或未知折角。');
  if(segment.angle!==(segment.assignment==='M'?-180:180))throw Error('步骤动画暂仅支持完全平折的山谷折，请将有效折痕设为 ±180°。');
  return segment.angle;
}
function containing(point:Point,polygon:Point[],eps:number,strict=false):boolean {
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[j],b=polygon[i];
    if(pointOnSegment(point,{id:'boundary',a,b,assignment:'B',angle:0},eps))return !strict;
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
function faceMatrix(source:Point[],target:Point[],face:number[],eps:number):DiagramFoldMatrix {
  const a=face[0];let b=-1,c=-1;
  for(const v of face)if(distance(source[a],source[v])>eps){b=v;break;}
  if(b>=0)for(const v of face)if(Math.abs(cross(source[a],source[b],source[v]))>eps*distance(source[a],source[b])){c=v;break;}
  if(c<0)throw Error('步骤动画不能使用退化纸面。');
  const [p,q,r]=[source[a],source[b],source[c]],[x,y,z]=[target[a],target[b],target[c]],d=cross(p,q,r);
  const u:Point=[q[0]-p[0],q[1]-p[1]],v:Point=[r[0]-p[0],r[1]-p[1]],s:Point=[y[0]-x[0],y[1]-x[1]],t:Point=[z[0]-x[0],z[1]-x[1]];
  const m:DiagramFoldMatrix=[(s[0]*v[1]-t[0]*u[1])/d,(s[1]*v[1]-t[1]*u[1])/d,(t[0]*u[0]-s[0]*v[0])/d,(t[1]*u[0]-s[1]*v[0])/d,0,0];
  m[4]=x[0]-m[0]*p[0]-m[2]*p[1];m[5]=x[1]-m[1]*p[0]-m[3]*p[1];
  if(face.some(v=>distance(applyDiagramFoldMatrix(m,source[v]),target[v])>eps*20))throw Error('纸面经过非等距扯角，请恢复平整状态后生成步骤动画。');
  return m;
}

/** One undeformed material mesh carries both endpoint poses. CP indices and
 * segment IDs are deliberately not matched across separately rebuilt states. */
export function buildDiagramStepAnimation(project:DiagramProject,stepId:string,options:{allowStill?:boolean}={}):DiagramStepAnimationClip {
  const step=project.steps.find(s=>s.id===stepId);if(!step)throw Error('找不到要播放的折序步骤。');
  const before=project.states.find(s=>s.id===step.beforeId),after=project.states.find(s=>s.id===step.afterId);
  if(!before||!after)throw Error('步骤前后 CP 不完整，无法生成动画。');
  validateDoc(before.doc);validateDoc(after.doc);
  if(hasMaterialTopology(before.doc)||hasMaterialTopology(after.doc))throw Error('步骤动画暂不支持材料切口、多张纸或带孔模型。');
  if(!same(before.doc.paper,after.doc.paper))throw Error('步骤动画要求操作前后使用相同的纸张尺寸和边界。');
  const eps=Math.max(epsilonFor(before.doc),epsilonFor(after.doc));
  // An archived flat pose is authoritative when the drawing currently shows a
  // pulled illustration. A modified label alone does not imply deformation.
  let pose:DiagramPose|undefined=step.paperStates?.spatial??step.paperStates?.flat??step.pose??undefined;
  if(pose&&(pose.sourceStateId!==before.id||pose.sourceRevision!==before.revision||!same(pose.sourceDoc,before.doc)))throw Error('操作前 CP 已变化，请重新计算操作前折图后再播放动画。');
  if(pose?.spatial||hasSpatialFoldAngles(before.doc)||hasSpatialFoldAngles(after.doc)||step.foldLink?.precreases?.some(s=>s.angle!==null&&Math.abs(s.angle)!==180)||step.annotations?.some(a=>a.kind==='line'&&a.foldAction==='precrease'&&a.foldAngle!==undefined&&a.foldAngle!==180))return buildDiagramSpatialStepAnimation(project,stepId,options);
  const source=pose?buildDiagramPoseFold(pose).graph:buildDiagramFold(before.doc).graph;
  if(source.faces_holes?.some(r=>r.length))throw Error('步骤动画暂不支持带孔纸面。');
  if(!pose){
    const origin=resolveStartingFace(before.doc,source),result=computeFlatGeometry(source,eps,{startingFace:origin.face});
    if(result.geometry.status!=='ready')throw Error(result.geometry.message);
    pose={sourceStateId:before.id,sourceRevision:before.revision,sourceDoc:before.doc,result};
  }
  // Reuses the drawing path's exact topology and whole-face isometry checks.
  mapDiagramFoldLines(pose,[],{enabled:true,layers:'all',selectedFaces:[]},before);
  const sourceFaces=source.faces_vertices!,polygons=sourceFaces.map(face=>face.map(v=>source.vertices_coords[v]));
  const matrices=sourceFaces.map(face=>faceMatrix(source.vertices_coords,pose!.result.geometry.vertices,face,eps));
  const raw=[...before.doc.segments,...after.doc.segments].filter(s=>s.assignment!=='A');
  // Authored M/V intent is authoritative. Older projects can contain only a
  // newly pressed F mark; infer that narrow local axis-switch case without
  // changing either saved CP or adding a guessed direction to the ledger.
  const authoredPrecreases=step.foldLink?.precreases??[];
  const inferredPrecreases=authoredPrecreases.length?[]:inferDiagramPrecreaseActions(before.doc,after.doc);
  const precreases=[...authoredPrecreases,...inferredPrecreases];
  if(raw.length+precreases.length>4000)throw Error('步骤动画预览暂限操作前后合计 4,000 条材料线段，请简化本步折痕。');
  raw.forEach(angle);
  precreases.forEach(s=>{if(s.assignment!=='M'&&s.assignment!=='V')throw Error('预折动作缺少明确的山谷方向。');angle(s);});
  // CP normalization can merge an F route through a shorter precrease's tip.
  // Retain intent endpoints in this private material subdivision; its M/V
  // direction remains in the ledger and never changes the endpoint CPs.
  const geometry:Doc={name:'步骤动画材料',paper:before.doc.paper,segments:[...raw,...precreases].map((s,i)=>({...s,id:`animation-route-${i}`,assignment:s.assignment==='B'?'B':'F',angle:0}))};
  const planar=splitIntersections(geometry).segments;
  const routes:Route[]=planar.map((segment,index)=>{
    const beforeSegments=before.doc.segments.filter(s=>s.assignment!=='A'&&covers(segment,s,eps)),afterSegments=after.doc.segments.filter(s=>s.assignment!=='A'&&covers(segment,s,eps));
    if(segment.assignment==='B'){
      if(!beforeSegments.some(s=>s.assignment==='B')||!afterSegments.some(s=>s.assignment==='B'))throw Error('步骤动画暂不支持更改纸张边界或新增切口。');
      return {segment:{...segment,id:`animation-edge-${index}`},fromAngle:0,toAngle:0};
    }
    const semantics=(segments:Segment[])=>{
      const angles=[...new Set(segments.map(angle))];
      if(angles.length>1)throw Error('CP 中存在重叠赋型冲突，请先处理后生成动画。');
      return angles[0]??0;
    };
    const fromAngle=semantics(beforeSegments),toAngle=semantics(afterSegments);
    if(fromAngle*toAngle<0)throw Error('同一折痕从山折直接反转为谷折的动作暂不支持，请拆成展开和再折两步。');
    const pending=[...new Set(precreases.filter(s=>covers(segment,s,eps)).map(angle))];
    if(pending.length>1)throw Error('同一预折痕具有相反的折叠方向，请明确山谷属性。');
    // A press on a folded lower layer can leave its endpoint CP unchanged.
    // Preserve the authored open-and-return action instead of discarding it
    // merely because both endpoints still describe the same mountain/valley.
    // A newly folded or oppositely assigned crease never becomes this cycle.
    const viaAngle=fromAngle===0&&toAngle===0?pending[0]:
      fromAngle===toAngle&&fromAngle!==0&&pending[0]===fromAngle?0:undefined;
    return {segment:{...segment,id:`animation-edge-${index}`,assignment:toAngle<0?'M':toAngle>0?'V':'F',angle:toAngle},fromAngle,toAngle,...(viaAngle!==undefined?{viaAngle}:{})};
  });
  if(!options.allowStill&&!routes.some(r=>r.fromAngle!==r.toAngle||r.viaAngle!==undefined))throw Error('这一步没有实际折叠变化或带方向的预折动作；绘图符号与已有折痕不产生折叠动画。');
  const union:Doc={name:project.name,paper:before.doc.paper,segments:routes.map(r=>r.segment)},fold=buildFold(union).graph;
  if(!fold.faces_vertices?.length||fold.faces_holes?.some(r=>r.length))throw Error('步骤动画需要连续、无孔的单张纸面。');
  const finalGraph=buildDiagramFold(after.doc).graph,afterGeometry=computeFlatGeometry(finalGraph,eps);
  if(afterGeometry.geometry.status!=='ready')return buildDiagramSpatialStepAnimation(project,stepId,{...options,bendable:true});
  const partialClip=()=>buildDiagramPartialCreaseAnimation({project,step,pose,fold:buildDiagramFold(union).graph,routes,polygons,matrices,eps});
  let simulation:ReturnType<typeof prepareSimulationDocument>;
  try{simulation=prepareSimulationDocument(fold);}
  catch(error){
    // A dangling finite F mark can fail the rigid weak-face preparer before
    // hinge coverage is available. The dedicated constrained mesh retains it.
    if(precreases.length)return partialClip();
    throw error;
  }
  const {prepared,warnings}=simulation;
  if(inferredPrecreases.length)warnings.push('根据新增预折痕识别局部换轴动作：先预折，再恢复原有折叠状态；操作前后 CP 保持不变。');
  if(prepared.vertexCount>1200||prepared.faceCount>2400)throw Error('步骤动画预览暂限 1,200 个顶点和 2,400 个三角片，请简化本步折痕。');
  // Keep CP lookup at source precision. GPU/solver rest buffers are Float32;
  // using those rounded coordinates for point-in-face could miss a boundary.
  const cp=prepared.fold.vertices_coords.map((p):Point=>[p[0],-p[2]]);
  const shown=cp.map(point=>{
    const owners=polygons.flatMap((polygon,f)=>containing(point,polygon,eps)?[f]:[]);
    if(!owners.length)throw Error('新增网格顶点超出操作前纸张，无法保持材料对应。');
    const mapped=owners.map(f=>applyDiagramFoldMatrix(matrices[f],point));
    if(mapped.some(p=>distance(p,mapped[0])>eps*20))throw Error('操作前纸面不连续，无法为新增折痕建立一致起态。');
    return mapped[0];
  });
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let v=0;v<prepared.vertexCount;v++)for(let k=0;k<3;k++){min[k]=Math.min(min[k],prepared.originalPositions[v*3+k]);max[k]=Math.max(max[k],prepared.originalPositions[v*3+k]);}
  const center=min.map((n,k)=>(n+max[k])/2);let radius=0;
  for(let v=0;v<prepared.vertexCount;v++)radius=Math.max(radius,Math.hypot(...center.map((n,k)=>prepared.originalPositions[v*3+k]-n)));
  if(radius<=1e-6)throw Error('纸张尺寸过小，无法生成稳定步骤动画。');
  const initialPositions=shown.flatMap(p=>[(p[0]-center[0])/radius,-center[1]/radius,(-p[1]-center[2])/radius]);
  const ranges=prepared.creaseParams.map(crease=>{
    const [a,b]=prepared.edgesVertices[crease.edge],line={a:cp[a],b:cp[b]},route=routes.find(r=>covers(line,r.segment,eps));
    return {edge:crease.edge,fromAngle:route?.fromAngle??0,toAngle:route?.toAngle??0,...(route?.viaAngle!==undefined?{viaAngle:route.viaAngle}:{})};
  });
  // Every requested moving route must survive triangulation as a driven hinge.
  for(const route of routes.filter(r=>r.fromAngle!==r.toAngle||r.viaAngle!==undefined)){
    const covered=ranges.filter(r=>{const [a,b]=prepared.edgesVertices[r.edge];return covers({a:cp[a],b:cp[b]},route.segment,eps);});
    const length=covered.reduce((sum,r)=>{const [a,b]=prepared.edgesVertices[r.edge];return sum+distance(cp[a],cp[b]);},0);
    if(Math.abs(length-distance(route.segment.a,route.segment.b))>eps*20)return partialClip();
  }
  const fixed=step.foldLink?.fixed,unionPolygons=fold.faces_vertices.map(face=>face.map(v=>fold.vertices_coords[v]));
  let fixedFace:number;
  if(fixed){
    const hits=unionPolygons.flatMap((polygon,f)=>containing(fixed.point,polygon,eps,true)?[f]:[]);
    if(hits.length===1)fixedFace=hits[0];
    else{
      const oldInterior=polygons.filter(polygon=>containing(fixed.point,polygon,eps,true)).length===1;
      const active=routes.some(r=>(r.fromAngle!==r.toAngle||r.viaAngle!==undefined)&&pointOnSegment(fixed.point,r.segment,eps));
      const touching=oldInterior&&!active?unionPolygons.flatMap((polygon,f)=>containing(fixed.point,polygon,eps)?[f]:[]):[];
      if(!touching.length)throw Error('固定点落在本步折痕或纸边，请在固定侧内部重新指定。');
      // An old, expanded F mark is not a physical boundary. Either daughter
      // belongs to the same unchanged material region; retain the fixed point.
      fixedFace=touching[0];
    }
  }else{
    const root=pose.result.geometry.startingFace??0;
    const candidates=unionPolygons.map((polygon,f)=>({f,area:Math.abs(polygonArea(polygon)),old:polygons[root]&&polygon.every(p=>containing(p,polygons[root],eps))}));
    candidates.sort((a,b)=>Number(b.old)-Number(a.old)||b.area-a.area||a.f-b.f);fixedFace=candidates[0].f;
    warnings.push('未指定固定侧，预览自动固定原起始纸面中的最大区域。');
  }
  const fixedSeedTriangles=prepared.facesVertices.flatMap((_,f)=>prepared.triangleSourceFaces?.[f]===fixedFace?[f]:[]);
  const fixedSeedVertices=[...new Set(fixedSeedTriangles.flatMap(f=>prepared.facesVertices[f]))];
  // An old folded hinge beside a participating material face may temporarily
  // open, even though its two endpoint angles agree. Keep the chosen fixed
  // daughter face pinned, together with every region that cannot be released.
  // The ordinary path still keeps all old hinges rigid; only a separately
  // collision-certified fallback may use the neighbouring hinge freedom.
  const changingEdges=new Set(ranges.filter(r=>r.fromAngle!==r.toAngle||r.viaAngle!==undefined&&(r.viaAngle!==r.fromAngle||r.viaAngle!==r.toAngle)).map(r=>r.edge));
  // A precrease on an already folded stack can exchange axes at a material
  // vertex. Its old hinge may sit across intervening folded sectors rather
  // than bordering the new ray's immediate panel. Do not weld those regions
  // together before the planner can test the old hinge's open-and-return via.
  const neighbouringFolds=new Set([
    ...adjacentSimulationStepFoldedEdges(prepared,{ranges}),
    ...switchSimulationStepPrecreaseEdges(prepared,{ranges,initialPositions})
  ]);
  const adjacency=prepared.facesVertices.map(()=>[] as number[]);
  prepared.edgesFaces.forEach((owners,e)=>{
    if(owners.length!==2||changingEdges.has(e)||neighbouringFolds.has(e))return;
    const [a,b]=owners;adjacency[a].push(b);adjacency[b].push(a);
  });
  const regionOf=prepared.facesVertices.map(()=>-1),regions:number[][]=[];
  for(let f=0;f<regionOf.length;f++){
    if(regionOf[f]>=0)continue;
    const id=regions.length,region:number[]=[],todo=[f];regionOf[f]=id;
    while(todo.length){const face=todo.pop()!;region.push(face);for(const next of adjacency[face])if(regionOf[next]<0){regionOf[next]=id;todo.push(next);}}
    regions.push(region);
  }
  for(const edge of changingEdges){
    const [a,b]=prepared.edgesFaces[edge];
    if(a===undefined||b===undefined||regionOf[a]===regionOf[b]){
      if(ranges.some(r=>r.viaAngle!==undefined)&&routes.every(r=>r.fromAngle===r.toAngle))return partialClip();
      return buildDiagramSpatialStepAnimation(project,stepId,{...options,bendable:true});
    }
  }
  const fixedRegion=regionOf[fixedSeedTriangles[0]];
  if(fixedRegion===undefined||fixedSeedTriangles.some(f=>regionOf[f]!==fixedRegion))throw Error('固定侧被本步动作分开，请在保持不动的纸面内部重新选择固定侧。');
  const fixedVertices=[...new Set(regions[fixedRegion].flatMap(f=>prepared.facesVertices[f]))];
  const a=fixedVertices[0],b=fixedVertices.find(v=>distance(cp[a],cp[v])>eps);
  if(fixedVertices.length<3||b===undefined||!fixedVertices.some(c=>Math.abs(cross(cp[a],cp[b],cp[c]))>eps*eps))throw Error('固定侧缺少足够的非共线材料顶点，请重新指定固定侧。');
  if(fixed)for(const v of fixedSeedVertices)if(distance(applyDiagramFoldMatrix(fixed.matrix,cp[v]),shown[v])>eps*20)throw Error('固定侧参考姿态已变化，请重新选择固定侧后播放。');
  const sourceSignature=simulationSourceSignature(fold);if(!sourceSignature)throw Error('步骤动画材料网格超过支持范围。');
  const retainedCreases=prepared.edgesVertices.flatMap(([a,b],e)=>
    prepared.edgesAssignment[e]!=='B'&&before.doc.segments.some(s=>s.assignment==='F'&&covers({a:cp[a],b:cp[b]},s,eps))?[e]:[]);
  const timings=diagramAnimationMaterialTimings(step.annotations??[],diagramAnimationSourceSegments(step.annotations??[],pose,before,step.foldLink),prepared.edgesVertices,cp,ranges,eps);
  const animation:SimulationStepAnimation={version:1,sourceSignature,initialPositions,ranges,fixedVertices,bendingFixedVertices:fixedSeedVertices,retainedCreases,...(timings?{timings}:{})};
  validateSimulationStepAnimationStructure(animation,prepared,sourceSignature);
  // Final state uses this same indexed material subdivision. F daughter cells
  // remain coplanar; they are not given invented layer relations.
  const endpointGraph=structuredClone(fold);
  endpointGraph.edges_vertices.forEach(([a,b],e)=>{
    if(endpointGraph.edges_assignment[e]==='B')return;
    const route=routes.find(r=>covers({a:endpointGraph.vertices_coords[a],b:endpointGraph.vertices_coords[b]},r.segment,eps));
    const to=route?.toAngle??0;endpointGraph.edges_assignment[e]=to<0?'M':to>0?'V':'F';endpointGraph.edges_foldAngle[e]=to;
  });
  const finalGeometry=computeFlatGeometry(endpointGraph,eps,{startingFace:fixedFace});
  if(finalGeometry.geometry.status!=='ready')return buildDiagramSpatialStepAnimation(project,stepId,{...options,bendable:true});
  const fixedPolygon=unionPolygons[fixedFace],parent=polygons.findIndex(p=>fixedPolygon.every(v=>containing(v,p,eps)));
  if(parent<0)throw Error('无法确定固定子面的操作前材料来源。');
  const finalMatrix=fixed?.matrix??matrices[parent];
  finalGeometry.geometry.vertices=finalGeometry.geometry.vertices.map(p=>applyDiagramFoldMatrix(finalMatrix,p));
  finalGeometry.geometry.graph={...finalGeometry.geometry.graph!,vertices_coords:structuredClone(finalGeometry.geometry.vertices)};
  delete finalGeometry.geometry.graph.faces_matrix;delete finalGeometry.geometry.graph.faces_matrix2;delete finalGeometry.geometry.graph.faces_normal;
  const initialGraph=structuredClone(fold);
  initialGraph.edges_vertices.forEach(([a,b],e)=>{
    if(initialGraph.edges_assignment[e]==='B')return;
    const route=routes.find(r=>covers({a:initialGraph.vertices_coords[a],b:initialGraph.vertices_coords[b]},r.segment,eps));
    const from=route?.fromAngle??0;initialGraph.edges_assignment[e]=from<0?'M':from>0?'V':'F';initialGraph.edges_foldAngle[e]=from;
  });
  const initialGeometry=computeFlatGeometry(initialGraph,eps,{startingFace:fixedFace});
  if(initialGeometry.geometry.status!=='ready')throw Error('本步初始材料网格不能保持原平折姿态。');
  initialGeometry.geometry.vertices=fold.vertices_coords.map(p=>{
    const owner=polygons.findIndex(poly=>containing(p,poly,eps));
    if(owner<0)throw Error('本步初始材料网格缺少纸面来源。');
    return applyDiagramFoldMatrix(matrices[owner],p);
  });
  initialGeometry.geometry.graph={...initialGeometry.geometry.graph!,vertices_coords:structuredClone(initialGeometry.geometry.vertices)};
  delete initialGeometry.geometry.graph.faces_matrix;delete initialGeometry.geometry.graph.faces_matrix2;delete initialGeometry.geometry.graph.faces_normal;
  // Keep the drawing's selected solution when new creases subdivide its faces.
  // A fresh layer search may pick another valid solution with a different side
  // visible. Daughter faces retain their parent's material-side relation.
  if(pose.result.layers.status==='solved'&&pose.result.layers.faceOrders?.length&&same(pose.result.geometry.faces,sourceFaces)){
    const parents=unionPolygons.map(poly=>polygons.findIndex(parent=>poly.every(p=>containing(p,parent,eps))));
    const children=sourceFaces.map((_,parent)=>parents.flatMap((p,f)=>p===parent?[f]:[]));
    const rows:NonNullable<FlatFoldResult['layers']['faceOrders']>=[];
    for(const [a,b,sign] of pose.result.layers.faceOrders){
      if(!children[a]||!children[b])throw Error('主图纸层索引已变化，请重新计算操作前折图。');
      const parentWinding=Math.sign(polygonArea(sourceFaces[b].map(v=>pose!.result.geometry.vertices[v])));
      for(const first of children[a])for(const second of children[b]){
        const childWinding=Math.sign(polygonArea(fold.faces_vertices![second].map(v=>initialGeometry.geometry.vertices[v])));
        if(!parentWinding||!childWinding)throw Error('初态纸面退化，无法继承主图层序。');
        rows.push([first,second,sign*parentWinding*childWinding]);
        if(rows.length>1_000_000)throw Error('本步细分后的纸层关系过多，请减少同时添加的折痕。');
      }
    }
    initialGeometry.layers={status:'solved',message:'继承当前主图选定的纸层顺序。',faceOrders:rows};
  }
  const stationary=regions[fixedRegion].flatMap(f=>prepared.facesVertices[f]);
  for(const v of new Set(stationary)){
    const vertex=fold.vertices_coords.findIndex(p=>distance(p,cp[v])<=eps);
    if(vertex<0||distance(finalGeometry.geometry.vertices[vertex],shown[v])>eps*20)throw Error('本步折叠会改变指定固定区域的位置，请检查作用纸层并拆分相互牵连的动作。');
  }
  const index=project.states.findIndex(s=>s.id===before.id);
  return {fold,animation,initialGeometry,finalGeometry,colors:structuredClone(step.pose?.view?.colors??defaultModelColors()),beforeLabel:`CP${index}`,afterLabel:`CP${index+1}`,...(warnings.length?{warnings}:{})};
}
