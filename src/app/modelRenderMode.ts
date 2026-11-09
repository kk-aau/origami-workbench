import type {FlatFoldResult} from '../core/types';
import type {ModelLayerRegion} from './modelRegionLayers';
import type {ModelRegionBoundaries} from './modelRegionBoundaries';
import {exactSurfaceIssue,type ExactSurfaceData} from './modelExactSurfaceData';

export type ModelRenderMode='wire'|'xray'|'ordered'|'regions';

type SurfaceCandidate={status?:string;regions?:ModelLayerRegion[];boundaries?:ModelRegionBoundaries;analysis?:{cells:unknown[];omittedThinRegions:number};omittedThinRegions?:number;exact?:ExactSurfaceData['exact'];exactAnalysis?:ExactSurfaceData['exactAnalysis']};

/** A finished worker is not proof of a complete paper surface. Keep this check
 * shared by live views and exports, including results from older workers. */
export function modelRegionSurfaceIssue(data:SurfaceCandidate|null|undefined):string|null{
 if(!data)return '纸面结果缺失';
 if(data.status!==undefined&&data.status!=='complete')return '纸面计算尚未完成';
 if(data.exact)return exactSurfaceIssue({exact:data.exact,exactAnalysis:data.exactAnalysis!});
 const reasons:string[]=[],regions=data.regions,boundaries=data.boundaries;
 if(!Array.isArray(regions))reasons.push('局部区域结果缺失');
 else{
  const unconfirmed=regions.filter(region=>region?.layers?.status!=='ordered').length;
  if(unconfirmed)reasons.push(`${unconfirmed} 个区域的遮挡未确认`);
  const incomplete=regions.filter(region=>{
   if(region?.layers?.status!=='ordered')return false;
   const order=region.layers.topToBottom,faces=region.faces;
   if(!Array.isArray(order)||!Array.isArray(faces)||!faces.length||order.length!==faces.length)return true;
   const ordered=new Set(order);
   return ordered.size!==faces.length||faces.some(face=>!ordered.has(face));
  }).length;
  if(incomplete)reasons.push(`${incomplete} 个区域的纸层顺序不完整`);
 }
 if(data.status==='complete'&&!data.analysis)reasons.push('重叠区域分析缺失');
 if(data.analysis){
  if(!Array.isArray(data.analysis.cells))reasons.push('重叠区域分析无效');
  else if(Array.isArray(regions)&&regions.length!==data.analysis.cells.length)reasons.push('局部区域数量与重叠分析不一致，完整覆盖尚未确认');
 }
 const thinCounts=[...(data.analysis?[data.analysis.omittedThinRegions]:[]),...(data.omittedThinRegions!==undefined?[data.omittedThinRegions]:[])];
 if(thinCounts.some(thin=>!Number.isInteger(thin)||thin<0))reasons.push('细小区域覆盖状态无效');
 else if(thinCounts.some(thin=>thin>0))reasons.push(`${Math.max(...thinCounts)} 个细小区域尚未纳入纸面，完整覆盖尚未确认`);
 if(!boundaries||!Array.isArray(boundaries.edges)||Array.isArray(regions)&&regions.length>0&&!boundaries.edges.length)reasons.push('可见边界结果缺失');
 if(boundaries){
  if(!Number.isInteger(boundaries.ambiguousEdges)||boundaries.ambiguousEdges<0)reasons.push('边界可见性状态无效');
  else if(boundaries.ambiguousEdges)reasons.push(`${boundaries.ambiguousEdges} 段边界的可见性待确认`);
 }
 return reasons.length?reasons.join('；'):null;
}

/** Merged fills may be published only with complete local orders and contours. */
export function hasModelRegionSurface(data:SurfaceCandidate|null|undefined):data is SurfaceCandidate&{regions:ModelLayerRegion[];boundaries:ModelRegionBoundaries}{
 return !data?.exact&&modelRegionSurfaceIssue(data)===null;
}

export function hasExactModelSurface(data:SurfaceCandidate|null|undefined):data is SurfaceCandidate&ExactSurfaceData {
 return !!data?.exact&&modelRegionSurfaceIssue(data)===null;
}
export function hasCompleteModelSurface(data:SurfaceCandidate|null|undefined):data is SurfaceCandidate&({regions:ModelLayerRegion[];boundaries:ModelRegionBoundaries}|ExactSurfaceData) {
 return modelRegionSurfaceIssue(data)===null;
}

/** Paper fill needs a verified whole-face order or its matching local surface.
 * Face IDs are selection identities, never a fallback stacking order.
 */
export function modelRenderMode(result:FlatFoldResult,hasOrder:boolean,options:{wire?:boolean;xray?:boolean;regionsReady?:boolean}={}):ModelRenderMode{
 if(options.wire||result.layers.status==='no-solution')return 'wire';
 if(options.xray)return 'xray';
 if(result.layers.status==='solved'){
  if(hasOrder)return 'ordered';
  if(options.regionsReady)return 'regions';
 }
 return 'wire';
}
