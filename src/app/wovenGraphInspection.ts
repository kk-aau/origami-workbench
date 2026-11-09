import {readWovenGraph,type WovenGraph} from './wovenGraph';
import {readWovenGraphSource,wovenGraphSourceMatches,type WovenGraphSource} from './wovenGraphSource';
import {inspectWovenCutTopology,type WovenCutTopology} from './wovenCutTopology';
import type {TessParams,TessResult} from './tessellation';

export type WovenGraphPackage={schema:'zhezhi-woven-mother-v1';graph:WovenGraph;graphSource?:WovenGraphSource};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
/** File imports preserve original numbering and a source only when it replays. */
export function readWovenGraphPackage(value:unknown):WovenGraphPackage|null{
 const raw=readWovenGraph(value);if(raw)return {schema:'zhezhi-woven-mother-v1',graph:raw};
 if(!record(value)||value.schema!=='zhezhi-woven-mother-v1'||Object.keys(value).some(k=>!['schema','graph','graphSource'].includes(k)))return null;
 const graph=readWovenGraph(value.graph);if(!graph)return null;
 if(!Object.hasOwn(value,'graphSource'))return {schema:'zhezhi-woven-mother-v1',graph};
 const source=readWovenGraphSource(value.graphSource);if(!source||!wovenGraphSourceMatches(source,graph))return null;
 return {schema:'zhezhi-woven-mother-v1',graph,graphSource:source};
}
/** Compare arrays, not object key order; a changed draft cannot reuse old CP/FF. */
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):record(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export function wovenResultMatchesGraph(result:TessResult|null|undefined,graph:WovenGraph|null,source?:WovenGraphSource):boolean{
 if(!result||!graph)return false;const actual=readWovenGraph(result.source.graph);
 return !!actual&&JSON.stringify(canonical(actual))===JSON.stringify(canonical(graph))&&JSON.stringify(canonical(result.source.graphSource))===JSON.stringify(canonical(source));
}
export function inspectWovenGraphResult(result:TessResult|null|undefined,graph:WovenGraph|null,source?:WovenGraphSource,params?:TessParams){
 if(!wovenResultMatchesGraph(result,graph,source))return {ok:false as const,reason:result?'母图或来源已修改，保存并生成后再查看原CP/FF。':'先生成当前母图的折痕。'};
 return inspectWovenCutTopology(result,params);
}

/** Export only independently verified split topology. No face order is inferred. */
export function wovenCutFold(topology:WovenCutTopology){
 const copy=<T,>(v:T):T=>JSON.parse(JSON.stringify(v));
 const graph=topology.splitGraph,faces=topology.faceCorners;
 const common={edges_vertices:copy(graph.edges_vertices),edges_assignment:[...graph.edges_assignment],faces_vertices:copy(faces),
  faces_edges:copy(graph.faces_edges),edges_faces:copy(graph.edges_faces),faces_faces:copy(graph.faces_faces),
  ...(graph.faces_holes?{faces_holes:copy(graph.faces_holes),faces_holeEdges:copy(graph.faces_holeEdges),faces_holeFaces:copy(graph.faces_holeFaces)}:{}),
  zhezhi_source_vertex:[...topology.vertexSource],zhezhi_source_edge:[...topology.edgeSource],zhezhi_source_face:faces.map((_,i)=>i)};
 return {file_spec:1.2,file_creator:'折纸工坊',file_title:'编织切口 · 已拆分原CP与原FF',file_classes:['singleModel'],
  frame_title:'原CP · 切口两侧独立边界',frame_classes:['creasePattern'],...common,vertices_coords:copy(graph.vertices_coords),
  zhezhi_geometry_verified:true,zhezhi_layer_order_certified:false,zhezhi_internal_boundary_source_edges:[...topology.internalBoundaryEdges],zhezhi_material_starting_face:topology.stationaryFoldFace,
  file_frames:[{frame_title:'原FF · 几何位置，无层序证书',frame_classes:['foldedForm'],frame_inherit:false,...copy(common),vertices_coords:copy(topology.splitFolded)}]};
}
