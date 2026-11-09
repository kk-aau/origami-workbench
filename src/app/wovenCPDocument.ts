import type {Doc,Assignment} from '../core/types';
import {validateDoc} from '../core/types';
import {createMaterialTopology} from '../core/materialTopology';
import {inspectWovenCutTopology} from './wovenCutTopology';
import {tessConstructionKey,type TessParams,type TessResult} from './tessellation';

/** CP editing is an explicit choice; it neither installs nor certifies FF. */
export function canAdoptWovenCP(result:TessResult|null,busy:boolean,key:string,params:TessParams):boolean{
 if(!result||busy||params.family!=='woven-lines'||params.mode!=='graph'||key!==tessConstructionKey(params)||result.stats?.checks?.geometry?.status!=='passed')return false;
 try{wovenCPDocument(result,params);return true;}catch{return false;}
}
export function wovenCPDocument(result:TessResult,params:TessParams):Doc{
 if(params.family!=='woven-lines'||params.mode!=='graph'||result.stats?.checks?.geometry?.status!=='passed')throw Error('仅CP采用需要通过几何检查的原生有限母图编织。');
 const proof=inspectWovenCutTopology(result,params);if(!proof.ok)throw Error(proof.reason);
 const t=proof.topology,points=t.sourceCP,minX=Math.min(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),span=Math.max(Math.max(...points.map(p=>p[0]))-minX,Math.max(...points.map(p=>p[1]))-minY),scale=200/span;
 if(!Number.isFinite(scale)||scale<=0)throw Error('编织CP尺度无效。');
 const transform=(p:readonly number[]):[number,number]=>[(p[0]-minX)*scale,(p[1]-minY)*scale],original=result.fold as {edges_vertices:[number,number][];edges_assignment:string[];edges_foldAngle:(number|null)[]};
 if(result.doc.segments.length!==original.edges_vertices.length)throw Error('当前CP候选线段数已变化，请重新构造。');
 for(const [i,[a,b]]of original.edges_vertices.entries()){
  const s=result.doc.segments[i],pa=transform(points[a]),pb=transform(points[b]);
  if(s.assignment!==original.edges_assignment[i]||s.angle!==original.edges_foldAngle[i]||Math.hypot(s.a[0]-pa[0],s.a[1]-pa[1])>2e-6||Math.hypot(s.b[0]-pb[0],s.b[1]-pb[1])>2e-6)throw Error('当前CP候选与原构造不匹配，请重新构造。');
 }
 const graph={...structuredClone(t.splitGraph),vertices_coords:t.splitGraph.vertices_coords.map(transform)},doc=structuredClone(result.doc);doc.schemaVersion=2;
 doc.segments=graph.edges_vertices.map(([a,b],i)=>({id:`material-${i}`,a:[...graph.vertices_coords[a]],b:[...graph.vertices_coords[b]],assignment:graph.edges_assignment[i] as Assignment,angle:graph.edges_foldAngle[i]}));
 doc.metadata={...doc.metadata,tessellation:{...(doc.metadata?.tessellation as Record<string,unknown>),parameters:structuredClone(params)},wovenCPAdoption:{schema:'zhezhi-woven-cp-only-v1',flatFoldCertified:false,sourceGeometryValidated:true}};
 doc.flatFold={startingFace:graph.faces_vertices![t.stationaryFoldFace].map(v=>[...graph.vertices_coords[v]]),materialFace:t.stationaryFoldFace};
 doc.metadata.materialTopology=createMaterialTopology(doc,graph,doc.segments.map(s=>s.id),{startingFace:t.stationaryFoldFace});validateDoc(doc);return doc;
}
