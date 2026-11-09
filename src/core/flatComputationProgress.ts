/** Progress is local to the current phase. Confirmed search relations measure
 * fixed facts, not the fraction of search time or remaining branches. */
export interface FlatComputationProgress {
 stage:string;
 label:string;
 completed?:number;
 total?:number;
 detail?:string;
 metric?:'confirmed-relations';
}
let listener:((progress:FlatComputationProgress)=>void)|undefined;
let previousStage='',previousTime=-Infinity;
let previousProgress:FlatComputationProgress|undefined,searchProgress:FlatComputationProgress|undefined;
export function installFlatComputationProgress(next?:typeof listener){listener=next;previousStage='';previousTime=-Infinity;previousProgress=undefined;searchProgress=undefined;}
export function reportFlatComputationProgress(progress:FlatComputationProgress){
 if(!listener)return;
 if(progress.stage==='candidate'||progress.stage==='search'||progress.stage==='search-strategy'){
  // Summary callbacks must not erase the measured relation counts produced by
  // the search itself, or briefly switch the card back to an unknown spinner.
  progress=progress.metric==='confirmed-relations'?{...progress,stage:'search',label:'搜索纸层顺序'}:
   searchProgress?{...searchProgress}:{...progress,stage:'search',label:'搜索纸层顺序'};
  if(progress.metric==='confirmed-relations')searchProgress=progress;
 }
 const time=performance.now(),complete=progress.total!==undefined&&progress.completed===progress.total;
 const newlyMeasured=progress.total!==undefined&&(previousProgress?.total===undefined||progress.metric!==previousProgress.metric);
 const newlyComplete=complete&&previousProgress?.completed!==progress.completed;
 if(progress.stage===previousStage&&!newlyComplete&&!newlyMeasured&&time-previousTime<250)return;
 previousStage=progress.stage;previousTime=time;previousProgress=progress;listener(progress);
}
export function reportExactTopologyProgress(stage:string,details:Record<string,number>){
 const labels:Record<string,string>={intersections:'计算纸面交点',topology:'建立纸面分区',cycles:'连接纸面区域', 'topology-complete':'纸面区域已建立'};
 const completed=details.processed??details.halfedges,total=details.total??details.totalHalfedges;
 reportFlatComputationProgress({stage:`regions-${stage}`,label:labels[stage]??'建立精确纸面区域',...(completed!==undefined&&total!==undefined?{completed,total}:{}),...(details.cells!==undefined?{detail:`${details.cells.toLocaleString('zh-CN')} 个区域`}:{})});
}
export function reportLayerRegionProgress(stage:string,details:Record<string,number>){
 const labels:Record<string,string>={'coverage-pairs':'建立区域层序关系','region-pruning':'准备区域剪枝','coverage-check':'认证纸面遮挡',candidate:'搜索纸层顺序',search:'搜索纸层顺序','coverage-constraints':'补充遮挡约束'};
 const completed=details.cells,total=details.total;
 reportFlatComputationProgress({stage,label:labels[stage]??'检查纸层关系',...(completed!==undefined&&total!==undefined?{completed,total}:{}),...(details.iteration!==undefined?{detail:`第 ${details.iteration.toLocaleString('zh-CN')} 轮搜索${details.pairs!==undefined?` · ${details.pairs.toLocaleString('zh-CN')} 组关系`:''}`}:{})});
}
