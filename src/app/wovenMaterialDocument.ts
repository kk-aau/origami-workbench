import type {Assignment,Doc} from '../core/types';
import {createMaterialTopology} from '../core/materialTopology';
import type {TessParams,TessResult} from './tessellation';
import {hasWovenInternalBoundary} from './tessellation';
import {tessFlatInput} from './tessellationFlat';

/** Adopt the independently verified indexed material, not the unsplit drawing
 * graph. The source recipe remains provenance; current geometry is explicit. */
export function wovenMaterialDocument(result:TessResult,params:TessParams):Doc{
  if(!hasWovenInternalBoundary(result))throw new Error('当前构造不是需要保留独立身份的编织材料图。');
  const doc=structuredClone(result.doc),metadata=doc.metadata??{};
  doc.metadata={...metadata,tessellation:{...(metadata.tessellation as Record<string,unknown>),parameters:structuredClone(params)}};
  const input=tessFlatInput(result,doc,'material-adoption',true),graph=input.graph;
  if(!input.wovenCutFoldedVertices)throw new Error('编织材料缺少经过验证的原折后位置。');
  doc.schemaVersion=2;
  doc.segments=graph.edges_vertices.map(([a,b],i)=>({id:`material-${i}`,a:[...graph.vertices_coords[a]],b:[...graph.vertices_coords[b]],assignment:graph.edges_assignment[i] as Assignment,angle:graph.edges_foldAngle[i]}));
  doc.metadata.materialTopology=createMaterialTopology(doc,graph,doc.segments.map(s=>s.id),{foldedVertices:input.wovenCutFoldedVertices,startingFace:input.startingFace});
  return doc;
}
