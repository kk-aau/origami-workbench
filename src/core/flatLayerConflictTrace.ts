import ear from 'rabbit-ear';
import type {FlatFoldConflict,FoldGraph} from './types';
import {LayerCandidateSearch,LayerPairIndex} from './layerCandidateSearch';
import {conflictsFromLayerError} from './flatConflictDiagnostics';

/** Enrich an already-proven Rabbit Ear root conflict. Successful enumeration
 * pays no extra work; search exhaustion without a root witness is not replayed.
 * Only forced propagation runs here, never a second exhaustive search. */
export function traceFlatLayerError(error:unknown,graph:FoldGraph,epsilon:number):FlatFoldConflict[]{
 const fallback=conflictsFromLayerError(error,graph.faces_vertices?.length??0);
 if(!fallback.length)return fallback;
 try{
  const faces_edges=graph.faces_edges??ear.graph.makeFacesEdgesFromVertices(graph);
  const edges_faces=graph.edges_faces??ear.graph.makeEdgesFacesUnsorted({...graph,faces_edges});
  const {constraints,orders,facePairs}=ear.layer.makeSolverConstraintsFlat({...graph,faces_edges,edges_faces},epsilon);
  const index=new LayerPairIndex(graph.faces_vertices!.length);
  for(const pair of [...facePairs,...Object.keys(orders)]){const [a,b]=pair.split(' ').map(Number);index.term(a,b);}
  const search=new LayerCandidateSearch(index,constraints),initial=new Uint8Array(index.pairs.length);
  for(const [pair,value]of Object.entries(orders)){const [a,b]=pair.split(' ').map(Number);initial[index.find(a,b)-1]=a<b?value:3-value;}
  if(!search.seed(initial)&&search.conflicts.some(c=>c.trace))return [...search.conflicts];
 }catch{
  // Diagnostics cannot replace the original verdict if reconstruction fails.
  // Keep the original structured witness, without claiming traced provenance.
 }
 return fallback;
}
