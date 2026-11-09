import {ORIGINAL_DISCRETE_4093_SOURCE} from './discreteCurveCPOriginal4093';
import {DISCRETIZATION_NATIVE_PRESETS,parseNativeDiscretizationResult,validateNativeDiscretizationQuery,type DiscretizationMultipliersQuery} from './curvedNativeDiscretization';
import type {TessParams,TessResult} from './tessellation';
import type {Doc,Assignment} from '../core/types';
import {validateDoc} from '../core/types';
import {createMaterialTopology} from '../core/materialTopology';

export type DiscreteCurveCPParams={family:'discrete-curve-cp';source:DiscretizationMultipliersQuery;leftWidth:number;rightWidth:number;assignments:('U'|'M'|'V')[]};
export const DISCRETE_INTERNAL_EDGES=[[0,1],[1,2],[1,4],[1,7]] as const;
export const DISCRETE_FACES=[[0,3,4,1],[1,4,5,2],[0,1,7,6],[1,2,8,7]];
export const DISCRETE_MIN_POINTS=3,DISCRETE_MAX_POINTS=16;
export const discreteCurveCPInternalEdges=(n:number):[number,number][]=>n===3?DISCRETE_INTERNAL_EDGES.map(e=>[...e]):[...Array.from({length:n-1},(_,i)=>[i,i+1] as [number,number]),...Array.from({length:n-2},(_,i)=>[i+1,n+i+1] as [number,number]),...Array.from({length:n-2},(_,i)=>[i+1,2*n+i+1] as [number,number])];
export const discreteCurveCPFaces=(n:number)=>n===3?DISCRETE_FACES.map(f=>[...f]):[...Array.from({length:n-1},(_,i)=>[i,n+i,n+i+1,i+1]),...Array.from({length:n-1},(_,i)=>[i,i+1,2*n+i+1,2*n+i])];
export function discreteCurveCPPreset(n=3):DiscreteCurveCPParams{
 if(!Number.isInteger(n)||n<DISCRETE_MIN_POINTS||n>DISCRETE_MAX_POINTS)throw Error('有限示例点数须为 3…16 整数。');
 const source=structuredClone(DISCRETIZATION_NATIVE_PRESETS.multipliers) as DiscretizationMultipliersQuery;
 if(n!==3){const c=Math.cos(Math.PI/9),s=Math.sin(Math.PI/9);source.foldPoints=Array.from({length:n},(_,i)=>[(i-1)*c,i%2===0?s:0]);source.leftRulings=Array.from({length:n},()=>[...source.leftRulings[0]]);source.rightRulings=Array.from({length:n},()=>[...source.rightRulings[0]]);}
 return {family:'discrete-curve-cp',source,leftWidth:.4,rightWidth:.4,assignments:Array(3*n-5).fill('U')};
}
export const discreteCurveCPOriginal4093Preset=():DiscreteCurveCPParams=>({family:'discrete-curve-cp',source:structuredClone(ORIGINAL_DISCRETE_4093_SOURCE),leftWidth:1,rightWidth:1,assignments:Array(13).fill('U')});
export function discreteCurveCPLocalAssignmentsValid(params:DiscreteCurveCPParams):boolean{
 const n=params.source.foldPoints.length,a=params.assignments;
 if(a.length!==3*n-5||a.some(x=>x!=='M'&&x!=='V'))return false;
 for(let i=1;i<n-1;i++){const row=[a[i-1],a[i],a[n+i-2],a[2*n+i-4]];if(Math.abs(row.filter(x=>x==='M').length-row.filter(x=>x==='V').length)!==2)return false;}
 return true;
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function readDiscreteCurveCPParams(value:unknown):DiscreteCurveCPParams|null{
 try{
  if(!record(value)||value.family!=='discrete-curve-cp'||Object.keys(value).some(k=>!['family','source','leftWidth','rightWidth','assignments'].includes(k)))return null;
  const preset=discreteCurveCPPreset(),source=validateNativeDiscretizationQuery('source' in value?value.source:preset.source);
  if(source.mode!=='multipliers'||source.foldPoints.length<DISCRETE_MIN_POINTS||source.foldPoints.length>DISCRETE_MAX_POINTS)return null;
  for(const key of ['foldPoints','leftRulings','rightRulings'] as const)for(const p of source[key]){
   if(p.some(x=>Math.abs(x)>1000)||key!=='foldPoints'&&(Math.hypot(...p)<1e-6||Math.hypot(...p)>1000))return null;
  }
  const leftWidth='leftWidth' in value?value.leftWidth:.4,rightWidth='rightWidth' in value?value.rightWidth:.4,
   assignments='assignments' in value?value.assignments:Array(3*source.foldPoints.length-5).fill('U');
  if(!finite(leftWidth,1e-4,1000)||!finite(rightWidth,1e-4,1000)||!Array.isArray(assignments)||assignments.length!==3*source.foldPoints.length-5||assignments.some(a=>a!=='U'&&a!=='M'&&a!=='V'))return null;
  return {family:'discrete-curve-cp',source,leftWidth,rightWidth,assignments:[...assignments]};
 }catch{return null;}
}
export function discreteCurveCPGraph(params:DiscreteCurveCPParams){
 const {foldPoints:p,leftRulings:l,rightRulings:r}=params.source,vertices_coords=[...p.map(v=>[...v]),...p.map((v,i)=>v.map((x,k)=>x+params.leftWidth*l[i][k])),...p.map((v,i)=>v.map((x,k)=>x+params.rightWidth*r[i][k]))];
 const n=p.length,rawFaces=discreteCurveCPFaces(n),internal=discreteCurveCPInternalEdges(n);
 const area=(face:number[])=>face.reduce((sum,a,i)=>{const b=face[(i+1)%face.length];return sum+vertices_coords[a][0]*vertices_coords[b][1]-vertices_coords[b][0]*vertices_coords[a][1];},0)/2;
 const faces_vertices=rawFaces.map(face=>area(face)>0?[...face]:[...face].reverse()),counts=new Map<string,number>();
 for(const face of faces_vertices)for(let i=0;i<face.length;i++){const edge=[face[i],face[(i+1)%face.length]].sort((a,b)=>a-b).join(',');counts.set(edge,(counts.get(edge)??0)+1);}
 const edges_vertices=[...counts.keys()].map(k=>k.split(',').map(Number) as [number,number]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),edges_assignment=edges_vertices.map(edge=>counts.get(edge.join(','))===1?'B':params.assignments[internal.findIndex(e=>e[0]===edge[0]&&e[1]===edge[1])]);
 const faces_edges=faces_vertices.map(face=>face.map((a,i)=>{const pair=[a,face[(i+1)%face.length]].sort((x,y)=>x-y);return edges_vertices.findIndex(e=>e[0]===pair[0]&&e[1]===pair[1]);}));
 const edges_faces=edges_vertices.map((_,e)=>faces_edges.flatMap((es,f)=>es.includes(e)?[f]:[])),
  faces_faces=faces_edges.map((es,f)=>es.map(e=>edges_faces[e].find(neighbor=>neighbor!==f)??null)) as unknown as number[][];
 return {vertices_coords,edges_vertices,faces_vertices,faces_edges,edges_faces,faces_faces,edges_assignment,edges_foldAngle:edges_assignment.map(k=>k==='M'?-180:k==='V'?180:null)};
}
function near(a:unknown,b:unknown):boolean{
 if(Array.isArray(b))return Array.isArray(a)&&a.length===b.length&&b.every((x,i)=>near(a[i],x));
 return typeof b==='number'?typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<=1e-11*Math.max(1,Math.abs(b)):a===b;
}
function geometryValid(params:DiscreteCurveCPParams):boolean{
 const g=discreteCurveCPGraph(params),p=g.vertices_coords,span=Math.max(...[0,1].map(k=>Math.max(...p.map(v=>v[k]))-Math.min(...p.map(v=>v[k]))));
 if(!Number.isFinite(span)||span<=1e-8)return false;
 const cross=(a:number[],b:number[],c:number[])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),areas=discreteCurveCPFaces(params.source.foldPoints.length).map(f=>f.reduce((s,a,i)=>{const b=f[(i+1)%f.length];return s+p[a][0]*p[b][1]-p[b][0]*p[a][1];},0)/2),eps=span*1e-8,areaEps=eps*span;
 if(areas.some(a=>Math.abs(a)<=1e-10*span*span||a*areas[0]<=0))return false;
 if(params.source.foldPoints.length>3){
  if(p.some((a,i)=>p.slice(i+1).some(b=>Math.hypot(a[0]-b[0],a[1]-b[1])<=eps)))return false;
  if(g.faces_vertices.some(f=>f.some((_,i)=>cross(p[f[i]],p[f[(i+1)%4]],p[f[(i+2)%4]])<=1e-10*span*span)))return false;
  const boundary=g.edges_vertices.filter((_,i)=>g.edges_faces[i].length===1),adjacency=new Map<number,number[]>();
  for(const[a,b]of boundary){adjacency.set(a,[...(adjacency.get(a)??[]),b]);adjacency.set(b,[...(adjacency.get(b)??[]),a]);}
  if([...adjacency.values()].some(v=>v.length!==2))return false;
  const start=Math.min(...adjacency.keys()),walk=new Set<number>();let prior=-1,current=start;
  while(!walk.has(current)){walk.add(current);const next=adjacency.get(current)?.find(v=>v!==prior);if(next===undefined)return false;prior=current;current=next;}
  if(current!==start||walk.size!==boundary.length)return false;
 }
 for(const [i,[a,b]]of g.edges_vertices.entries()){
  if(Math.hypot(p[a][0]-p[b][0],p[a][1]-p[b][1])<=eps)return false;
  for(const [c,d]of g.edges_vertices.slice(i+1)){
   if([a,b].includes(c)||[a,b].includes(d)){
    if(params.source.foldPoints.length>3){const v=[a,b].find(x=>x===c||x===d)!,x=a===v?b:a,y=c===v?d:c,dot=(p[x][0]-p[v][0])*(p[y][0]-p[v][0])+(p[x][1]-p[v][1])*(p[y][1]-p[v][1]);if(Math.abs(cross(p[v],p[x],p[y]))<=areaEps&&dot>eps*eps)return false;}
    continue;
   }
   const v=[cross(p[a],p[b],p[c]),cross(p[a],p[b],p[d]),cross(p[c],p[d],p[a]),cross(p[c],p[d],p[b])],bounds=[0,1].every(k=>Math.max(Math.min(p[a][k],p[b][k]),Math.min(p[c][k],p[d][k]))<=Math.min(Math.max(p[a][k],p[b][k]),Math.max(p[c][k],p[d][k]))+eps);
   if(bounds&&((v[0]<=areaEps&&v[1]>=-areaEps)||(v[1]<=areaEps&&v[0]>=-areaEps))&&((v[2]<=areaEps&&v[3]>=-areaEps)||(v[3]<=areaEps&&v[2]>=-areaEps)))return false;
  }
 }
 return true;
}
export function discreteCurveCPSourceValid(result:TessResult,raw:unknown):boolean{
 try{
  const params=readDiscreteCurveCPParams(raw);if(!params||!geometryValid(params))return false;
  const source=result.source as Record<string,any>,fold=result.fold as Record<string,any>,graph=discreteCurveCPGraph(params),n=params.source.foldPoints.length;
  if(n>3)validateDoc(result.doc);
  if(source.algorithm!=='Origamica discrete curve CP bridge'||source.version!==1||source.output!=='crease-pattern'||source.assembly!==(n===3?'three-point-two-sided-strip-v1':'finite-n-point-two-sided-strip-v1')||source.localBoundaryWidths!==true||!same(readDiscreteCurveCPParams(source.parameters),params)||!same(readDiscreteCurveCPParams((result.stats as any).parameters),params)||!same(source.internalEdgeOrder,discreteCurveCPInternalEdges(n)))return false;
  if(source.assignmentOrigin!==(params.assignments.every(a=>a==='U')?'unspecified':'explicit-user')||['staticGlobalIsometryChecked','continuousRigidPathChecked','selfCollisionChecked','wolframExecuted','continuousCurveEquivalent'].some(k=>source[k]!==false)||['foldedForm3D','foldedForm','spatialKind'].some(k=>Object.hasOwn(source,k)))return false;
  const native=parseNativeDiscretizationResult(source.nativeDiscretization,params.source);
  if(native.query.mode!=='multipliers'||!(native.sample as any).allMultipliersFinite)return false;
  if(n>3){
   const saved=result.doc.metadata?.tessellation as Record<string,any>|undefined;
   if(!saved||!same(readDiscreteCurveCPParams(saved.parameters),params)||!same(saved.source,source)||Object.hasOwn(fold,'file_frames')||fold.frame_classes?.includes('foldedForm'))return false;
  }
  if(!fold||Object.entries(graph).some(([k,v])=>!(n>3&&k!=='vertices_coords'?same(fold[k],v):near(fold[k],v)))||result.stats.vertices!==3*n||result.stats.edges!==5*n-3||result.stats.faces!==2*n-2||result.stats.checks.geometry.status!=='passed')return false;
  const counts=result.stats as unknown as Record<string,unknown>;
  if(n>3&&(counts.boundaryEdges!==2*n+2||counts.unassignedEdges!==graph.edges_assignment.filter(a=>a==='U').length||counts.mountainEdges!==graph.edges_assignment.filter(a=>a==='M').length||counts.valleyEdges!==graph.edges_assignment.filter(a=>a==='V').length))return false;
  const points=graph.vertices_coords,min=[0,1].map(k=>Math.min(...points.map(p=>p[k]))),span=Math.max(...[0,1].map(k=>Math.max(...points.map(p=>p[k]))-min[k])),scale=200/span;
  if(!Number.isFinite(scale)||scale<=0||result.doc.segments.length!==5*n-3)return false;
  if(n>3&&[result.doc.paper.width,result.doc.paper.height].some((value,k)=>Math.abs(value-(Math.max(...points.map(p=>p[k]))-min[k])*scale)>2e-6))return false;
  return graph.edges_vertices.every(([a,b],i)=>{const s=result.doc.segments[i];return (n===3||s.id===`fold-${i}`)&&s.assignment===graph.edges_assignment[i]&&s.angle===graph.edges_foldAngle[i]&&[a,b].every((v,j)=>[0,1].every(k=>Math.abs((j?s.b:s.a)[k]-(points[v][k]-min[k])*scale)<=2e-6));});
 }catch{return false;}
}
export function canAdoptDiscreteCurveCP(result:TessResult|null,busy:boolean,key:string,params:TessParams):boolean{
 if(!result||busy||params.family!=='discrete-curve-cp'||key!==JSON.stringify(params))return false;
 try{discreteCurveCPDocument(result,params);return true;}catch{return false;}
}
export function discreteCurveCPDocument(result:TessResult,params:DiscreteCurveCPParams):Doc{
 if(!discreteCurveCPSourceValid(result,params))throw Error('仅CP采用需要当前原源、闭合边界和真实几何全部一致的有限纸带。');
 const graph=discreteCurveCPGraph(params),min=[0,1].map(k=>Math.min(...graph.vertices_coords.map(p=>p[k]))),span=Math.max(...[0,1].map(k=>Math.max(...graph.vertices_coords.map(p=>p[k]))-min[k])),scale=200/span,
  coords=graph.vertices_coords.map(p=>p.map((x,k)=>(x-min[k])*scale) as [number,number]),doc=structuredClone(result.doc);
 const material={...graph,vertices_coords:coords};
 doc.schemaVersion=2;doc.segments=graph.edges_vertices.map(([a,b],i)=>({id:`material-${i}`,a:[...coords[a]],b:[...coords[b]],assignment:graph.edges_assignment[i] as Assignment,angle:graph.edges_foldAngle[i]}));
 doc.flatFold={startingFace:graph.faces_vertices[0].map(v=>[...coords[v]]),materialFace:0};
 doc.metadata={...doc.metadata,materialTopology:createMaterialTopology(doc,material,doc.segments.map(s=>s.id),{startingFace:0}),
  discreteCurveCPAdoption:{schema:'zhezhi-discrete-curve-cp-only-v1',flatFoldCertified:false,sourceGeometryValidated:true}};
 validateDoc(doc);return doc;
}
