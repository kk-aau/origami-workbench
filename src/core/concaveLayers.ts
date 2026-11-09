import {validateRelativeLayerConstraints} from './relativeLayerConstraints';
import ear from 'rabbit-ear';
import earcut from 'earcut';
import type {FoldGraph,Point,FlatLayerPreference,FlatFoldConflict,FlatConflictKind} from './types';
import {makeLayerConflict} from './flatConflictDiagnostics';
import type {FaceOrder} from './layerSolutions';
import {polygonArea,cross,sub,distance} from './geometry';
import {materialFaceRings} from './materialRings';
import {triangulateMaterialHoleFace} from './materialHoleTriangles';
import {validateMaterialFaceRings} from './materialTopology';
import {hasWeakMaterialRings} from './materialWeak';
import {materialLayerRegions} from './materialLayerRegions';
import {resolvedLayerTriangles,triangleLayerOverlaps,preservingTriangleConstraints} from './triangleLayerConstraints';
import {reportFlatComputationProgress} from './flatComputationProgress';

type Category='taco_taco'|'taco_tortilla'|'tortilla_tortilla'|'transitivity';
const categories:Category[]=['taco_taco','taco_tortilla','tortilla_tortilla','transitivity'];
const clauseKinds:FlatConflictKind[]=[...categories,'adjacent','relative-order'];
const key=(a:number,b:number)=>a<b?`${a} ${b}`:`${b} ${a}`;
class Unsupported extends Error{}
function refuse(message:string):never{throw new Unsupported(message);}
const pairs=(type:Category,f:number[]):[number,number][]=>({
 taco_taco:[[f[0],f[2]],[f[1],f[3]],[f[1],f[2]],[f[0],f[3]],[f[0],f[1]],[f[2],f[3]]],
 taco_tortilla:[[f[0],f[2]],[f[0],f[1]],[f[1],f[2]]],
 tortilla_tortilla:[[f[0],f[2]],[f[1],f[3]]],
 transitivity:[[f[0],f[1]],[f[1],f[2]],[f[2],f[0]]],
}[type] as [number,number][]);

/** Inclusive non-adjacent contact is invalid as well as a proper crossing. */
export function isSimpleLayerPolygon(points:Point[],epsilon:number):boolean{
 if(points.length<3||points.some(p=>p.length!==2||!p.every(Number.isFinite))||Math.abs(polygonArea(points))<=epsilon*epsilon)return false;
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length],ab=distance(a,b);if(ab<=epsilon)return false;
  for(let j=i+1;j<points.length;j++){
   if(j===i+1||(i===0&&j===points.length-1))continue;
   const c=points[j],d=points[(j+1)%points.length],cd=distance(c,d);if(cd<=epsilon)return false;
   const sign=(value:number)=>value>epsilon?1:value< -epsilon?-1:0;
   const s1=sign(cross(sub(b,a),sub(c,a))/ab),s2=sign(cross(sub(b,a),sub(d,a))/ab),s3=sign(cross(sub(d,c),sub(a,c))/cd),s4=sign(cross(sub(d,c),sub(b,c))/cd);
   const on=(p:Point,q:Point,r:Point)=>r[0]>=Math.min(p[0],q[0])-epsilon&&r[0]<=Math.max(p[0],q[0])+epsilon&&r[1]>=Math.min(p[1],q[1])-epsilon&&r[1]<=Math.max(p[1],q[1])+epsilon;
   if((s1*s2<0&&s3*s4<0)||(!s1&&on(a,b,c))||(!s2&&on(a,b,d))||(!s3&&on(c,d,a))||(!s4&&on(c,d,b)))return false;
  }
 }
 return true;
}
const inside=(p:Point,polygon:Point[])=>{
 let hit=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;
 }return hit;
};

/** Earcut can clip a nearly straight convex corner into a numerically empty
 * triangle. Keep the source polygon and all of its boundary vertices, and
 * choose a full-area fan only when the default cut would lose a triangle.
 */
function layerEarcut(epsilon:number){
 return (flat:number[],holes:number[]|null,dimension=2):number[]=>{
  const ordinary=earcut(flat,holes??undefined,dimension);
  if(holes?.length||dimension!==2)return ordinary;
  const points:Point[]=Array.from({length:flat.length/2},(_,i)=>[flat[2*i],flat[2*i+1]]);
  const valid=(indices:number[])=>{
   if(indices.length!==3*(points.length-2))return false;
   const triangles=Array.from({length:indices.length/3},(_,i)=>indices.slice(3*i,3*i+3));
   const graph={vertices_coords:points,faces_vertices:triangles};
   return [ear.graph.makeFacesPolygon(graph),ear.graph.makeFacesPolygon(graph,epsilon)]
    .every(polygons=>polygons.every(p=>p.length===3));
  };
  if(valid(ordinary))return ordinary;
  const area=polygonArea(points),sign=Math.sign(area);
  if(!sign||points.some((p,i)=>{
   const q=points[(i+1)%points.length],r=points[(i+2)%points.length];
   return sign*cross(sub(q,p),sub(r,q)) < -epsilon*Math.max(distance(p,q),distance(q,r));
  }))return ordinary;
  const oriented=Array.from({length:points.length},(_,i)=>i);
  if(sign<0)oriented.reverse();
  let best:number[]|null=null,bestMinArea=-1;
  for(let start=0;start<oriented.length;start++){
   const order=[...oriented.slice(start),...oriented.slice(0,start)];
   const triangles=Array.from({length:order.length-2},(_,i)=>[order[0],order[i+1],order[i+2]]);
   const flattened=triangles.flat(),areas=triangles.map(t=>Math.abs(polygonArea(t.map(i=>points[i]))));
   const sum=areas.reduce((a,b)=>a+b,0);
   if(Math.abs(sum-Math.abs(area))>Math.max(epsilon*epsilon,Math.abs(area)*1e-10)||
    !valid(flattened))continue;
   const minimum=Math.min(...areas);
   if(minimum>bestMinArea){bestMinArea=minimum;best=flattened;}
  }
  return best??ordinary;
 };
}

type TriangleGraph=FoldGraph&{faces_vertices:number[][];faces_edges:number[][];edges_faces:number[][]};
export interface ConcaveLayerPartition {
 graph:TriangleGraph;
 parent:number[];
 sourceAreas:number[];
 sourceFaceEdges:number[][];
 sourceEdgeFaces:number[][];
 /** Exact original-face ownership of added, private layer-helper vertices. */
 privateVertices:{vertex:number;parent:number}[];
}

/** Never infer parallel slit-bank occurrences from their identical endpoints. */
function sourceIncidence(graph:FoldGraph,faces:number[][]):{faceEdges:number[][];edgeFaces:number[][]}{
 const es=graph.edges_vertices;
 if(!Array.isArray(es)||graph.edges_assignment.length!==es.length||graph.edges_foldAngle.length!==es.length||graph.edges_foldAngle.some((a,e)=>a!==null&&(!Number.isFinite(a)||(['B','F'].includes(graph.edges_assignment[e])&&a!==0)))||es.some(e=>!Array.isArray(e)||e.length!==2||e[0]===e[1]||e.some(v=>!Number.isInteger(v)||v<0||v>=graph.vertices_coords.length)))refuse('凹面层序的原边索引、赋型或折角数组无效。');
 const lookup=new Map<string,number[]>();es.forEach(([a,b],e)=>{const pair=key(a,b);lookup.set(pair,[...(lookup.get(pair)??[]),e]);});
 let faceEdges:number[][];
 if(graph.faces_edges!==undefined){
  const declared=graph.faces_edges;
  if(!Array.isArray(declared)||declared.length!==faces.length||declared.some((list,f)=>!Array.isArray(list)||list.length!==faces[f].length||new Set(list).size!==list.length||list.some((e,k)=>!Number.isInteger(e)||e<0||e>=es.length||key(...es[e])!==key(faces[f][k],faces[f][(k+1)%faces[f].length]))))refuse('原面逐角边关联与实际边端点不一致。');
  faceEdges=declared.map(list=>[...list]);
 }else{
  faceEdges=faces.map(face=>face.map((a,k)=>{
   const matches=lookup.get(key(a,face[(k+1)%face.length]));
   if(!matches?.length)refuse('原面引用不存在的折痕边。');
   if(matches.length!==1)refuse('相同端点的切口两侧边必须提供逐面边关联，不能按端点猜测。');
   return matches[0];
  }));
 }
 if(graph.faces_holes){if(!graph.faces_holeEdges||graph.faces_holeEdges.length!==faces.length||graph.faces_holes.length!==faces.length)refuse('孔洞面需要完整原边关联。');graph.faces_holes.forEach((rs,f)=>{const declared=graph.faces_holeEdges![f];if(!declared||declared.length!==rs.length||rs.some((r,h)=>declared[h]?.length!==r.length||declared[h].some((e,k)=>!Number.isInteger(e)||e<0||e>=es.length||key(...es[e])!==key(r[k],r[(k+1)%r.length]))))refuse('孔洞边角关联无效。');});}
 const edgeFaces=es.map(()=>[] as number[]);faceEdges.forEach((list,f)=>[list,...(graph.faces_holeEdges?.[f]??[])].forEach(r=>r.forEach(e=>edgeFaces[e].push(f))));
 if(edgeFaces.some((owners,e)=>owners.length!==(graph.edges_assignment[e]==='B'?1:2)||new Set(owners).size!==owners.length))refuse('原折痕的单面边界或双面非边界关联无效。');
 if(graph.edges_faces!==undefined){
  const declared=graph.edges_faces;
  if(!Array.isArray(declared)||declared.length!==es.length||declared.some((list,e)=>!Array.isArray(list)||list.some(f=>f!==null&&f!==undefined&&(!Number.isInteger(f)||f<0||f>=faces.length))||
   JSON.stringify(list.filter(f=>f!==null&&f!==undefined).slice().sort((a,b)=>a-b))!==JSON.stringify(edgeFaces[e].slice().sort((a,b)=>a-b))))refuse('原边显式面关联与逐角边关联不一致。');
 }
 if(graph.faces_faces!==undefined){
  const declared=graph.faces_faces;
  if(!Array.isArray(declared)||declared.length!==faces.length||declared.some((list,f)=>!Array.isArray(list)||list.length!==faces[f].length||list.some((other,k)=>{
   const expected=edgeFaces[faceEdges[f][k]].find(owner=>owner!==f);
   return expected===undefined?other!==null&&other!==undefined:other!==expected;
 })))refuse('原面显式邻居与实际切口两侧边关联不一致。');
 }
 return {faceEdges:faceEdges.map((r,f)=>[r,...(graph.faces_holeEdges?.[f]??[])].flat()),edgeFaces};
}

/** Both Rabbit Ear normalization paths must preserve a complete triangle. */
function normalizedTriangles(coords:Point[],triangles:number[][],epsilon:number):boolean {
 const graph={vertices_coords:coords,faces_vertices:triangles};
 return [ear.graph.makeFacesPolygon(graph),ear.graph.makeFacesPolygon(graph,epsilon)].every(polygons=>polygons.every(p=>p.length===3));
}

/** Last-resort ear clipping keeps every boundary occurrence. A notch on (or
 * within the existing distance tolerance of) an ear diagonal blocks that ear,
 * even when floating-point orientation makes ordinary earcut miss it. */
function resolvedEarClip(points:Point[],epsilon:number):number[][]|null {
 const sign=Math.sign(polygonArea(points)),remaining=points.map((_,i)=>i),triangles:number[][]=[];
 while(remaining.length>3){
  let clipped=false;
  for(let i=0;i<remaining.length;i++){
   const t=[remaining[(i+remaining.length-1)%remaining.length],remaining[i],remaining[(i+1)%remaining.length]];
   const [a,b,c]=t.map(v=>points[v]);
   if(sign*cross(sub(b,a),sub(c,a))<=0||!resolvedLayerTriangles(points,[t],epsilon))continue;
   const edges=t.map((v,k)=>{const p=points[v],q=points[t[(k+1)%3]];return {p,vector:sub(q,p),length:distance(p,q)};});
   if(remaining.some(v=>!t.includes(v)&&edges.every(e=>sign*cross(e.vector,sub(points[v],e.p))>=-epsilon*e.length)))continue;
   triangles.push(t);remaining.splice(i,1);clipped=true;break;
  }
  if(!clipped)return null;
 }
 if(!resolvedLayerTriangles(points,[remaining],epsilon))return null;
 triangles.push(remaining);
 return triangles;
}

/**
 * Occurrence-preserving PRIVATE triangulation for layer constraints.
 * The original CP/FF faces and edges remain public identities. If existing
 * earcut/fans cannot survive both unchanged Rabbit tolerances, try one private
 * point strictly inside the polygon's kernel. Every resulting partition is
 * checked before it is allowed to enter the original-face Boolean quotient.
 */
export function buildConcaveLayerPartition(graph:FoldGraph,epsilon:number):ConcaveLayerPartition {
 const faces=graph.faces_vertices??[],vertices=graph.vertices_coords;
 reportFlatComputationProgress({stage:'partition',label:'划分内部计算片',completed:0,total:faces.length});
 const triangleCount=faces.reduce((sum,r,f)=>sum+r.length+(graph.faces_holes?.[f]??[]).reduce((n,h)=>n+h.length+2,0)-2-2*(materialFaceRings(graph,f).flat().length-new Set(materialFaceRings(graph,f).flat()).size),0);
 if(!faces.length||!Number.isFinite(epsilon)||epsilon<=0||vertices.some(p=>p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))||faces.some(f=>f.length<3||new Set(f).size!==f.length||f.some(v=>!Number.isInteger(v)||v<0||v>=vertices.length)))refuse('凹面层序几何无效。');
 if(graph.edges_assignment.some(a=>!['B','M','V','F'].includes(a)))refuse('凹面层序需要完整的山谷指派。');
 const polygons=faces.map(f=>f.map(v=>vertices[v]));
 if(polygons.some(p=>!isSimpleLayerPolygon(p,epsilon)))refuse('凹面层序仅支持简单、非退化且没有自交或接触的纸面。');
 const {faceEdges:sourceFaceEdges,edgeFaces:sourceEdgeFaces}=sourceIncidence(graph,faces),sourceAreas=faces.map((_,f)=>graph.faces_holes?.[f]?.length?validateMaterialFaceRings(vertices,materialFaceRings(graph,f),epsilon,true):polygonArea(polygons[f])),coords=vertices.map(p=>[...p] as Point),children:number[][]=[],parent:number[]=[],privateVertices:{vertex:number;parent:number}[]=[];
 const triangulate=layerEarcut(epsilon);
 for(const [f,face] of faces.entries()){
  if((f&511)===0)reportFlatComputationProgress({stage:'partition',label:'划分内部计算片',completed:f,total:faces.length});
  if(graph.faces_holes?.[f]?.length){const selected=triangulateMaterialHoleFace(graph,f);if(!normalizedTriangles(coords,selected,epsilon)&&!resolvedLayerTriangles(coords,selected,epsilon))refuse('孔洞私有分片低于可验证容差。');for(const child of selected){const area=polygonArea(child.map(v=>coords[v]));children.push(area*sourceAreas[f]<0?[...child].reverse():[...child]);parent.push(f);}continue;}
  const indices=triangulate(polygons[f].flat(),null,2),local=Array.from({length:indices.length/3},(_,i)=>indices.slice(3*i,3*i+3).map(k=>face[k]));
  let selected=local;
  if(indices.length!==3*(face.length-2)||indices.some(i=>!Number.isInteger(i)||i<0||i>=face.length)||!normalizedTriangles(coords,local,epsilon)){
   // A strict half-plane/kernel check is a geometric certificate. The mean
   // is only a deterministic candidate, never assumed to be inside a concavity.
   const origin=polygons[f][0],center:Point=[origin[0]+polygons[f].reduce((s,p)=>s+p[0]-origin[0],0)/face.length,origin[1]+polygons[f].reduce((s,p)=>s+p[1]-origin[1],0)/face.length],sign=Math.sign(sourceAreas[f]);
   const inKernel=center.every(Number.isFinite)&&inside(center,polygons[f])&&!polygons[f].some((a,k)=>{const b=polygons[f][(k+1)%face.length];return sign*cross(sub(b,a),sub(center,a))<=epsilon*distance(a,b);});
   const vertex=coords.length,candidate=[...coords,center],fan=face.map((v,k)=>[v,face[(k+1)%face.length],vertex]);
   if(inKernel&&normalizedTriangles(candidate,fan,epsilon)){coords.push(center);privateVertices.push({vertex,parent:f});selected=fan;}
   else if(indices.length===3*(face.length-2)&&resolvedLayerTriangles(coords,local,epsilon))selected=local;
   else {
    const clipped=resolvedEarClip(polygons[f],epsilon);
    if(!clipped)refuse('纸面的内部计算分片过薄，当前坐标精度无法可靠验证，层序暂不支持。');
    selected=clipped.map(t=>t.map(v=>face[v]));
   }
  }
  // Earcut returns CCW triangles, independently of the input polygon winding.
  for(const child of selected){const area=polygonArea(child.map(v=>coords[v]));children.push(area*sourceAreas[f]<0?[...child].reverse():[...child]);parent.push(f);}
 }
 if(children.length!==triangleCount+2*privateVertices.length)refuse('私有三角化数量与原面拓扑不一致。');
 const es=graph.edges_vertices.map(e=>[...e] as [number,number]),assignments=[...graph.edges_assignment],angles=[...graph.edges_foldAngle],privateEdges=new Map<string,number>(),boundaries=faces.map((_,f)=>{let offset=0;return new Map(materialFaceRings(graph,f).flatMap(r=>{const entries=r.map((a,k)=>[key(a,r[(k+1)%r.length]),sourceFaceEdges[f][offset+k]] as [string,number]);offset+=r.length;return entries;}));}),faceEdges=children.map((child,t)=>child.map((a,k)=>{
  const b=child[(k+1)%child.length],pair=key(a,b),f=parent[t],original=boundaries[f].get(pair);
  if(original!==undefined)return original;
  // Internal diagonals with the same endpoints in different material faces
  // remain independent, just like banks with identical slit endpoint pairs.
  const stamp=`${f}:${pair}`;let id=privateEdges.get(stamp);
  if(id===undefined){id=es.length;privateEdges.set(stamp,id);es.push([a,b]);assignments.push('J');angles.push(0);}return id;
 })),edgeFaces=es.map(()=>[] as number[]);faceEdges.forEach((list,t)=>list.forEach(e=>edgeFaces[e].push(t)));
 const tri:TriangleGraph={vertices_coords:coords,edges_vertices:es,edges_assignment:assignments,edges_foldAngle:angles,faces_vertices:children,faces_edges:faceEdges,edges_faces:edgeFaces,
  faces_faces:faceEdges.map((list,t)=>list.map(e=>edgeFaces[e].find(other=>other!==t) as number))};
 const childAreas=Array(faces.length).fill(0);
 for(const [i,t]of tri.faces_vertices.entries()){
  const ps=t.map(v=>coords[v]),area=polygonArea(ps),p=parent[i];
  const probe:Point=[ps.reduce((s,v)=>s+v[0],0)/3,ps.reduce((s,v)=>s+v[1],0)/3];if(t.length!==3||Math.abs(area)<=epsilon*epsilon||area*sourceAreas[p]<=0||!inside(probe,polygons[p])||(graph.faces_holes?.[p]??[]).some(h=>inside(probe,h.map(v=>vertices[v]))))refuse('三角化包含退化、反向或越出原面的片段。');
  childAreas[p]+=Math.abs(area);
 }
 if(sourceAreas.some((area,i)=>Math.abs(Math.abs(area)-childAreas[i])>Math.max(epsilon*epsilon,Math.abs(area)*1e-10)))refuse('三角化未保持原面面积。');
 const preserveCorners=!normalizedTriangles(coords,children,epsilon);
 if(preserveCorners&&!resolvedLayerTriangles(coords,children,epsilon))refuse('三角化存在当前坐标容差无法分辨的过薄片段。');
 for(let edge=0;edge<graph.edges_vertices.length;edge++){
  const expected=sourceEdgeFaces[edge],actual=tri.edges_faces[edge].map(f=>parent[f]);
  if(expected.length!==(graph.edges_assignment[edge]==='B'?1:2)||actual.length!==expected.length||new Set(actual).size!==actual.length||expected.some(f=>!actual.includes(f)))refuse('三角化未保持原折痕的纸面邻接。');
 }
 for(let edge=graph.edges_vertices.length;edge<es.length;edge++)if(tri.edges_assignment[edge]!=='J'||tri.edges_foldAngle[edge]!==0||tri.edges_faces[edge].length!==2||new Set(tri.edges_faces[edge].map(f=>parent[f])).size!==1)refuse('三角化内部边没有绑定到同一原面。');
 // This certificate only compares children of the SAME original face. Keep
 // each check local; unrelated folded layers intentionally overlap and their
 // full cross-face contacts are computed separately by the layer solver.
 const siblings=faces.map(()=>[] as number[][]);
 children.forEach((child,t)=>siblings[parent[t]].push(child));
 for(const group of siblings){
  if(group.length<2)continue;
  const used=[...new Set(group.flat())],remap=new Map(used.map((v,i)=>[v,i]));
  const local={...tri,vertices_coords:used.map(v=>coords[v]),faces_vertices:group.map(t=>t.map(v=>remap.get(v)!))};
  const overlaps=preserveCorners?triangleLayerOverlaps(local,epsilon):ear.graph.getFacesFacesOverlap(local,epsilon);
  if(overlaps.some(others=>others.length))refuse('同一原面的私有三角片出现正面积重叠，不能生成覆盖约束。');
 }
 reportFlatComputationProgress({stage:'partition',label:'内部计算分片已验证',completed:faces.length,total:faces.length});
 return {graph:tri,parent,sourceAreas,sourceFaceEdges,sourceEdgeFaces,privateVertices};
}

function buildConstraints(graph:FoldGraph,epsilon:number){
 const partition=buildConcaveLayerPartition(graph,epsilon),{graph:tri,parent,sourceAreas}=partition;
 const data=preservingTriangleConstraints(tri,epsilon),variables:string[]=[],index=new Map<string,number>(),clauses:number[][]=[],kinds:number[]=[],seen=new Set<string>();
 const variable=(a:number,b:number)=>{
  if(a===b)refuse('同一原面的三角片出现重叠或内部上下比较。');
  const pair=key(a,b);if(!index.has(pair)){index.set(pair,variables.length+1);variables.push(pair);}return index.get(pair)!;
 };
 const literal=(a:number,b:number)=>{const pa=parent[a],pb=parent[b],id=variable(pa,pb);return pa<pb?id:-id;};
 const add=(values:number[],kind:number)=>{
  const unique=[...new Set(values)].sort((a,b)=>a-b);if(unique.some(v=>unique.includes(-v)))return;
  const signature=unique.join(',');if(seen.has(signature))return;
  seen.add(signature);clauses.push(unique);kinds.push(kind);
 };
 for(const pair of data.facePairs){const [a,b]=pair.split(' ').map(Number);variable(parent[a],parent[b]);}
 for(const [pair,value]of Object.entries(data.orders)){const [a,b]=pair.split(' ').map(Number),lit=literal(a,b);add([value===1?lit:-lit],4);}
 for(const type of categories)for(const constraint of data.constraints[type]){
  const terms=pairs(type,constraint).map(([a,b])=>literal(a,b)),ids=[...new Set(terms.map(Math.abs))],kind=categories.indexOf(type);
  for(let mask=0;mask<2**ids.length;mask++){
   const values=new Map(ids.map((id,i)=>[id,(mask>>i)&1]));
   const row=terms.map(lit=>values.get(Math.abs(lit))===(lit>0?1:0)?'1':'2').join('');
   if(ear.layer.table[type][row]!==true)add(ids.map(id=>values.get(id)?-id:id),kind);
  }
 }
 // Stable ORIGINAL face-pair ordering, independent of triangle numbering.
 const sorted=variables.map((pair,i)=>({pair,id:i+1,faces:pair.split(' ').map(Number)})).sort((a,b)=>a.faces[0]-b.faces[0]||a.faces[1]-b.faces[1]);
 const remap=new Map(sorted.map(({id},i)=>[id,i+1]));
 return {variables:sorted.map(v=>v.pair),clauses:clauses.map(c=>c.map(l=>Math.sign(l)*remap.get(Math.abs(l))!)),kinds:Uint8Array.from(kinds),sourceAreas};
}

interface DecisionNode {values:Int8Array;count:bigint;variable?:number;children?:[DecisionNode|null,DecisionNode|null];free?:number[]}
/** A failed clause in the actual search. Signed IDs encode the values at the
 * failure, not a guess about why the complete problem is unsatisfiable. */
export interface OriginalLayerConflict {clause:number;scope:'root'|'branch';assignments:number[]}
type CountResult={status:'complete';count:bigint;selected:Int8Array|null;nodes:number;selectedRank?:bigint;conflicts?:OriginalLayerConflict[]}|{status:'unknown';message:string;nodes:number};
/** Compressed decision tree. Free terminal variables represent 2^n solutions;
 * no complete solution list is allocated. The entire call belongs in a Worker.
 */
export function countOriginalLayerAssignments(variableCount:number,clauses:number[][],rank=0n,nodeBudget:number=Infinity,pairBudget:number=Infinity,clauseBudget:number=Infinity,preferred?:ReadonlyMap<number,number>):CountResult{
 const validBudget=(value:number)=>value===Infinity||Number.isSafeInteger(value)&&value>=1;
 if(!validBudget(pairBudget)||!validBudget(clauseBudget)||!validBudget(nodeBudget)||
   !Number.isSafeInteger(variableCount)||variableCount<0||variableCount>pairBudget||typeof rank!=='bigint'||rank<0n||
   !Array.isArray(clauses)||clauses.length>clauseBudget||clauses.some(c=>!Array.isArray(c)||c.length>6||c.some(l=>!Number.isInteger(l)||l===0||Math.abs(l)>variableCount))||
   preferred&&[...preferred].some(([id,value])=>!Number.isInteger(id)||id<1||id>variableCount||Math.abs(value)!==1))throw Error('原面层序计数输入无效。');
 let nodes=0,exhausted=false;const conflicts:OriginalLayerConflict[]=[];
 function decision(values:Int8Array,root:boolean):DecisionNode|null{
  if(++nodes>nodeBudget){exhausted=true;throw Error('budget');}
  let changed=true;
  while(changed){changed=false;
   for(let c=0;c<clauses.length;c++){const clause=clauses[c];let satisfied=false,unknown=0,last=0;
    for(const lit of clause){const value=values[Math.abs(lit)];if(!value){unknown++;last=lit;}else if(value===(lit>0?1:-1)){satisfied=true;break;}}
    if(satisfied)continue;if(!unknown){
     // Constant-sized evidence: no propagation trace or complete assignment
     // snapshots are retained merely to explain a failure in the UI.
     if(conflicts.length<4&&!conflicts.some(w=>w.clause===c))conflicts.push({clause:c,scope:root?'root':'branch',assignments:clause.map(l=>Math.abs(l)*values[Math.abs(l)])});
     return null;
    }if(unknown===1){values[Math.abs(last)]=last>0?1:-1;changed=true;}
   }
  }
  let variable=0;
  for(const clause of clauses){if(clause.some(l=>values[Math.abs(l)]===(l>0?1:-1)))continue;
   for(const lit of clause)if(!values[Math.abs(lit)]&&(!variable||Math.abs(lit)<variable))variable=Math.abs(lit);
  }
  if(!variable){const free=Array.from({length:variableCount},(_,i)=>i+1).filter(i=>!values[i]);return {values,free,count:1n<<BigInt(free.length)};}
  return {values,variable,children:[null,null],count:0n};
 }
 try{
  // A larger valid problem must not fail merely because its decision depth
  // exceeds the JavaScript call stack. Keep the same positive-first order.
  type Pending={values:Int8Array;parent?:DecisionNode;branch?:0|1}|{sum:DecisionNode};
  const pending:Pending[]=[{values:new Int8Array(variableCount+1)}];
  let tree:DecisionNode|null=null;
  while(pending.length){
   const next=pending.pop()!;
   if('sum' in next){next.sum.count=(next.sum.children![0]?.count??0n)+(next.sum.children![1]?.count??0n);continue;}
   const node=decision(next.values,!next.parent);
   if(next.parent)next.parent.children![next.branch!]=node;else tree=node;
   if(node?.variable){
    const positive=node.values.slice(),negative=node.values.slice();positive[node.variable]=1;negative[node.variable]=-1;
    pending.push({sum:node},{values:negative,parent:node,branch:1},{values:positive,parent:node,branch:0});
   }
  }
  const count=tree?.count??0n;
  if(preferred?.size&&tree){
   const choices=[{node:tree,offset:0n}];
   let answer:{selected:Int8Array;selectedRank:bigint}|null=null;
   while(choices.length){
    const {node,offset}=choices.pop()!;
    if([...preferred].some(([id,value])=>node.values[id]&&node.values[id]!==value))continue;
    if(node.children){const [first,last]=node.children;if(last)choices.push({node:last,offset:offset+(first?.count??0n)});if(first)choices.push({node:first,offset});continue;}
    const selected=node.values.slice(),free=node.free!;let local=0n;
    free.forEach((id,i)=>{selected[id]=preferred.get(id)??1;if(selected[id]===-1)local|=1n<<BigInt(free.length-i-1);});
    answer={selected,selectedRank:offset+local};break;
   }
   return {status:'complete',count,selected:answer?.selected??null,nodes,...(answer?{selectedRank:answer.selectedRank}:{}),...(count===0n?{conflicts}:{})};
  }
  if(!tree||rank>=count)return {status:'complete',count,selected:null,nodes,...(count===0n?{conflicts}:{})};
  let node=tree,local=rank;
  while(node.children){const first=node.children[0]?.count??0n;if(local<first)node=node.children[0]!;else{local-=first;node=node.children[1]!;}}
  const selected=node.values.slice(),free=node.free!;
  free.forEach((id,i)=>{selected[id]=(local&(1n<<BigInt(free.length-i-1)))===0n?1:-1;});
  return {status:'complete',count,selected,nodes};
 }catch(error){if(!exhausted)throw error;return {status:'unknown',message:`凹面层序达到 ${nodeBudget} 个搜索节点预算；尚未确定完整解数或是否无解。`,nodes};}
}

export type ConcaveLayerResult={status:'complete';count:bigint;orders:FaceOrder[]|null;nodes:number;solutionIndex?:number;conflicts?:FlatFoldConflict[]}|{status:'unsupported'|'unknown';message:string};
/** Original faces remain the only public geometry and layer identities. */
export function solveConcaveLayerOrders(graph:FoldGraph,epsilon:number,solutionIndex=0,preferences:FlatLayerPreference[]=[],required:FlatLayerPreference[]=[]):ConcaveLayerResult{
 if(!Number.isSafeInteger(solutionIndex)||solutionIndex<0)throw Error('层序解编号必须是非负安全整数。');
 try{
  let areaGraph=graph;
  if(hasWeakMaterialRings(graph)){try{areaGraph=materialLayerRegions(graph,epsilon);}catch(e){refuse(e instanceof Error?e.message:String(e));}}
  const problem=buildConstraints(areaGraph,epsilon);
  validateRelativeLayerConstraints(required,graph.faces_vertices!.length);
  const clauses=problem.clauses.map(clause=>[...clause]);
  for(const {below,above} of required){
    const index=problem.variables.indexOf(key(below,above));
    if(index<0)refuse('指定纸面之间没有可认证的重叠关系，请选择实际重叠的两个纸面。');
    clauses.push([(index+1)*(above<below?1:-1)]);
  }
  const preferred=new Map<number,number>();
  for(const {below,above} of preferences){const pair=key(below,above),index=problem.variables.indexOf(pair);if(index<0)refuse('新凹面层序证书未覆盖原纸层关系。');const value=above<below?1:-1;if(preferred.has(index+1)&&preferred.get(index+1)!==value)return {status:'complete',count:0n,orders:null,nodes:0,conflicts:[makeLayerConflict('relative-order','constraint',[below,above],{relations:[{above,below},{above:below,below:above}],message:'纸层继承偏好对同一对纸面要求了相反的上下顺序。'})]};preferred.set(index+1,value);}
  const result=countOriginalLayerAssignments(problem.variables.length,clauses,BigInt(solutionIndex),Infinity,Infinity,Infinity,preferred);
  if(result.status!=='complete')return result;
  const selected=result.selected;
  const orders:FaceOrder[]|null=selected?problem.variables.map((pair,i)=>{const [a,b]=pair.split(' ').map(Number);return [a,b,selected[i+1]*Math.sign(problem.sourceAreas[b])];}):null;
  const conflicts=result.count===0n?result.conflicts?.map(witness=>{
   const relations=witness.assignments.map(lit=>{const [a,b]=problem.variables[Math.abs(lit)-1].split(' ').map(Number);return lit>0?{above:a,below:b}:{above:b,below:a};});
   const kind=witness.clause<problem.kinds.length?clauseKinds[problem.kinds[witness.clause]]:'relative-order';
   return makeLayerConflict(kind,witness.scope,relations.flatMap(({above,below})=>[above,below]),{relations});
  }):undefined;
  if(result.selectedRank!==undefined&&result.selectedRank>BigInt(Number.MAX_SAFE_INTEGER))refuse('继承方案的候选编号超出安全整数范围。');
  return {status:'complete',count:result.count,orders,nodes:result.nodes,...(result.selectedRank===undefined?{}:{solutionIndex:Number(result.selectedRank)}),...(conflicts?.length?{conflicts}:{})};
 }catch(error){if(error instanceof Unsupported)return {status:'unsupported',message:error.message};return {status:'unknown',message:`凹面层序约束构造未完成：${error instanceof Error?error.message:String(error)}`};}
}


