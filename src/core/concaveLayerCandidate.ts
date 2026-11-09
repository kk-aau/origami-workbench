import ear from 'rabbit-ear';
import type {FoldGraph} from './types';
import {buildConcaveLayerPartition} from './concaveLayers';
import {triangleLayerOverlaps} from './triangleLayerConstraints';
import {convexLayerContacts,type ConvexLayerConstraints} from './convexLayerContacts';
import {solveLayerContactCandidate,type ConvexLayerCandidateOptions} from './convexLayerCandidate';
import {hasWeakMaterialRings} from './materialWeak';
import {materialLayerRegions} from './materialLayerRegions';
import {makeLayerConflict} from './flatConflictDiagnostics';

/** Private triangles supply contact geometry only. Every variable, rule and
 * exact-region certificate uses the original material-face identity. */
export function solveConcaveLayerCandidate(graph:FoldGraph,epsilon:number,options:ConvexLayerCandidateOptions){
 if(!options.coverage)throw Error('凹面层序候选缺少完整原面区域覆盖。');
 const area=hasWeakMaterialRings(graph)?materialLayerRegions(graph,epsilon):graph;
 const {graph:tri,parent,sourceAreas}=buildConcaveLayerPartition(area,epsilon),count=sourceAreas.length;
 const sets=Array.from({length:count},()=>new Set<number>());
 triangleLayerOverlaps(tri,epsilon).forEach((row,a)=>row.forEach(b=>{
  const x=parent[a],y=parent[b];if(x===y)throw Error('同一原面的内部计算分片出现正面积重叠。');sets[x].add(y);
 }));
 const overlap=sets.map(row=>[...row].sort((a,b)=>a-b));
 const contacts={...tri,edges_faces:tri.edges_faces.map((owners,e)=>tri.edges_assignment[e]==='J'?[]:owners)};
 const privateRules=convexLayerContacts(contacts,epsilon),constraints:ConvexLayerConstraints={taco_taco:[],taco_tortilla:[],tortilla_tortilla:[],transitivity:[]};
 for(const kind of ['taco_taco','taco_tortilla','tortilla_tortilla'] as const){
  const seen=new Set<string>();
  for(const row of privateRules[kind]){
   const mapped=row.map(t=>parent[t]);
   if(ear.layer.constraintToFacePairs[kind](mapped as never).some(([a,b])=>a===b))throw Error('内部计算分片的接触约束出现原面自身比较。');
   const stamp=mapped.join(' ');if(!seen.has(stamp)){seen.add(stamp);constraints[kind].push(mapped);}
  }
 }
 const adjacent:Record<string,number>={};
 for(const [pair,raw] of Object.entries(ear.layer.solveFlatAdjacentEdges(tri,ear.graph.makeFacesWinding(tri)))){
  const [a,b]=pair.split(' ').map(t=>parent[Number(t)]);
  if(a===b)throw Error('内部计算分片被误认为原折痕。');
  const stamp=a<b?`${a} ${b}`:`${b} ${a}`,value=a<b?raw:3-raw;
  if(adjacent[stamp]!==undefined&&adjacent[stamp]!==value){options.onConflict?.(makeLayerConflict('adjacent','root',[a,b],{relations:[{above:a,below:b},{above:b,below:a}]}));return null;}
  adjacent[stamp]=value;
 }
 return solveLayerContactCandidate({count,overlap,constraints,winding:sourceAreas.map(a=>a>0),adjacent},epsilon,options);
}
