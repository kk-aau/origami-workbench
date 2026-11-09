import {buildFold,pointOnSegment,epsilonFor} from '../core/geometry';
import type {Doc,FoldGraph} from '../core/types';
import {solveAdaptiveFoldAngles} from '../core/adaptiveFoldAngles';
import {hasMaterialTopology} from '../core/materialTopology';

// Expanded F marks record earlier scores, not additional flexible hinges.
// Keep indexed material/cut topology intact; ordinary CPs simulate the same
// physical panels regardless of how many inactive marks were drawn on them.
function materialGraph(doc:Doc,legacyExpandedMarks=false){
 if(legacyExpandedMarks||hasMaterialTopology(doc))return buildFold(doc).graph;
 const graph=buildFold({...doc,segments:doc.segments.filter(s=>s.assignment!=='F')}).graph;
 // A finite active score ending inside a face needs the source's material
 // seams to represent its bend. Those are structural, not optional refinement.
 const needsSeams=graph.edges_vertices.some((_,e)=>['M','V'].includes(graph.edges_assignment[e])&&graph.edges_foldAngle[e]!==0&&graph.edges_faces?.[e]?.length!==2);
 return needsSeams?buildFold(doc).graph:graph;
}

/** Shared material graph for simulation capture and source validation. Keep
 * this independent of diagram transactions and annotation/symbol modules. */
export function diagramSimulationGraph(doc:Doc,legacyExpandedMarks=false){
 const graph=materialGraph(doc,legacyExpandedMarks);
 const saved=doc.metadata?.diagramSimulationTarget as {version?:number;graph?:FoldGraph;appliedAngles?:number[];progress?:number}|undefined;
 if(saved?.version===1&&saved.graph&&sameGeometry(graph,saved.graph)&&JSON.stringify(graph.edges_foldAngle)===JSON.stringify(saved.appliedAngles)&&Array.isArray(saved.graph.edges_foldAngle)&&saved.graph.edges_foldAngle.length===graph.edges_vertices.length&&saved.graph.edges_foldAngle.every(a=>typeof a==='number'&&Number.isFinite(a)&&Math.abs(a)<=180)&&typeof saved.progress==='number'&&Number.isFinite(saved.progress)&&Math.abs(saved.progress)<=1){
  return {...graph,edges_foldAngle:[...saved.graph.edges_foldAngle],zhezhi_simulationProgress:saved.progress};
 }
 return {...graph,edges_foldAngle:solveAdaptiveFoldAngles(graph),zhezhi_simulationProgress:0};
}

/** Existing saved curved surfaces retain their original topology. The legacy
 * source is accepted only by exact reconstruction from that archived CP. */
export function matchesDiagramSimulationSurfaceSource(doc:Doc,source:unknown):boolean {
 const saved=JSON.stringify(source);return saved===JSON.stringify(diagramSimulationGraph(doc))||doc.segments.some(s=>s.assignment==='F')&&saved===JSON.stringify(diagramSimulationGraph(doc,true));
}

function sameGeometry(a:FoldGraph,b:FoldGraph){return JSON.stringify([a.vertices_coords,a.edges_vertices,a.edges_assignment,a.faces_vertices])===JSON.stringify([b.vertices_coords,b.edges_vertices,b.edges_assignment,b.faces_vertices]);}
export function diagramSimulationProgress(graph:FoldGraph):number{return (graph as FoldGraph&{zhezhi_simulationProgress?:number}).zhezhi_simulationProgress??0;}

/** Keep the original simulation target separate from measured physical angles.
 * A topology, assignment or angle edit invalidates this continuation record. */
export function retainDiagramSimulationTarget(doc:Doc,graph:FoldGraph,progress:number):Doc {
 const applied=materialGraph(doc),eps=epsilonFor(doc);
 // Applying angles can split a physical crease at old F-mark intersections.
 // Rebase full targets onto those daughters instead of dropping continuation.
 const targets=applied.edges_vertices.map(([a,b],e)=>{
  const kind=applied.edges_assignment[e];if(kind!=='M'&&kind!=='V')return 0;
  const parent=graph.edges_vertices.findIndex(([x,y],i)=>graph.edges_assignment[i]===kind&&[a,b].every(v=>pointOnSegment(applied.vertices_coords[v],{id:'target',a:graph.vertices_coords[x],b:graph.vertices_coords[y],assignment:kind,angle:graph.edges_foldAngle[i]},eps)));
  if(parent<0||typeof graph.edges_foldAngle[parent]!=='number')throw Error('原模拟目标无法对应到应用后的折痕，未应用。');
  return graph.edges_foldAngle[parent];
 });
 return {...doc,metadata:{...doc.metadata,diagramSimulationTarget:{version:1,graph:{...applied,edges_foldAngle:targets},appliedAngles:[...applied.edges_foldAngle],progress}}};
}
