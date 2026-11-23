import {contactGroupGraph,contactIslands} from '../core/contactIslands';
import {flatLayerOrder} from '../core/flatLayerOrder';
import {reportExactTopologyProgress,reportLayerRegionProgress} from '../core/flatComputationProgress';
import {hasWeakMaterialRings} from '../core/materialWeak';
import {checkCoverageTournaments,regionComparisonsFromFaceOrders,coveragePairMembership} from '../core/regionTournament';
import type {FlatFoldResult} from '../core/types';
import {rememberFlatExactProof} from './flatExactProof';
import {modelExactFaceNormals} from './modelExactFaceNormals';
import {buildExactModelTopology,walkExactCoverage} from './modelExactTopology';
import {solveContactGroupTasks,type GroupTask} from './diagramSpatialLayerSolver';

export function planEditorContactGroups(result:FlatFoldResult,epsilon:number){
  const {graph,faces,vertices}=result.geometry;
  if(!graph?.faces_edges||!graph.edges_faces||graph.zhezhi_flatCreases||graph.faces_holes?.some(r=>r.length))return;
  const groups=contactIslands(faces.map((_,i)=>i),graph,v=>vertices[v],2*epsilon);
  if(groups.length<2||hasWeakMaterialRings(graph))return;
  // Only crop complete material graphs. Loose marks, slits and malformed
  // incidence must go through the whole-model diagnostics.
  if(graph.faces_edges.length!==faces.length||graph.edges_faces.length!==graph.edges_vertices.length||
     graph.faces_edges.some((edges,f)=>edges.length!==faces[f].length||edges.some((e,i)=>{
       const v=faces[f][i],w=faces[f][(i+1)%edges.length],edge=graph.edges_vertices[e];
       return !edge?.includes(v)||!edge.includes(w)||!graph.edges_faces![e]?.includes(f);
     }))||graph.edges_faces.some((owners,e)=>owners.length!==(graph.edges_assignment[e]==='B'?1:2)||
       owners.some(f=>!graph.faces_edges![f]?.includes(e))))return;
  const source=graph;
  return solve();

  async function solve():Promise<FlatFoldResult['layers']>{
    const topology=buildExactModelTopology(result,reportExactTopologyProgress);
    const coverage={faceCount:topology.faceCount,cellCount:topology.cellCount,walk:(v:Parameters<typeof walkExactCoverage>[1])=>walkExactCoverage(topology,v)};
    const owner:number[]=[],counts=groups.map(()=>0);
    groups.forEach((ids,g)=>ids.forEach(f=>{owner[f]=g;}));
    const touches=coveragePairMembership(coverage,(a,b)=>{
      if(owner[a]!==owner[b])throw Error('分组后仍有跨组纸面重叠。');
      counts[owner[a]]++;
    },reportLayerRegionProgress);
    const orders:NonNullable<FlatFoldResult['layers']['faceOrders']>=[];
    let failure:string|undefined;
    const tasks:GroupTask[]=groups.flatMap((ids,i)=>{
      if(ids.length===1)return [];
      const group=contactGroupGraph(ids,source,v=>vertices[v]);
      const input:FlatFoldResult={geometry:{status:'ready',message:'',graph:group,vertices:group.vertices_coords,faces:group.faces_vertices!},layers:{status:'unknown',message:''},warnings:[]};
      return [{input:{result:input,required:[],preferred:[],independentFlatEpsilon:epsilon},pairCount:counts[i],accept(answer){
        if(!answer.ok){failure=answer.message;return;}
        for(const [a,b,sign] of answer.orders)if(touches(ids[a],ids[b]))orders.push([ids[a],ids[b],sign]);
      }}];
    });
    // First-candidate flat search is cheaper per pair than spatial candidate
    // selection. Charge the same child startup to a correspondingly larger
    // batch (~384 overlapping faces per lane in the two-stack benchmark).
    await solveContactGroupTasks(tasks,73728);
    if(failure!==undefined)return {status:'error',message:failure};
    const comparisons=regionComparisonsFromFaceOrders(orders,modelExactFaceNormals(result));
    const checked=checkCoverageTournaments(coverage,comparisons.pairs,comparisons.values,reportLayerRegionProgress);
    if(!checked.complete||!checked.certificate||checked.triangles.length)return {status:'error',message:'独立纸叠合并后未通过全图层序认证。'};
    const faceOrder=flatLayerOrder(vertices,faces,orders);
    result.layers={status:'solved',message:'已分别求解独立纸叠，并验证全部重叠区域。',faceOrders:orders,constraints:[],...(faceOrder.length?{faceOrder}:{})};
    rememberFlatExactProof(result,{topology,certificate:checked.certificate,physicalOrdersOnly:true});
    return result.layers;
  }
}
