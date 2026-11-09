import type {FlatFoldResult} from './types';
import type {ConvexLayerCandidate,ConvexLayerCandidateOptions} from './convexLayerCandidate';
import {checkCoverageTournaments,regionComparisonsFromFaceOrders,registerCoveragePairs} from './regionTournament';
import {reportFlatComputationProgress,reportExactTopologyProgress,reportLayerRegionProgress} from './flatComputationProgress';
import {buildExactModelTopology,walkExactCoverage} from '../app/modelExactTopology';
import {modelExactFaceNormals} from '../app/modelExactFaceNormals';
import {flatExactProof,rememberFlatExactProof} from '../app/flatExactProof';

/** Complete a selected solution once, in the solver, before publishing it.
 * Exact displayed coverage is the common contract; never shrink epsilon,
 * discard a small cell, or replace the selected candidate on failure. */
export function diagnoseFlatLayerCoverage(result:FlatFoldResult,complete:(options:ConvexLayerCandidateOptions)=>ConvexLayerCandidate|null):FlatFoldResult{
 if(result.geometry.status!=='ready'||result.layers.status!=='solved')return result;
 if(flatExactProof(result)){
  result.layers.selfDiagnosis??={status:'verified',missingPairs:0,stage:'完整区域认证'};
  return result;
 }
 let stage='精确覆盖检查',missingPairs=0;
 const previous=result.layers;
 const fail=(status:'conflict'|'error',detail:string)=>{
  result.layers={...previous,status:'error',message:`层序自检未通过（${stage}）：${detail} 当前关系与几何已保留，未发布不完整纸面；这不等于原折痕图无解。`,selfDiagnosis:{status,missingPairs,stage}};
  return result;
 };
 try{
  reportFlatComputationProgress({stage:'layer-self-diagnosis',label:'自检纸面覆盖与层序关系'});
  const topology=buildExactModelTopology(result,reportExactTopologyProgress);
  const normals=modelExactFaceNormals(result);
  const coverage={faceCount:topology.faceCount,cellCount:topology.cellCount,walk:(visitor:Parameters<typeof walkExactCoverage>[1])=>walkExactCoverage(topology,visitor)};
  stage='已有层序关系检查';
  const {pairs,values}=regionComparisonsFromFaceOrders(previous.faceOrders??[],normals);
  missingPairs=registerCoveragePairs(coverage,pairs,()=>{},reportLayerRegionProgress).added;
  if(!missingPairs){
   const checked=checkCoverageTournaments(coverage,pairs,values,reportLayerRegionProgress);
   if(!checked.complete||!checked.certificate||checked.triangles.length)return fail('conflict','已有上下关系在实际重叠区域内形成循环，不能靠补关系解决。');
   result.layers.selfDiagnosis={status:'verified',missingPairs:0,stage:'完整区域认证'};
   rememberFlatExactProof(result,{topology,certificate:checked.certificate});
   return result;
  }
  stage='遗漏关系补全';
  reportFlatComputationProgress({stage:'layer-self-completion',label:`自检发现遗漏，正在补全 ${missingPairs} 组纸面关系`,detail:'保留当前已确定的上下关系，完成后复核全部区域。'});
  const candidate=complete({coverage,fixedOrders:previous.faceOrders??[],onProgress:reportLayerRegionProgress});
  if(!candidate)return fail('conflict',`发现 ${missingPairs} 组遗漏关系，但保留当前关系时无法满足全部接触与覆盖约束。请重新选择层序方案。`);
  stage='补全结果复核';
  // Independently verify preservation and coverage, even if a candidate
  // supplies a certificate. A stale or incomplete candidate cannot publish.
  const completed=regionComparisonsFromFaceOrders(candidate.orders,normals);
  const byPair=new Map(completed.pairs.map(([a,b],i)=>[`${a}:${b}`,completed.values[i]]));
  if(pairs.some(([a,b],i)=>byPair.get(`${a}:${b}`)!==values[i]))return fail('error','补全结果改变或丢失了已有关系。');
  const checked=checkCoverageTournaments(coverage,completed.pairs,completed.values,reportLayerRegionProgress);
  if(!checked.complete||!checked.certificate||checked.triangles.length)return fail('conflict','补全后仍有区域层序循环。');
  if(previous.constraints?.length){
   const top=candidate.faceOrder?.at(-1);
   if(top===undefined||!previous.constraints.some(c=>c.face===top&&c.side===(normals[top]>0?'white':'color')))return fail('conflict','补全结果未满足指定的可见纸面，未替换当前方案。');
  }
  // The old enumeration count describes the tolerance model, not all exact
  // extensions. Keep its selection index for navigation, not its total count.
  const {solutionCount:_count,solutionCountExact:_exact,faceOrder:_order,...retained}=previous;
  result.layers={...retained,faceOrders:candidate.orders,...(candidate.faceOrder?{faceOrder:candidate.faceOrder}:{}),
   message:`${previous.message} 自检已补全 ${missingPairs} 组遗漏关系，保留已有上下关系并通过全部精确区域复核；补全后的方案总数尚未枚举。`,
   selfDiagnosis:{status:'completed',missingPairs,stage:'完整区域认证'}};
  rememberFlatExactProof(result,{topology,certificate:checked.certificate});
  return result;
 }catch(error){return fail('error',error instanceof Error?error.message:String(error));}
}
