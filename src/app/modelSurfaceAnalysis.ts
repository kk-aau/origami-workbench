import type {FlatFoldResult} from '../core/types';
import {checkCoverageTournaments,regionComparisonsFromFaceOrders} from '../core/regionTournament';
import {modelOverlapRegions} from './modelOverlapRegions';
import {modelRegionLayers,type ModelRegionLayerOrder} from './modelRegionLayers';
import {modelRegionBoundaries} from './modelRegionBoundaries';
import {modelRegionShadows} from './modelRegionShadows';
import {modelSurfacePrecision} from './modelSurfacePrecision';
import {buildExactModelTopology,walkExactCoverage} from './modelExactTopology';
import {modelExactFaceNormals as faceNormals} from './modelExactFaceNormals';
import {flatExactProof,rememberFlatExactProof} from './flatExactProof';
import {completeExactSurface} from './completeExactSurface';
import type {ModelOverlapRequest,ModelOverlapReply,ModelSurface,ModelOverlapProgress} from './modelOverlapTask';

/** Verify the selected relations as they stand. A missing comparison or cycle
 * is an incomplete selected solution, never permission to search for another
 * solution or to send a concave model through the convex candidate solver. */
function selectedExactSurface(request:ModelOverlapRequest,onProgress?:((progress:ModelOverlapProgress)=>void)):ModelOverlapReply{
 const {result}=request,pass=2;
 if(result.layers.status!=='solved')return {status:'error',message:'当前层序尚未求解完成，不能认证完整纸面；未发布不完整纸面。'};
 try{
  onProgress?.({stage:'coverage',pass,epsilon:0});
  const topology=buildExactModelTopology(result,()=>onProgress?.({stage:'coverage',pass,epsilon:0}));
  onProgress?.({stage:'layers',pass,epsilon:0});
  const {pairs,values}=regionComparisonsFromFaceOrders(result.layers.faceOrders??[],faceNormals(result));
  const coverage={faceCount:topology.faceCount,cellCount:topology.cellCount,walk:(visitor:Parameters<typeof walkExactCoverage>[1])=>walkExactCoverage(topology,visitor)};
  const checked=checkCoverageTournaments(coverage,pairs,values,()=>onProgress?.({stage:'layers',pass,epsilon:0}));
  if(!checked.complete||checked.triangles.length||!checked.certificate)throw Error('当前选中的层序在真实覆盖区域中存在局部循环，不能保留原关系并完成认证。');
  const proof={topology,certificate:checked.certificate};
  // The proof remains worker-local and is never attached to persisted data.
  if(result.layers.faceOrders)rememberFlatExactProof(result,proof);
  return completeExactSurface(result,proof,{...request,pass},onProgress);
 }catch(error){return {status:'error',message:`所选层序关系不能完整验证，未发布不完整纸面：${error instanceof Error?error.message:String(error)} 不会自动替换当前选中解。`};}
}

/** Reuse the solver's exact proof when present. An already complete lightweight
 * presentation retains its existing format. Otherwise perform one strict
 * verification of the selected solution; shrinking display epsilon cannot
 * supply missing relations and is never an unbounded retry strategy. */
export function computeModelSurface(request:ModelOverlapRequest,onProgress?:(progress:ModelOverlapProgress)=>void):ModelOverlapReply{
 const {result,side,bothSides,shadows=true}=request;
 if(side!==undefined&&side!=='front'&&side!=='back')throw Error('重叠区域观察方向无效。');
 if(side!==undefined&&result.layers.status!=='solved')return {status:'error',message:'当前层序尚未求解完成，不能认证完整纸面；未发布不完整纸面。'};
 const cached=flatExactProof(result);
 if(cached)return completeExactSurface(result,cached,{side,bothSides,shadows},onProgress);
 const epsilon=modelSurfacePrecision(result.geometry.vertices).defaultEpsilon,pass=1;
 onProgress?.({stage:'coverage',pass,epsilon});
 const analysis=modelOverlapRegions(result,epsilon);
 if(!analysis.omittedThinRegions&&analysis.cells.length){
  if(side===undefined)return {status:'complete',analysis};
  onProgress?.({stage:'layers',pass,epsilon});
  const regions=modelRegionLayers(result,analysis,side);
  if(regions.every(region=>region.layers.status==='ordered')){
   const surface=(ordered:typeof regions):ModelSurface=>{
    onProgress?.({stage:'boundaries',pass,epsilon});const boundaries=modelRegionBoundaries(result,ordered,undefined,epsilon);
    return {regions:ordered,boundaries,...(shadows?{shadows:modelRegionShadows(ordered,boundaries,epsilon)}:{})};
   };
   const front=surface(regions),reversed=new WeakMap<ModelRegionLayerOrder,ModelRegionLayerOrder>();
   const opposite=bothSides?surface(regions.map(region=>{
    if(region.layers.status!=='ordered')return {...region};let layers=reversed.get(region.layers);
    if(!layers){layers={status:'ordered',topToBottom:[...region.layers.topToBottom].reverse()};reversed.set(region.layers,layers);}return {...region,layers};
   })):undefined;
   const ambiguous=Math.max(front.boundaries.ambiguousEdges,opposite?.boundaries.ambiguousEdges??0,front.shadows?.ambiguousEdges??0,opposite?.shadows?.ambiguousEdges??0);
   if(!ambiguous)return {status:'complete',analysis,...front,...(opposite?{opposite}:{})};
  }
 }
 return selectedExactSurface(request,onProgress);
}
