import type {Assignment,Doc,FoldGraph,Point} from '../core/types';
import {validateDoc} from '../core/types';
import {createMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {gorePaperSourceValid,readGorePaperParams,type GorePaperParams} from './goreData';
import {spatialMeshScene} from './spatialMeshView';
import type {TessResponse,TessResult} from './tessellation';

function materialGraph(fold:unknown):{graph:FoldGraph;scale:number;origin:Point}{
 const original=fold as FoldGraph,points=original.vertices_coords;
 const minX=Math.min(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),span=Math.max(Math.max(...points.map(p=>p[0]))-minX,Math.max(...points.map(p=>p[1]))-minY),scale=200/span;
 if(!Number.isFinite(scale)||scale<=0)throw Error('原多瓣Gore材料尺度无效。');
 const graph:FoldGraph={vertices_coords:points.map(([x,y])=>[(x-minX)*scale,(y-minY)*scale]),edges_vertices:original.edges_vertices.map(e=>[...e]),edges_assignment:[...original.edges_assignment],edges_foldAngle:[...original.edges_foldAngle],faces_vertices:original.faces_vertices!.map(f=>[...f])};
 const key=(a:number,b:number)=>`${Math.min(a,b)},${Math.max(a,b)}`,edgeIds=new Map(graph.edges_vertices.map(([a,b],i)=>[key(a,b),i]));
 graph.faces_edges=graph.faces_vertices!.map(f=>f.map((a,i)=>{const e=edgeIds.get(key(a,f[(i+1)%f.length]));if(e===undefined)throw Error('原多瓣Gore缺少真实材料边。');return e;}));
 graph.edges_faces=graph.edges_vertices.map(()=>[]);
 graph.faces_edges.forEach((r,f)=>r.forEach(e=>graph.edges_faces![e].push(f)));
 graph.faces_faces=graph.faces_edges.map((r,f)=>r.map(e=>graph.edges_faces![e].find(other=>other!==f)??null)) as unknown as number[][];
 return{graph,scale,origin:[minX,minY]};
}

/** Preserve every petal's indexed bank before ANY generic importer can weld coordinates. */
export function goreMultipleMaterialDocument(response:Pick<TessResponse,'source'|'fold'>,params:GorePaperParams):Doc{
 if(params.petals!=='multiple'||!gorePaperSourceValid(response.source,response.fold,params)||!spatialMeshScene(response))throw Error('原多瓣Gore材料缺少有效原源或独立静态等距证明。');
 const {graph,scale,origin}=materialGraph(response.fold),xs=graph.vertices_coords.map(p=>p[0]),ys=graph.vertices_coords.map(p=>p[1]);
 const doc:Doc={schemaVersion:2,name:'原Gore多瓣材料集合',paper:{width:Math.max(...xs),height:Math.max(...ys)},segments:graph.edges_vertices.map(([a,b],i)=>({id:`gore-material-${i}`,a:[...graph.vertices_coords[a]],b:[...graph.vertices_coords[b]],assignment:graph.edges_assignment[i] as Assignment,angle:graph.edges_foldAngle[i]})),metadata:{goreMaterialPlacement:{millimetresPerSourceUnit:scale,sourceOrigin:origin,independentPetals:params.sectors,gluingApplied:false}}};
 // The material editor's foldedVertices contract is strictly 2D. Preserve true
 // 3D as original provenance, rather than creating a projected flat certificate.
 doc.metadata!.materialTopology=createMaterialTopology(doc,graph,doc.segments.map(s=>s.id));
 const checked=inspectMaterialTopology(doc);
 if(!checked.ok||checked.components.length!==params.sectors)throw Error('原多瓣Gore材料身份被合并或部件数不符。');
 validateDoc(doc);return doc;
}

/** Adoption additionally binds the current millimetre material to the source indices. */
export function multipleGoreMaterialMatches(result:TessResult,params:GorePaperParams):boolean{
 try{
  if(params.petals!=='multiple'||!gorePaperSourceValid(result.source,result.fold,params))return false;
  const material=inspectMaterialTopology(result.doc),expected=materialGraph(result.fold),recipe=(result.doc.metadata?.tessellation as {parameters?:unknown}|undefined)?.parameters;
  if(!material.ok||material.components.length!==params.sectors||material.foldedVertices||JSON.stringify(material.graph)!==JSON.stringify(expected.graph)||JSON.stringify(readGorePaperParams(recipe as Record<string,unknown>))!==JSON.stringify(readGorePaperParams(params as unknown as Record<string,unknown>)))return false;
  return JSON.stringify(result.doc.metadata?.goreMaterialPlacement)===JSON.stringify({millimetresPerSourceUnit:expected.scale,sourceOrigin:expected.origin,independentPetals:params.sectors,gluingApplied:false});
 }catch{return false;}
}
