import type {FoldGraph} from './types';

/** Repeated corners, including coordinate-equal slit banks, require weak
 * region inspection. Actual bank/fan validation is in materialTopology;
 * this predicate never merges graph identities. */
export function hasWeakMaterialRings(graph:FoldGraph,includeCoordinateAliases=true):boolean{
 return Array.isArray(graph.faces_vertices)&&graph.faces_vertices.some((_,f)=>hasWeakMaterialFaceRings(graph,f,includeCoordinateAliases));
}
export function hasWeakMaterialFaceRings(graph:FoldGraph,face:number,includeCoordinateAliases=true):boolean{
 const r=graph.faces_vertices?.[face];return Array.isArray(r)&&[r,...(Array.isArray(graph.faces_holes?.[face])?graph.faces_holes![face]:[])].some(h=>Array.isArray(h)&&(h.length<3||new Set(h).size!==h.length||includeCoordinateAliases&&Array.isArray(graph.vertices_coords)&&new Set(h.map(v=>graph.vertices_coords[v]?.join(','))).size!==h.length));
}
/** Coordinate aliases are used only to analyze a face's geometric region.
 * Indexed graph vertices, edge owners and corner fans are never united. */
export function materialRegionRings(graph:FoldGraph,face:number):number[][]{
 const rings=[graph.faces_vertices![face],...(graph.faces_holes?.[face]??[])],byPoint=new Map<string,number>();
 return rings.map(r=>r.map(v=>{const key=graph.vertices_coords[v].join(','),known=byPoint.get(key);if(known!==undefined)return known;byPoint.set(key,v);return v;}));
}
export function hasUnresolvedMaterialHinge(graph:FoldGraph):boolean{
 return graph.edges_faces?.some((fs,e)=>fs.length===2&&fs[0]===fs[1]&&graph.edges_assignment[e]!=='F')??false;
}
/** Area cycles only, preserving the actual face winding. Zero-area slit and
 * flat-crease walks do not remove paper area or create additional faces. */
export function materialAreaRings(graph:FoldGraph,face:number):number[][]{
 const rs=materialRegionRings(graph,face),area=(r:number[])=>{const o=graph.vertices_coords[r[0]];return r.reduce((n,v,i)=>{const p=graph.vertices_coords[v],q=graph.vertices_coords[r[(i+1)%r.length]];return n+(p[0]-o[0])*(q[1]-o[1])-(p[1]-o[1])*(q[0]-o[0]);},0);},sign=Math.sign(area(rs[0]));
 if(!sign)throw Error('材料外圈面积退化。');
 const cycles=rs.flatMap(r=>new Set(r).size===r.length?[r]:decomposeMaterialWalk(r)).filter(r=>r.length>=3),outer=cycles.filter(r=>sign*area(r)>0),holes=cycles.filter(r=>sign*area(r)<0);
 if(outer.length!==1||outer.length+holes.length!==cycles.length)throw Error('材料区域没有唯一非退化外圈。');return [outer[0],...holes];
}
/** Two distinct B banks may belong to the same material face after a slit. */
export function hasWeakMaterialBanks(graph:FoldGraph):boolean{
 return graph.faces_vertices?.some((_,f)=>{const seen=new Map<string,number>(),edges=[graph.faces_edges?.[f]??[],...(graph.faces_holeEdges?.[f]??[])].flat();return edges.some(e=>{if(graph.edges_assignment?.[e]!=='B'||!graph.edges_vertices?.[e])return false;const key=graph.edges_vertices[e].map(v=>graph.vertices_coords[v]?.join(',')).sort().join(';'),prior=seen.get(key);seen.set(key,e);return prior!==undefined&&prior!==e;});})??false;
}
/** Split an indexed boundary walk into simple cycles and two-dart branches.
 * Geometry/sign checks belong to the caller; no edge is added or discarded. */
export function decomposeMaterialWalk(vertices:readonly number[]):number[][]{
 const result:number[][]=[],path:number[]=[],position=new Map<number,number>();
 for(const v of [...vertices,vertices[0]]){
  const previous=position.get(v);
  if(previous===undefined){position.set(v,path.length);path.push(v);continue;}
  const cycle=path.slice(previous);if(cycle.length<2)throw Error('弱简单边界含零长角。');result.push(cycle);
  for(const removed of path.slice(previous+1))position.delete(removed);path.length=previous+1;
 }
 if(path.length!==1)throw Error('弱简单边界未闭合。');return result;
}
export function materialOuterContour(graph:FoldGraph,face:number):number[]{
 const ring=materialRegionRings(graph,face)[0];if(new Set(ring).size===ring.length)return ring;
 const cycles=decomposeMaterialWalk(ring),area=(r:number[])=>{const o=graph.vertices_coords[r[0]];return r.reduce((n,a,i)=>{const p=graph.vertices_coords[a],q=graph.vertices_coords[r[(i+1)%r.length]];return n+(p[0]-o[0])*(q[1]-o[1])-(p[1]-o[1])*(q[0]-o[0]);},0);},outer=cycles.filter(r=>r.length>=3&&area(r)>0);
 if(outer.length!==1)throw Error('弱简单材料面缺少唯一正向外圈。');return outer[0];
}
/** Count real negative-area paper regions, never zero-area crease walks. */
export function materialFaceHoleCount(graph:FoldGraph,face:number):number{
 const rings=materialRegionRings(graph,face);
 return rings.flatMap(r=>new Set(r).size===r.length?[r]:decomposeMaterialWalk(r)).filter(r=>{if(r.length<3)return false;const o=graph.vertices_coords[r[0]];return r.reduce((n,v,i)=>{const p=graph.vertices_coords[v],q=graph.vertices_coords[r[(i+1)%r.length]];return n+(p[0]-o[0])*(q[1]-o[1])-(p[1]-o[1])*(q[0]-o[0]);},0)<0;}).length;
}
