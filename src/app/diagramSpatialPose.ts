import {solveAdaptiveFoldAngles} from '../core/adaptiveFoldAngles';
import {buildDiagramFold,polygonArea} from '../core/geometry';
import type {Doc,FoldGraph,FlatFoldResult,Point,Segment} from '../core/types';
import {solveRigidFoldGeometry,applyRigidFoldTransform,type RigidFoldTransform3D,type RigidFoldPoint3} from '../core/rigidFoldGeometry';
import {recomputeFlatLayers} from '../core/flatFold';
import {modelOverlapRegions} from './modelOverlapRegions';
import {modelSurfacePrecision} from './modelSurfacePrecision';
import type {DiagramPose} from './diagramProject';
import type {DiagramFoldAnchor,DiagramFoldMatrix} from './diagramFoldLinkTypes';
import {solveSpatialLayerContacts,type SpatialLayerRequest} from './diagramSpatialLayerSolver';

export interface DiagramSpatialPose {
  version:1;vertices:RigidFoldPoint3[];faceTransforms:RigidFoldTransform3D[];
  measuredAngles:(number|null)[];camera:{yaw:number;elevation:number;frame?:RigidFoldTransform3D;rotation?:number[];pivot?:RigidFoldPoint3;offset?:RigidFoldPoint3};
  /** Material-side preferences; imported values must be solved again. */
  layerContacts?:ContactOrders;layerConstraints?:ContactOrders;
}
export const DEFAULT_DIAGRAM_SPATIAL_CAMERA:DiagramSpatialPose['camera']={yaw:0,elevation:0};
export const hasSpatialFoldAngles=(doc:Doc)=>doc.segments.some(s=>(s.assignment==='M'||s.assignment==='V')&&(s.angle===null||typeof s.angle==='number'&&Math.abs(s.angle)!==180));
/** Zero angles still need the angle-aware solver, but do not enable a spatial view. */
export const hasNonFlatFoldAngles=(doc:Doc)=>doc.segments.some(s=>(s.assignment==='M'||s.assignment==='V')&&(s.angle===null||typeof s.angle==='number'&&Math.abs(s.angle)>0&&Math.abs(s.angle)<180));
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const vector=(p:unknown,n:number,limit=1e6):p is number[]=>Array.isArray(p)&&p.length===n&&p.every(v=>finite(v)&&Math.abs(v)<=limit);
function checkCamera(camera:DiagramSpatialPose['camera']){
  if(!camera||!finite(camera.yaw)||!finite(camera.elevation)||Math.abs(camera.yaw)>360||Math.abs(camera.elevation)>360)throw Error('空间视角必须包含有限的旋转角和俯仰角。');
  if(camera.frame)checkTransform(camera.frame);
  if(camera.rotation)checkTransform({rotation:camera.rotation,translation:[0,0,0]});
  if(camera.pivot&&!vector(camera.pivot,3)||camera.offset&&!vector(camera.offset,3))throw Error('视角旋转中心无效。');
}
export function projectDiagramSpatialPoint(p:readonly number[],camera=DEFAULT_DIAGRAM_SPATIAL_CAMERA):[number,number,number]{
  checkCamera(camera);if(!vector(p,3))throw Error('空间投影顶点无效。');
  if(camera.frame){const {rotation:r,translation:t}=camera.frame,q=p.map((v,k)=>v-t[k]);p=[r[0]*q[0]+r[3]*q[1]+r[6]*q[2],r[1]*q[0]+r[4]*q[1]+r[7]*q[2],r[2]*q[0]+r[5]*q[1]+r[8]*q[2]];}
  if(camera.rotation){const r=camera.rotation,q=p.map((v,k)=>v-(camera.pivot?.[k]??0));return [0,1,2].map(i=>r[i*3]*q[0]+r[i*3+1]*q[1]+r[i*3+2]*q[2]+(camera.offset?.[i]??0)) as [number,number,number];}
  const y=camera.yaw*Math.PI/180,e=camera.elevation*Math.PI/180,c=Math.cos(y),s=Math.sin(y),ce=Math.cos(e),se=Math.sin(e);
  return [c*p[0]+s*p[1],(-s*p[0]+c*p[1])*ce-p[2]*se,(-s*p[0]+c*p[1])*se+p[2]*ce];
}
function checkTransform(t:RigidFoldTransform3D){
  if(!t||!vector(t.rotation,9,1+1e-8)||!vector(t.translation,3))throw Error('空间纸面变换必须是有限的行优先 3×3 旋转矩阵与三维平移。');
  const r=t.rotation;
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(Math.abs(r[i]*r[j]+r[i+3]*r[j+3]+r[i+6]*r[j+6]-(i===j?1:0))>1e-8)throw Error('空间纸面变换包含缩放或剪切。');
  const det=r[0]*(r[4]*r[8]-r[5]*r[7])-r[1]*(r[3]*r[8]-r[5]*r[6])+r[2]*(r[3]*r[7]-r[4]*r[6]);
  if(Math.abs(det-1)>1e-8)throw Error('空间纸面变换不是保持材料方向的三维旋转。');
}
export function spatialFaceMatrix(spatial:DiagramSpatialPose,face:number):DiagramFoldMatrix {
  const t=spatial.faceTransforms[face];checkTransform(t);
  const o=projectDiagramSpatialPoint(applyRigidFoldTransform(t,[0,0,0]),spatial.camera),x=projectDiagramSpatialPoint(applyRigidFoldTransform(t,[1,0,0]),spatial.camera),y=projectDiagramSpatialPoint(applyRigidFoldTransform(t,[0,1,0]),spatial.camera);
  return [x[0]-o[0],x[1]-o[1],y[0]-o[0],y[1]-o[1],o[0],o[1]];
}
export function liftDiagramFoldMatrix(m:DiagramFoldMatrix):RigidFoldTransform3D {
  if(!vector(m,6))throw Error('原固定纸面二维变换无效。');
  const [a,b,c,d,x,y]=m,t={rotation:[a,c,0,b,d,0,0,0,a*d-b*c],translation:[x,y,0] as RigidFoldPoint3};checkTransform(t);return t;
}
function depthPlanes(spatial:DiagramSpatialPose){
  return spatial.faceTransforms.map((t,f)=>{
    const m=spatialFaceMatrix(spatial,f),d=m[0]*m[3]-m[1]*m[2];
    if(Math.abs(d)<Number.EPSILON*64)return null; // Exact edge-on faces remain indexed and render as edges, with no area to occlude.
    const o=projectDiagramSpatialPoint(applyRigidFoldTransform(t,[0,0,0]),spatial.camera),u=projectDiagramSpatialPoint(applyRigidFoldTransform(t,[1,0,0]),spatial.camera)[2]-o[2],v=projectDiagramSpatialPoint(applyRigidFoldTransform(t,[0,1,0]),spatial.camera)[2]-o[2],a=(u*m[3]-v*m[1])/d,b=(-u*m[2]+v*m[0])/d;
    return {at:(p:Point)=>o[2]+a*(p[0]-o[0])+b*(p[1]-o[1]),condition:1+Math.abs(a)+Math.abs(b)};
  });
}
function completeRegions(result:FlatFoldResult){
  const precision=modelSurfacePrecision(result.geometry.vertices);let epsilon=precision.defaultEpsilon;
  for(;;){
    const regions=modelOverlapRegions(result,epsilon);if(!regions.omittedThinRegions)return regions;
    const next=Math.max(precision.minimumEpsilon,epsilon/8);
    if(next>=epsilon)throw Error('空间纸面投影存在低于当前坐标精度的区域，未省略纸面；请调整视角。');
    epsilon=next;
  }
}

// A live verified pose retains its full value binding independently of the
// optional shared cache. Weak keys never keep old projects alive. The binding
// is rechecked on every use, so mutating a pose cannot reuse stale evidence.
type ContactOrders=NonNullable<FlatFoldResult['layers']['faceOrders']>;
const liveSpatialProofs=new WeakMap<DiagramSpatialPose,{key:string;layers:FlatFoldResult['layers'];contacts:ContactOrders}>();
// The bounded value cache only accelerates project structuredClone operations.
// Files cannot supply proof; history restoration rebuilds it in order, even
// when a single binding exceeds the shared cache's entire byte budget.
const spatialProofs=new Map<string,{layers:FlatFoldResult['layers'];contacts:ContactOrders;bytes:number}>();let proofBytes=0;
function proofKey(source:FoldGraph,spatial:DiagramSpatialPose,result:FlatFoldResult){return JSON.stringify([source,spatial,result.geometry.vertices,result.geometry.faces,result.geometry.startingFace??0,result.layers.faceOrders??null,result.layers.faceOrder??null]);}
function remember(source:FoldGraph,spatial:DiagramSpatialPose,result:FlatFoldResult,contacts:ContactOrders=[]){
  const key=proofKey(source,spatial,result),layers=structuredClone(result.layers),bytes=2*(key.length+JSON.stringify(layers).length+JSON.stringify(contacts).length);
  contacts=structuredClone(contacts);liveSpatialProofs.set(spatial,{key,layers,contacts});
  const prior=spatialProofs.get(key);if(prior){proofBytes-=prior.bytes;spatialProofs.delete(key);}
  const visiblePairs=new Set((layers.faceOrders??[]).map(([a,b])=>[a,b].sort((x,y)=>x-y).join(':')));
  // An edge-on value can look identical under different valid contact histories.
  // Keep its hidden evidence on this verified object only; a clone must rebuild
  // chronology instead of borrowing another history through the value cache.
  if(bytes>8_000_000||contacts.some(([a,b])=>!visiblePairs.has([a,b].sort((x,y)=>x-y).join(':'))))return;
  spatialProofs.set(key,{layers,contacts,bytes});proofBytes+=bytes;
  while(spatialProofs.size>16||proofBytes>8_000_000){const oldest=spatialProofs.keys().next().value!;proofBytes-=spatialProofs.get(oldest)!.bytes;spatialProofs.delete(oldest);}
}
function materialGraphMatches(source:FoldGraph,result:FlatFoldResult){
  const graph=result.geometry.graph;
  if(!graph||!same(result.geometry.faces,source.faces_vertices)||!same(graph.vertices_coords,result.geometry.vertices))throw Error('空间姿态的显示面与材料面身份不一致。');
  for(const key of ['edges_vertices','edges_assignment','edges_foldAngle','faces_vertices','faces_edges','edges_faces','faces_holes','faces_holeEdges','zhezhi_flatCreases'])if(!same(graph[key]??null,source[key]??null))throw Error('空间姿态材料字段 '+key+' 与来源 CP 不一致。');
}
function validatedSpatialGeometry(pose:DiagramPose){
  const s=pose.spatial;if(!s)throw Error('缺少真实空间姿态。');
  const graph=buildDiagramFold(pose.sourceDoc).graph;materialGraphMatches(graph,pose.result);
  const root=pose.result.geometry.startingFace??0,check=solveRigidFoldGeometry(graph,{startingFace:root,fixedFaceTransform:s.faceTransforms[root],edgesFoldAngle:graph.edges_foldAngle.map((a,e)=>a===null&&['M','V'].includes(graph.edges_assignment[e])?s.measuredAngles[e]:a)});
  if(check.status!=='ready')throw Error(check.message);
  const tolerance=check.diagnostics.positionToleranceMm*4;
  if(s.vertices.length!==check.vertices.length||check.vertices.some((p,i)=>Math.hypot(...p.map((v,k)=>v-s.vertices[i][k]))>tolerance))throw Error('保存的空间姿态与 CP 折角不一致，请重新计算。');
  if(s.measuredAngles.length!==check.measuredAngles.length||s.measuredAngles.some((a,i)=>a===null?check.measuredAngles[i]!==null:check.measuredAngles[i]===null||Math.abs(a-check.measuredAngles[i]!)>1e-5))throw Error('空间姿态的实际折角记录无效。');
  for(let f=0;f<s.faceTransforms.length;f++){
    const a=s.faceTransforms[f],b=check.faceTransforms[f];
    if(a.rotation.some((v,k)=>Math.abs(v-b.rotation[k])>1e-8)||a.translation.some((v,k)=>Math.abs(v-b.translation[k])>tolerance))throw Error('空间纸面变换与实际姿态不一致。');
  }
  if(s.vertices.some((p,i)=>{const q=projectDiagramSpatialPoint(p,s.camera),shown=pose.result.geometry.vertices[i];return Math.hypot(q[0]-shown[0],q[1]-shown[1])>tolerance;}))throw Error('空间姿态投影与主图不一致。');
  return {graph,check};
}
export function validateDiagramSpatialPose(pose:DiagramPose,full=false):void {
  const s=pose.spatial;if(s===undefined)return;
  if(!s||s.version!==1||!Array.isArray(s.vertices)||s.vertices.length!==pose.result.geometry.vertices.length||s.vertices.some(p=>!vector(p,3))||!Array.isArray(s.faceTransforms)||s.faceTransforms.length!==pose.result.geometry.faces.length||!Array.isArray(s.measuredAngles)||s.measuredAngles.some(a=>a!==null&&(!finite(a)||Math.abs(a)>180)))throw Error('空间折叠姿态数据无效。');
  checkCamera(s.camera);s.faceTransforms.forEach(checkTransform);
  for(const rows of [s.layerContacts,s.layerConstraints])if(rows!==undefined&&(!Array.isArray(rows)||rows.some(row=>!Array.isArray(row)||row.length!==3||row[0]===row[1]||row.slice(0,2).some(f=>!Number.isSafeInteger(f)||f<0||f>=s.faceTransforms.length)||Math.abs(row[2])!==1)))throw Error('保存的立体纸层关系无效。');
  if(pose.result.geometry.vertices.some(p=>!vector(p,2)))throw Error('空间姿态的二维投影数据无效。');
  if(full)validatedSpatialGeometry(pose);
}

function flatPreviousState(previous:DiagramPose,graph:FoldGraph){
  materialGraphMatches(graph,previous.result);
  const root=previous.result.geometry.startingFace??0,face=graph.faces_vertices?.[root];
  if(!face)throw Error('前一步固定纸面无效。');
  const original=graph.vertices_coords,shown=previous.result.geometry.vertices,a=face[0];let b=face[1];
  for(const v of face)if(Math.hypot(original[v][0]-original[a][0],original[v][1]-original[a][1])>Math.hypot(original[b][0]-original[a][0],original[b][1]-original[a][1]))b=v;
  const length=Math.hypot(original[b][0]-original[a][0],original[b][1]-original[a][1]),u:Point=[(original[b][0]-original[a][0])/length,(original[b][1]-original[a][1])/length],v:Point=[(shown[b][0]-shown[a][0])/length,(shown[b][1]-shown[a][1])/length],parity=Math.sign(polygonArea(face.map(i=>original[i]))*polygonArea(face.map(i=>shown[i])));
  const xx=v[0]*u[0]+parity*v[1]*u[1],xy=v[0]*u[1]-parity*v[1]*u[0],yx=v[1]*u[0]-parity*v[0]*u[1],yy=v[1]*u[1]+parity*v[0]*u[0],fixed=liftDiagramFoldMatrix([xx,yx,xy,yy,shown[a][0]-xx*original[a][0]-xy*original[a][1],shown[a][1]-yx*original[a][0]-yy*original[a][1]]);
  const rigid=solveRigidFoldGeometry(graph,{startingFace:root,fixedFaceTransform:fixed});
  if(rigid.status!=='ready'||rigid.vertices.some((p,i)=>Math.hypot(p[0]-shown[i][0],p[1]-shown[i][1],p[2])>rigid.diagnostics.positionToleranceMm*4))throw Error('前一步不是与来源 CP 一致的刚性平折姿态，不能继承纸层。');
  const index=previous.layerSolutionIndex??previous.result.layers.solutionIndex??0;
  if(!Number.isSafeInteger(index)||index<0)throw Error('前一步纸层候选编号无效。');
  // Re-solve against verified geometry, without trusting the saved faceOrder.
  const rebuilt=recomputeFlatLayers(previous.result,{solutionIndex:index});
  if(rebuilt.layers.status!=='solved')throw Error('前一步纸层尚未重新确认：'+rebuilt.layers.message);
  return {layers:rebuilt.layers,faceTransforms:rigid.faceTransforms};
}
function previousLayers(previous:DiagramPose,graph:FoldGraph){
  if(!previous.spatial)return flatPreviousState(previous,graph).layers;
  validateDiagramSpatialPose(previous,true);
  const key=proofKey(graph,previous.spatial,previous.result),live=liveSpatialProofs.get(previous.spatial);
  if(live?.key===key)return structuredClone(live.layers);
  const proof=spatialProofs.get(key);
  if(proof){liveSpatialProofs.set(previous.spatial,{key,layers:proof.layers,contacts:proof.contacts});return structuredClone(proof.layers);}
  // Strict depth can be rebuilt alone. Coplanar ancestry must be restored first.
  return spatialLayers(previous.result,previous.spatial,graph);
}
function previousContacts(previous:DiagramPose,graph:FoldGraph):ContactOrders {
  previousLayers(previous,graph);
  return previous.spatial?liveSpatialProofs.get(previous.spatial)?.contacts??[]:[];
}
/** Camera-independent, geometrically checked touching material banks. */
export function diagramSpatialContactOrders(pose:DiagramPose):ContactOrders {
 if(!pose.spatial)return [];
 return structuredClone(previousContacts(pose,buildDiagramFold(pose.sourceDoc).graph));
}
/** An internal unchanged snapshot copy can retain its originating live proof.
 * JSON and arbitrary structured clones still have to rebuild their ancestry. */
export function cloneDiagramPoseWithSpatialProof(pose:DiagramPose):DiagramPose {
  const copy=structuredClone(pose),proof=pose.spatial&&liveSpatialProofs.get(pose.spatial);
  if(proof){
    const source=buildDiagramFold(pose.sourceDoc).graph;
    if(proof.key===proofKey(source,pose.spatial!,pose.result))remember(source,copy.spatial!,copy.result,proof.contacts);
  }
  return copy;
}
/** Whole CP-region coverage prevents child vertices from concealing a bridge
 * across a concave parent or a hole. */
function parentFaces(source:FoldGraph,old:FoldGraph):number[]{
  const offset=source.vertices_coords.length,count=source.faces_vertices!.length,vertices=[...source.vertices_coords,...old.vertices_coords],faces=[...source.faces_vertices!,...old.faces_vertices!.map(r=>r.map(v=>v+offset))],holes=[...source.faces_vertices!.map((_,f)=>source.faces_holes?.[f]??[]),...old.faces_vertices!.map((_,f)=>(old.faces_holes?.[f]??[]).map(r=>r.map(v=>v+offset)))];
  const graph:FoldGraph={vertices_coords:vertices,faces_vertices:faces,faces_holes:holes,edges_vertices:[],edges_assignment:[],edges_foldAngle:[]};
  const result:FlatFoldResult={geometry:{status:'ready',message:'',vertices,faces,graph},layers:{status:'unknown',message:''},warnings:[]},parents=Array.from({length:count},()=>new Set<number>());
  for(const cell of completeRegions(result).cells)for(const f of cell.faces.filter(f=>f<count)){
    const covered=cell.faces.filter(f=>f>=count).map(f=>f-count);
    if(covered.length!==1)parents[f].add(-1);else parents[f].add(covered[0]);
  }
  return parents.map(p=>p.size===1?[...p][0]:-1);
}

/** Tests affine depth over every actual overlap region. An interior sign
 * crossing proves intersection, but this is not full collision/path certification. */
interface SpatialInheritance {graph:FoldGraph;parents:number[];orders:ContactOrders;faceTransforms:RigidFoldTransform3D[]}
function spatialLayers(result:FlatFoldResult,spatial:DiagramSpatialPose,source:FoldGraph,previous?:DiagramPose,prepared?:SpatialInheritance,chosen?:ContactOrders):FlatFoldResult['layers']{
  if(previous?.spatial&&!prepared)validateDiagramSpatialPose(previous,true);
  const selected=chosen??(spatial.layerContacts?.length||spatial.layerConstraints?.length?solveSpatialLayerContacts(source,spatial,[]).contacts:[]);
  const selectedPairs=new Map(selected.map(([a,b,s])=>[a+':'+b,s]));
  const selectedSign=(a:number,b:number)=>selectedPairs.has(a+':'+b)?selectedPairs.get(a+':'+b)!*Math.sign(polygonArea(result.geometry.faces[b].map(v=>result.geometry.vertices[v]))):selectedPairs.has(b+':'+a)?-selectedPairs.get(b+':'+a)!*Math.sign(polygonArea(result.geometry.faces[a].map(v=>result.geometry.vertices[v]))):0;
  const planes=depthPlanes(spatial),regions=planes.some(Boolean)?completeRegions(result):{cells:[]},faces=result.geometry.faces,vertices=result.geometry.vertices,relations=new Map<string,[number,number]>();
  // A real fully folded hinge determines its two material banks even when
  // those banks were edge-on in the predecessor camera. Rebuild this local
  // contact from the verified angle and assignment, never a saved screen rank.
  const adjacent=new Map<string,number>();
  source.edges_faces?.forEach((banks,e)=>{
    const angle=spatial.measuredAngles[e],kind=source.edges_assignment[e];
    if(banks.length!==2||typeof angle!=='number'||Math.abs(Math.abs(angle)-180)>1e-7||!['M','V'].includes(kind))return;
    const [a,b]=banks,normal=Math.sign(polygonArea(faces[a].map(v=>vertices[v])));if(!normal)return;
    const sign=(kind==='M'?1:-1)*normal;
    adjacent.set(a+':'+b,sign);adjacent.set(b+':'+a,-sign);
  });
  let inheritance:SpatialInheritance|undefined=prepared;
  const inheritedSource=()=>{
    if(!previous)return undefined;
    if(!inheritance){
      const graph=buildDiagramFold(previous.sourceDoc).graph;
      const state=previous.spatial?{layers:previousLayers(previous,graph),faceTransforms:previous.spatial.faceTransforms}:flatPreviousState(previous,graph);
      inheritance={graph,parents:parentFaces(source,graph),faceTransforms:state.faceTransforms,orders:[...(state.layers.faceOrders??[]),...(previous.spatial?previousContacts(previous,graph):[])]};
    }
    return inheritance;
  };
  const inherited=(a:number,b:number)=>{
    const origin=inheritedSource();if(!origin)return 0;
    const {parents,graph,orders}=origin,pa=parents[a],pb=parents[b];if(pa<0||pb<0||pa===pb)return 0;
    const row=orders.find(r=>r[0]===pa&&r[1]===pb||r[0]===pb&&r[1]===pa);if(!row)return 0;
    const forward=row[0]===pa,child=forward?b:a,parent=forward?pb:pa;
    const currentNormal=Math.sign(polygonArea(faces[child].map(v=>vertices[v]))),currentCP=Math.sign(polygonArea(source.faces_vertices![child].map(v=>source.vertices_coords[v]))),oldCP=Math.sign(polygonArea(graph.faces_vertices![parent].map(v=>graph.vertices_coords[v])));
    return (forward?1:-1)*row[2]*currentNormal*currentCP*oldCP;
  };
  let magnitude=1;for(const p of spatial.vertices)for(const n of p)magnitude=Math.max(magnitude,Math.abs(n));
  const roundoff=magnitude*Number.EPSILON*512;
  const contacts=new Map<string,ContactOrders[number]>(selected.map(row=>[[row[0],row[1]].sort((a,b)=>a-b).join(':'),row]));
  const addRelation=(a:number,b:number,sign:number,contact:boolean)=>{
    const pair:[number,number]=sign>0?[b,a]:[a,b],key=[a,b].sort((x,y)=>x-y).join(':'),prior=relations.get(key);
    if(prior&&(prior[0]!==pair[0]||prior[1]!==pair[1]))throw Error('同一对纸面在不同区域的前后关系相反，当前纸层格式不能完整表示。');
    relations.set(key,pair);
    if(contact)contacts.set(key,[pair[1],pair[0],Math.sign(polygonArea(faces[pair[0]].map(v=>vertices[v])))]);
    return pair;
  };
  for(const cell of regions.cells){
   const local=new Map<number,number[]>(),unresolved:[number,number][]=[];
   for(let i=0;i<cell.faces.length;i++)for(let j=i+1;j<cell.faces.length;j++){
    const a=cell.faces[i],b=cell.faces[j],planeA=planes[a],planeB=planes[b];
    if(!planeA||!planeB)throw Error('侧立纸面出现非零面积投影，无法确认遮挡。');
    const depths=cell.polygon.map(p=>planeA.at(p)-planeB.at(p)),tolerance=roundoff*(planeA.condition+planeB.condition),positive=depths.some(d=>d>tolerance),negative=depths.some(d=>d< -tolerance);
    if(depths.some(d=>!Number.isFinite(d)))throw Error('空间深度精度无效。');
    if(positive&&negative)throw Error('空间纸面 F'+(a+1)+' 与 F'+(b+1)+' 在重叠区域内部相交，请调整折角。');
    const sign=positive?1:negative?-1:adjacent.get(a+':'+b)??(selectedSign(a,b)||inherited(a,b));
    if(!sign){unresolved.push([a,b]);continue;}
    const [bottom,top]=addRelation(a,b,sign,!positive&&!negative),above=local.get(bottom)??[];above.push(top);local.set(bottom,above);
   }
   // A newly folded hinge can connect two already verified touching stacks.
   // Infer only through faces covering this same region: global reachability
   // would incorrectly turn valid cyclic local stacking into a whole-face rank.
   const reach=new Map<number,Set<number>>();
   const above=(face:number)=>{
     let found=reach.get(face);if(found)return found;
     found=new Set<number>();const queue=[...(local.get(face)??[])];
     for(let head=0;head<queue.length;head++){const next=queue[head];if(found.has(next))continue;found.add(next);queue.push(...(local.get(next)??[]));}
     if(found.has(face))throw Error('同一重叠区域的纸层关系形成循环，无法确认遮挡。');
     reach.set(face,found);return found;
   };
   for(const [a,b] of unresolved){
     const ab=above(a).has(b),ba=above(b).has(a);
     if(!ab&&!ba)throw Error('空间纸面 F'+(a+1)+' 与 F'+(b+1)+' 共面，缺少已验证的前一步纸层；请按步骤顺序恢复。');
     addRelation(a,b,ab?-1:1,true);
   }
  }
  // A camera can flatten an already verified physical contact to a line. Keep
  // that proof privately for later steps, only if the two material banks still
  // have the same relative rigid transform and remain truly coplanar. These
  // dormant contacts are not visible faceOrders or zero-normal certificates.
  // A flat predecessor also has verified 3D material transforms: a whole flat
  // stack can turn upright on its first spatial step and hide these contacts.
  if(previous&&(previous.spatial||planes.some(plane=>!plane))){
    const origin=inheritedSource()!,children=new Map<number,number[]>();
    origin.parents.forEach((parent,child)=>{if(parent<0)return;const group=children.get(parent)??[];group.push(child);children.set(parent,group);});
    const relative=(a:RigidFoldTransform3D,b:RigidFoldTransform3D)=>{
      const r=a.rotation,s=b.rotation,d=b.translation.map((v,k)=>v-a.translation[k]);
      return [...Array.from({length:9},(_,k)=>{const i=Math.floor(k/3),j=k%3;return r[i]*s[j]+r[i+3]*s[j+3]+r[i+6]*s[j+6];}),...Array.from({length:3},(_,i)=>r[i]*d[0]+r[i+3]*d[1]+r[i+6]*d[2])];
    };
    for(const [pa,pb,sign] of origin.orders)for(const a of children.get(pa)??[])for(const b of children.get(pb)??[]){
      const key=[a,b].sort((x,y)=>x-y).join(':');if(a===b||contacts.has(key))continue;
      const now=relative(spatial.faceTransforms[a],spatial.faceTransforms[b]),old=relative(origin.faceTransforms[pa],origin.faceTransforms[pb]);
      if(Math.abs(now[2])>1e-8||Math.abs(now[5])>1e-8||Math.abs(Math.abs(now[8])-1)>1e-8||Math.abs(now[11])>roundoff*4)continue;
      if(now.some((v,k)=>Math.abs(v-old[k])>(k<9?1e-8:roundoff*4)))continue;
      const childCP=Math.sign(polygonArea(source.faces_vertices![b].map(v=>source.vertices_coords[v]))),parentCP=Math.sign(polygonArea(origin.graph.faces_vertices![pb].map(v=>origin.graph.vertices_coords[v])));
      contacts.set(key,[a,b,sign*childCP*parentCP]);
    }
  }
  const next=faces.map(()=>[] as number[]),incoming=faces.map(()=>0);for(const [a,b] of relations.values()){next[a].push(b);incoming[b]++;}
  const queue=incoming.flatMap((n,f)=>n===0?[f]:[]),order:number[]=[];
  for(let head=0;head<queue.length;head++){const f=queue[head];order.push(f);for(const g of next[f])if(--incoming[g]===0)queue.push(g);}
  const faceOrders:[number,number,number][]=[...relations.values()].map(([bottom,top])=>[top,bottom,Math.sign(polygonArea(faces[bottom].map(v=>vertices[v])))]);
  const layers:FlatFoldResult['layers']={status:'solved',message:'已按真实空间深度及验证后的共面关系确认投影遮挡；不代表连续路径或完整碰撞认证。',...(order.length===faces.length?{faceOrder:order}:{}),faceOrders,solutionIndex:0};
  layers.relativeConstraints=(spatial.layerConstraints??[]).flatMap(([a,b,sign])=>{const normal=Math.sign(polygonArea(faces[b].map(v=>vertices[v])));return normal?[sign*normal>0?{above:a,below:b}:{above:b,below:a}]:[];});
  remember(source,spatial,{...result,layers},[...contacts.values()]);return layers;
}
export function createDiagramSpatialPose(doc:Doc,startingFace=0,fixed?:DiagramFoldAnchor,previous?:DiagramPose,camera=previous?.spatial?.camera??DEFAULT_DIAGRAM_SPATIAL_CAMERA,worldCamera=false):{result:FlatFoldResult;spatial:DiagramSpatialPose}{
  checkCamera(camera);const graph=buildDiagramFold(doc).graph;
  const solved=solveRigidFoldGeometry(graph,{startingFace,edgesFoldAngle:solveAdaptiveFoldAngles(graph),...(fixed?{fixedFaceTransform:fixed.spatialTransform??liftDiagramFoldMatrix(fixed.matrix)}:{})});
  if(solved.status!=='ready')throw Error(solved.message);
  camera={...camera,frame:structuredClone(worldCamera?{rotation:[1,0,0,0,1,0,0,0,1],translation:[0,0,0]}:solved.faceTransforms[startingFace])};
  const spatial:DiagramSpatialPose={version:1,vertices:solved.vertices,faceTransforms:solved.faceTransforms,measuredAngles:solved.measuredAngles,camera:{...camera}},vertices=spatial.vertices.map(p=>projectDiagramSpatialPoint(p,camera)).map(([x,y]):Point=>[x,y]);
  const result:FlatFoldResult={geometry:{status:'ready',message:'已按设定折角生成真实空间姿态。',vertices,faces:structuredClone(graph.faces_vertices!),graph:{...structuredClone(graph),vertices_coords:vertices},startingFace},layers:{status:'unknown',message:'正在确认空间遮挡。'},warnings:[]};
  result.geometry.graph!.zhezhi_spatialEdgeOnFaces=depthPlanes(spatial).flatMap((plane,f)=>plane?[]:[f]);
  result.layers=spatialLayers(result,spatial,graph,previous);return {result,spatial};
}
/** Reorient an already solved physical pose. No adaptive angle solve, root
 * selection or material transform is changed by a camera gesture. Serialized
 * history is verified on private copies before any contact relation is reused. */
export function reprojectDiagramSpatialPose(pose:DiagramPose,camera:DiagramSpatialPose['camera'],history:readonly DiagramPose[]=[]):{result:FlatFoldResult;spatial:DiagramSpatialPose}{
  return createDiagramSpatialProjector(pose,history)(camera);
}
/** An isolated preview session verifies history once. Its immutable material
 * and contact proof is reused for every camera frame, never borrowed by files. */
export function createDiagramSpatialProjector(pose:DiagramPose,history:readonly DiagramPose[]=[]){
  validateDiagramSpatialPose(pose,true);
  if(!pose.spatial)throw Error('当前纸面没有可转动的立体姿态。');
  if(pose.paperDeformation?.nodes.length)throw Error('请先退出拖角状态再转动空间视角。');
  const base=structuredClone(pose),source=buildDiagramFold(base.sourceDoc).graph;
  if(history.length){
    const verified=structuredClone(history);prepareDiagramSpatialHistory(verified);
    base.result.layers=spatialLayers(base.result,base.spatial!,source,verified.at(-1));
  }else base.result.layers=previousLayers(pose,source);
  if(!history.length)remember(source,base.spatial!,base.result,previousContacts(pose,source));
  const contacts=previousContacts(base,source),prepared:SpatialInheritance={graph:source,parents:source.faces_vertices!.map((_,f)=>f),orders:contacts,faceTransforms:base.spatial!.faceTransforms};
  return (camera:DiagramSpatialPose['camera']):{result:FlatFoldResult;spatial:DiagramSpatialPose}=>{
  checkCamera(camera);
  const spatial:DiagramSpatialPose={...base.spatial!,camera:{...camera,frame:base.spatial!.camera.frame}};
  const vertices=spatial.vertices.map(p=>projectDiagramSpatialPoint(p,spatial.camera)).map(([x,y]):Point=>[x,y]);
  const result:FlatFoldResult={...base.result,geometry:{...base.result.geometry,vertices,graph:{...base.result.geometry.graph!,vertices_coords:vertices}},layers:{status:'unknown',message:'正在确认新视角遮挡。'}};
  result.geometry.graph!.zhezhi_spatialEdgeOnFaces=depthPlanes(spatial).flatMap((plane,f)=>plane?[]:[f]);
  result.layers=spatialLayers(result,spatial,source,base,prepared,contacts);return {result,spatial};
  };
}
export function adjustDiagramSpatialLayers(pose:DiagramPose,request:SpatialLayerRequest,history:readonly DiagramPose[]=[]):{result:FlatFoldResult;spatial:DiagramSpatialPose}{
  const base={...pose,...createDiagramSpatialProjector(pose,history)(pose.spatial!.camera)},source=buildDiagramFold(base.sourceDoc).graph;
  const solved=solveSpatialLayerContacts(source,base.spatial,diagramSpatialContactOrders(base),request,base.result);
  const spatial={...base.spatial,layerContacts:solved.contacts,layerConstraints:solved.constraints};
  const result={...base.result,layers:spatialLayers(base.result,spatial,source,base,undefined,solved.contacts)};
  result.layers.message=solved.message;remember(source,spatial,result,solved.contacts);
  return {result,spatial};
}
/** Saved orders are replaced, never reused as proof. Call in chronological order. */
export function restoreDiagramSpatialLayers(pose:DiagramPose,previous?:DiagramPose):void {
  validateDiagramSpatialPose(pose,true);
  const {graph,check}=validatedSpatialGeometry(pose),spatial=pose.spatial!;
  // Canonicalize tolerated JSON roundoff before evaluating the depth planes.
  spatial.vertices=check.vertices;spatial.faceTransforms=check.faceTransforms;spatial.measuredAngles=check.measuredAngles;
  const vertices=spatial.vertices.map(p=>projectDiagramSpatialPoint(p,spatial.camera)).map(([x,y]):Point=>[x,y]);pose.result.geometry.vertices=vertices;pose.result.geometry.graph!.vertices_coords=vertices;
  pose.result.geometry.graph!.zhezhi_spatialEdgeOnFaces=depthPlanes(spatial).flatMap((plane,f)=>plane?[]:[f]);
  pose.result.layers=spatialLayers(pose.result,spatial,graph,previous);
  if(pose.result.layers.faceOrder)pose.displayOrder=[...pose.result.layers.faceOrder];else delete pose.displayOrder;
}
/** Worker inputs need contact ancestry rebuilt after crossing the clone boundary. */
export function prepareDiagramSpatialHistory(poses:readonly (DiagramPose|null|undefined)[]):void {
  let previous:DiagramPose|undefined;
  for(const pose of poses){if(!pose)continue;if(pose.spatial)restoreDiagramSpatialLayers(pose,previous);previous=pose;}
}
export function completedSpatialCreases(pose:DiagramPose):Segment[]{
  validateDiagramSpatialPose(pose,true);const graph=buildDiagramFold(pose.sourceDoc).graph,s=pose.spatial!;
  return graph.edges_vertices.flatMap(([a,b],e)=>typeof s.measuredAngles[e]==='number'&&Math.abs(s.measuredAngles[e]!)>1e-5&&['M','V'].includes(graph.edges_assignment[e])?[{id:'completed:'+e,a:graph.vertices_coords[a],b:graph.vertices_coords[b],assignment:graph.edges_assignment[e] as 'M'|'V',angle:s.measuredAngles[e]!}]:[]);
}
