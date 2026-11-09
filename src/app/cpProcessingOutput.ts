import {cpProcessingLineRuns,type CPPathOptimization,type CPProcessingPath} from '../core/cpPathOptimizer';

/** LINE-only output cannot encode a continuous trail: preview every actual entity. */
export function processingOutputPaths(plan:CPPathOptimization,independentLines=false):CPProcessingPath[] {
  if(!independentLines)return plan.paths;
  return cpProcessingLineRuns(plan).map(({path,firstEdge,endEdge})=>({
    id:`${path.id}_edge${firstEdge+1}`,groupId:path.groupId,settingsKey:path.settingsKey,
    points:[path.points[firstEdge],path.points[endEdge]],sourceSegmentIds:path.sourceSegmentIds.slice(firstEdge,endEdge),assignments:path.assignments.slice(firstEdge,endEdge),
  }));
}
