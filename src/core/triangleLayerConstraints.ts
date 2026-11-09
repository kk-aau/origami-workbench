import ear from 'rabbit-ear';
import type {FoldGraph,Point} from './types';
import {cross,sub,distance} from './geometry';
import {screenLayerPairs} from './layerPairScreening';
import {reportFlatComputationProgress} from './flatComputationProgress';

/** Linear-distance proof; a small angle does not erase a resolved corner. */
export function resolvedLayerTriangles(coords:Point[],triangles:number[][],epsilon:number){
 return triangles.every(t=>t.length===3&&t.every((v,i)=>{const a=coords[t[(i+1)%3]],b=coords[t[(i+2)%3]],length=distance(a,b);return length>epsilon&&Math.abs(cross(sub(b,a),sub(coords[v],a)))/length>epsilon;}));
}

/** Bounded SAT overlap on actual convex triangles; never normalize vertices. */
export function triangleLayerOverlaps(graph:FoldGraph,epsilon:number){
 const polygons=graph.faces_vertices!.map(r=>r.map(v=>graph.vertices_coords[v])),overlap=polygons.map(()=>[] as number[]),bounds=polygons.map(r=>[Math.min(...r.map(p=>p[0])),Math.min(...r.map(p=>p[1])),Math.max(...r.map(p=>p[0])),Math.max(...r.map(p=>p[1]))] as const);
 screenLayerPairs(bounds,(a,b)=>{
  if(ear.math.overlapConvexPolygons(polygons[a],polygons[b],epsilon)){overlap[a].push(b);overlap[b].push(a);}
 },()=>overlap.forEach(row=>{row.length=0;}),{positiveArea:true});
 return overlap;
}

/** Same Rabbit Ear constraints and tables, with verified triangle corners kept.
 * The library's default polygon cleanup compares unit-vector dot products and
 * can collapse a valid thin triangle. All overlap/contact EPS stays unchanged. */
export function preservingTriangleConstraints(graph:FoldGraph,epsilon:number){
 // J diagonals are private subdivisions of ONE rigid face, not hinges. The
 // original-face quotient already enforces their common layer. Allowing them
 // to act as tacos can compare a face with itself or invent a folded seam.
 const contacts={...graph,edges_faces:graph.edges_faces!.map((owners,e)=>graph.edges_assignment[e]==='J'?[]:owners)};
 const faces_winding=ear.graph.makeFacesWinding(graph),faces_polygon=graph.faces_vertices!.map((r,f)=>{const p=r.map(v=>graph.vertices_coords[v]);return faces_winding[f]?p:p.reverse();}),overlap=triangleLayerOverlaps(graph,epsilon);
 reportFlatComputationProgress({stage:'search',label:'构造约束并搜索纸层顺序',detail:'搜索总量尚不确定'});
 const tacos=ear.layer.makeTacosAndTortillas(contacts,epsilon),trios=ear.layer.getTransitivityTriosFromTacos(tacos),transitivity=ear.layer.makeTransitivity({faces_polygon},overlap,epsilon).filter(t=>trios[t.join(' ')]===undefined),constraints={...tacos,transitivity};
 return {constraints,lookup:ear.layer.makeConstraintsLookup(constraints),facePairs:ear.graph.connectedComponentsPairs(overlap).map(p=>p.join(' ')),faces_winding,orders:ear.layer.solveFlatAdjacentEdges(graph,faces_winding)};
}
