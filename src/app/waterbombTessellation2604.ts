/** Literal MakeWaterbombTessellation / In[2602], with the actual In[2604] array. */
import {createMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {validateDoc,type Doc,type Point,type FoldGraph,type Segment} from '../core/types';

export type WaterbombTessellation2604Recipe={nx:number;ny:number;t:number;unitSizeMm:number};
export type WaterbombPoint3=[number,number,number];
export const WATERBOMB_TESSELLATION_2604_EXAMPLE:WaterbombTessellation2604Recipe={nx:3,ny:3,t:.25,unitSizeMm:50};
const SCHEMA='original-in2604-waterbomb-tessellation-cp-v1';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,ks:string[])=>Object.keys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k));
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const clone=<T>(v:T):T=>structuredClone(v);
function fail(message='原水雷阵列来源、参数、几何或材料身份不一致。'):never{throw Error(message);}
export function validateWaterbombTessellation2604Recipe(raw:unknown):WaterbombTessellation2604Recipe{
 if(!object(raw)||!keys(raw,['nx','ny','t','unitSizeMm'])||Object.values(raw).some(v=>!finite(v)))fail('请完整填写原行列数、折叠状态和毫米单元边长。');
 const r=raw as WaterbombTessellation2604Recipe;
 if(!Number.isInteger(r.nx)||!Number.isInteger(r.ny)||r.nx<1||r.ny<1||r.nx>10||r.ny>10)fail('行列数须为1…10整数；有限候选最多100个原单元、600个真实三角面。');
 if(r.t<0||r.t>1)fail('原折叠状态 t 须在0…1；保留输入，不自动裁剪。');
 if(r.unitSizeMm<1||r.unitSizeMm>1000)fail('单元边长须为1…1000 mm；CP和三维解析坐标只统一缩放一次。');
 return {...r};
}
function originalGraph(r:WaterbombTessellation2604Recipe){
 const {nx,ny,t}=r,d=1+t*t,s=Math.sqrt(1-t*t),a=-.5+1/d,z=t*a,
  p:WaterbombPoint3[]=[[-.5,-s/2,0],[.5,-s/2,0],[-a,0,z],[0,0,-t/2],[a,0,z],[-.5,s/2,0],[.5,s/2,0]],
  qz=-(t+t**3+2*t**5)/(1+4*t*t+3*t**4),qy=s**3/(2+6*t*t),
  q:WaterbombPoint3[]=[[-a,-s/2,0],[0,-qy,qz],[a,-s/2,0],[-.5,0,z],[.5,0,z],[-a,s/2,0],[0,qy,qz],[a,s/2,0]],
  vertices_coords:Point[]=[],vertices_coords3d:WaterbombPoint3[]=[],vertexSources:{i:number;j:number;point:string}[]=[],lookup=new Map<string,number>(),
  edges_vertices:[number,number][]=[],edges_assignment:string[]=[],edges_foldAngle:number[]=[],faces_vertices:number[][]=[];
 const sinc=(x:number)=>x===0?1:Math.sin(x)/x;
 // Algebraically identical to the original rotation about the offset axis.
 // C~1/(4t) is cancelled before evaluation, preserving the original t=0 branch.
 const xf=(v:WaterbombPoint3,i:number,j:number):WaterbombPoint3=>{
  if(t===0)return [.5+i+v[0],.5+j+v[1],v[2]];
  const ratio=t*s/d,b=-4*j*s/d*(ratio===0?1:Math.atan(ratio)/ratio),angle=t*b,c=Math.cos(angle),sn=Math.sin(angle),c0=(1+t*t+2*t**4)/(4*d);
  return [.5+i/d+v[0],s/2+v[1]*c-v[2]*sn-c0*b*sinc(angle),v[1]*sn+v[2]*c-c0*b*sinc(angle/2)*Math.sin(angle/2)];
 };
 const add=(x:number,y:number,v:WaterbombPoint3,i:number,j:number,label:string)=>{
  const key=`${x},${y}`;if(lookup.has(key))fail('原源顶点重复；未进行几何吸附。');
  lookup.set(key,vertices_coords.length);vertices_coords.push([x/2,y/2]);vertices_coords3d.push(xf(v,i,j));vertexSources.push({i,j,point:label});
 };
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
  if(i%2===0){
   if(i===0&&j===0)add(0,0,p[0],i,j,'p1');
   if(i===0){add(0,2*j+1,p[2],i,j,'p3');add(0,2*j+2,p[5],i,j,'p6');}
   if(j===0)add(2*i+2,0,p[1],i,j,'p2');
   add(2*i+1,2*j+1,p[3],i,j,'p4');add(2*i+2,2*j+1,p[4],i,j,'p5');add(2*i+2,2*j+2,p[6],i,j,'p7');
  }else{
   if(j===0){add(2*i+1,0,q[1],i,j,'q2');add(2*i+2,0,q[2],i,j,'q3');}
   add(2*i+2,2*j+1,q[4],i,j,'q5');add(2*i+1,2*j+2,q[6],i,j,'q7');add(2*i+2,2*j+2,q[7],i,j,'q8');
  }
 }
 type I=[number,number];
 const index=(v:I)=>{const k=lookup.get(v.join(','));if(k===undefined)fail('原边端点未定义。');return k;},
  edge=(a:I,b:I,k:'B'|'M'|'V')=>{edges_vertices.push([index(a),index(b)]);edges_assignment.push(k);edges_foldAngle.push(k==='M'?-180:k==='V'?180:0);},
  face=(a:I,b:I,c:I)=>faces_vertices.push([index(a),index(b),index(c)]);
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
  const A:I=[2*i,2*j],B:I=[2*i+2,2*j],C:I=[2*i,2*j+1],D:I=[2*i+1,2*j+1],E:I=[2*i+2,2*j+1],F:I=[2*i,2*j+2],G:I=[2*i+2,2*j+2],Q:I=[2*i+1,2*j],H:I=[2*i+1,2*j+2],right=i===nx-1?'B':'M',top=j===ny-1?'B':'M';
  if(i%2===0){
   if(j===0)edge(A,B,'B');if(i===0)edge(A,C,'B');
   edge(A,D,'V');edge(D,B,'V');edge(B,E,right);edge(C,D,'M');edge(D,E,'M');
   if(i===0)edge(C,F,'B');edge(F,D,'V');edge(D,G,'V');edge(E,G,right);edge(F,G,top);
   face(A,B,D);face(A,D,C);face(C,D,F);face(F,D,G);face(D,E,G);face(D,B,E);
  }else{
   if(j===0){edge(A,Q,'B');edge(Q,B,'B');}
   edge(C,Q,'V');edge(Q,E,'V');edge(B,E,right);edge(C,E,'M');edge(C,H,'V');edge(H,E,'V');edge(E,G,right);edge(F,H,top);edge(H,G,top);
   face(A,Q,C);face(Q,B,E);face(C,Q,E);face(C,E,H);face(C,H,F);face(H,E,G);
  }
 }
 const edgeIndex=new Map(edges_vertices.map(([a,b],i)=>[[a,b].sort((a,b)=>a-b).join(','),i])),faces_edges=faces_vertices.map(f=>f.map((a,i)=>{const e=edgeIndex.get([a,f[(i+1)%3]].sort((a,b)=>a-b).join(','));if(e===undefined)fail('材料面含非原边。');return e;})),
  edges_faces=edges_vertices.map((_,e)=>faces_edges.flatMap((es,f)=>es.includes(e)?[f]:[])),faces_faces=faces_edges.map((es,f)=>es.map(e=>edges_faces[e].find(g=>g!==f)??null)) as unknown as number[][];
 return {graph:{vertices_coords,edges_vertices,edges_assignment,edges_foldAngle,faces_vertices,faces_edges,edges_faces,faces_faces} as FoldGraph,vertices_coords3d,vertexSources};
}
function spatialProof(graph:FoldGraph,spatial:WaterbombPoint3[],r:WaterbombTessellation2604Recipe){
 if(spatial.length!==graph.vertices_coords.length||spatial.some(p=>!Array.isArray(p)||p.length!==3||p.some(x=>!finite(x))))fail('三维解析顶点无效。');
 let maximumSquaredDistanceErrorMm2=0,minimumSpatialTriangleCrossSquaredMm4=Infinity,pairChecks=0;
 for(const f of graph.faces_vertices!){
  for(let i=0;i<3;i++)for(let j=i+1;j<3;j++){
   const a=f[i],b=f[j],cp=graph.vertices_coords[a].reduce((sum,x,k)=>sum+(x-graph.vertices_coords[b][k])**2,0),ff=spatial[a].reduce((sum,x,k)=>sum+(x-spatial[b][k])**2,0);
   maximumSquaredDistanceErrorMm2=Math.max(maximumSquaredDistanceErrorMm2,Math.abs(cp-ff));pairChecks++;
  }
  const a=spatial[f[0]],u=spatial[f[1]].map((x,k)=>x-a[k]),v=spatial[f[2]].map((x,k)=>x-a[k]),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  minimumSpatialTriangleCrossSquaredMm4=Math.min(minimumSpatialTriangleCrossSquaredMm4,cross.reduce((sum,x)=>sum+x*x,0));
 }
 const squaredDistanceBudgetMm2=256*Number.EPSILON*r.unitSizeMm**2*(1+r.nx**2+r.ny**2);
 if(!finite(maximumSquaredDistanceErrorMm2)||maximumSquaredDistanceErrorMm2>squaredDistanceBudgetMm2||!finite(minimumSpatialTriangleCrossSquaredMm4)||minimumSpatialTriangleCrossSquaredMm4<=0)fail('解析三维实际三角面未通过非退化和逐面等距检查。');
 return {method:'actual-indexed-triangle-all-pair-squared-distances',pairChecks,maximumSquaredDistanceErrorMm2,minimumSpatialTriangleCrossSquaredMm4,squaredDistanceBudgetMm2,staticFaceIsometryChecked:true};
}
export function waterbombTessellation2604Document(raw:unknown):Doc{
 const recipe=validateWaterbombTessellation2604Recipe(raw),source=originalGraph(recipe),graph=clone(source.graph),unit=recipe.unitSizeMm,
  spatial=source.vertices_coords3d.map(p=>p.map(x=>x*unit) as WaterbombPoint3);
 graph.vertices_coords=graph.vertices_coords.map(p=>p.map(x=>x*unit) as Point);
 const ids=graph.edges_vertices.map((_,i)=>`waterbomb2604-edge-${i}`),doc:Doc={schemaVersion:2,name:'原水雷阵列 CP',paper:{width:recipe.nx*unit,height:recipe.ny*unit},segments:graph.edges_vertices.map(([a,b],i)=>({id:ids[i],a:clone(graph.vertices_coords[a]),b:clone(graph.vertices_coords[b]),assignment:graph.edges_assignment[i] as Segment['assignment'],angle:graph.edges_foldAngle[i]}))};
 const material=createMaterialTopology(doc,graph,ids),inspection=inspectMaterialTopology({...doc,metadata:{materialTopology:material}});
 if(!inspection.ok||inspection.components.length!==1||inspection.components[0].boundaryLoops.length!==1)fail('原阵列实际CP材料未通过单连通矩形纸域检查。');
 doc.metadata={materialTopology:material,originalWaterbombTessellation2604:{schema:SCHEMA,recipe,
  source:{definition:'MakeWaterbombTessellation In[2602]',example:'In[2604]',originalParameters:{nx:recipe.nx,ny:recipe.ny,t:recipe.t},sourceVertexOrder:'j outer / i inner; original makev insertion order',sourceEdgeOrder:'j outer / i inner; original makee insertion order',vertexSources:source.vertexSources,sourceOrigin:[0,0,0],originalCoordinateUnit:'unspecified',coordinateUnit:'mm',unitSizeMm:unit,coordinateTransform:'uniform original coordinates multiplied once by unitSizeMm',viewRotationXPiOverTwoAppliedToWorld:false,cpIndependentOfT:true,evenColumns:'waterbomb p1…p7',oddColumns:'blintz q1…q8',assignment:'original M/V/B',angles:'TypeToFlatFoldAngle In[1813], radians converted once to degrees; not current t dihedral'},
  sourcePlanarCoordinates:source.graph.vertices_coords,spatialVerticesMm:spatial,staticSpatialProof:spatialProof(graph,spatial,recipe),
  topology:{vertices:graph.vertices_coords.length,edges:graph.edges_vertices.length,faces:6*recipe.nx*recipe.ny,boundaryEdges:graph.edges_assignment.filter(k=>k==='B').length,components:1,faceConstruction:'six actual CP triangles per original unit; derived positive local face order',coordinateWelding:false,tOneCoincidentVerticesRetainSeparateSourceIdentity:true},
  numericalPolicy:{spatialCoordinateReplayAbsoluteBudgetMm:1e-12*unit*Math.max(1,recipe.nx,recipe.ny),parametersCPIndicesAssignmentIdentityExact:true,spatialProofRecomputedFromSavedPoints:true,smallTOffsetCancellation:'algebraic sinc evaluation; original t==0 branch retained',intervalCertificate:false},
  evidence:{adoption:'explicit-cp-only',staticSpatialPreview:true,finiteRigidFacesChecked:true,flatFoldCertified:false,layerOrderCertified:false,continuousMotionCertified:false,collisionFreeCertified:false}}};
 validateDoc(doc);return doc;
}
function freeze<T>(value:T):T{
 if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;
}
/** Preview factory validates the fixed CP once. Each t rechecks the actual spatial
 * triangles; adoption uses an editable whole clone and the uncached public guard. */
export function prepareWaterbombTessellation2604Preview(raw:unknown):(next:unknown)=>Doc{
 const initial=validateWaterbombTessellation2604Recipe(raw),base=freeze(waterbombTessellation2604Document(initial)),own=base.metadata!.originalWaterbombTessellation2604 as Record<string,unknown>,graph=(base.metadata!.materialTopology as {graph:FoldGraph}).graph;
 return next=>{
  const recipe=validateWaterbombTessellation2604Recipe(next);
  if(recipe.nx!==initial.nx||recipe.ny!==initial.ny||recipe.unitSizeMm!==initial.unitSizeMm)fail('行列或毫米比例已改变，旧CP预览工厂不能用于当前参数。');
  const source=originalGraph(recipe),spatial=source.vertices_coords3d.map(p=>p.map(x=>x*recipe.unitSizeMm) as WaterbombPoint3),savedSource=own.source as Record<string,unknown>;
  return {...base,metadata:{...base.metadata,originalWaterbombTessellation2604:{...own,recipe,source:{...savedSource,originalParameters:{nx:recipe.nx,ny:recipe.ny,t:recipe.t}},spatialVerticesMm:spatial,staticSpatialProof:spatialProof(graph,spatial,recipe)}}};
 };
}
export function readWaterbombTessellation2604Recipe(doc:Doc):WaterbombTessellation2604Recipe|null{
 try{const own=doc.metadata?.originalWaterbombTessellation2604;if(!object(own)||own.schema!==SCHEMA)return null;return validateWaterbombTessellation2604Recipe(own.recipe);}catch{return null;}
}
function same(a:unknown,b:unknown,path='',spatialBudget=0):boolean{
 if(typeof a==='number'&&typeof b==='number'){
  if(!finite(a)||!finite(b))return false;
  if(/^spatialVerticesMm\.[1-9]\d*\.[012]$/.test(path))return Math.abs(a-b)<=spatialBudget;
  return a===b;
 }
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&b.every((v,i)=>same(a[i],v,`${path}.${i}`,spatialBudget));
 if(object(a)||object(b))return object(a)&&object(b)&&keys(a,Object.keys(b))&&Object.keys(b).every(k=>same(a[k],b[k],path?`${path}.${k}`:k,spatialBudget));
 return a===b;
}
/** Public untrusted path: reconstruct every recipe/CP and verify the actual saved spatial proof. */
export function waterbombTessellation2604SourceMatches(doc:Doc):boolean{
 try{
  validateDoc(doc);if(Object.hasOwn(doc,'flatFold'))return false;
  const recipe=readWaterbombTessellation2604Recipe(doc),saved=doc.metadata?.originalWaterbombTessellation2604;if(!recipe||!object(saved))return false;
  const expected=waterbombTessellation2604Document(recipe),own=expected.metadata!.originalWaterbombTessellation2604 as Record<string,unknown>,actual=inspectMaterialTopology(doc);
  if(!actual.ok||actual.foldedVertices||actual.startingFace!==undefined||!same(doc.paper,expected.paper)||!same(doc.metadata!.materialTopology,expected.metadata!.materialTopology)||doc.segments.length!==expected.segments.length)return false;
  if(!same(doc.segments.map(({id,a,b,assignment,angle})=>({id,a,b,assignment,angle})),expected.segments))return false;
  const {staticSpatialProof:_a,...sg}=saved,{staticSpatialProof:_b,...eg}=own;
  if(!same(sg,eg,'',recipe.t===0||recipe.t===1?0:1e-12*recipe.unitSizeMm*Math.max(1,recipe.nx,recipe.ny)))return false;
  return same(saved.staticSpatialProof,spatialProof(actual.graph,saved.spatialVerticesMm as WaterbombPoint3[],recipe));
 }catch{return false;}
}
