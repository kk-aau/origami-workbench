import type {CPPathOptimization,CPProcessingPath} from '../core/cpPathOptimizer';
import {cpProcessingLineRuns} from '../core/cpPathOptimizer';
import type {CPProcessingReadbackReport} from '../core/cpProcessingExport';
import type {Doc,Point,Assignment} from '../core/types';
import {processingOutputPaths} from './cpProcessingOutput';
export type ProcessingPreviewLine={key:string;path:number;stroke:number;edge:number;a:Point;b:Point;assignment:Assignment;sourceIds:string[]};
export function processingPreviewPaths(doc:Doc,plan:CPPathOptimization|null,original:boolean,groups:boolean,representation:CPProcessingReadbackReport['representation']='dxf-line'):CPProcessingPath[]{
 if(plan)return original?plan.baselinePaths:processingOutputPaths(plan,!groups&&representation!=='dxf-polyline');
 return doc.segments.map(s=>({id:s.id,groupId:s.assignment,settingsKey:'',points:[s.a,s.b],sourceSegmentIds:[s.id],assignments:[s.assignment]}));
}
/** Keep serialized LINE numbering separate from the optimized path it belongs to.
 * Route object identity also distinguishes repeated passes and equal source IDs. */
export function processingPreviewStrokeOwners(plan:CPPathOptimization|null,original:boolean,groups:boolean,fallbackCount=0,representation:CPProcessingReadbackReport['representation']='dxf-line'):number[]{
 if(!plan)return Array.from({length:fallbackCount},(_,i)=>i);
 if(original)return plan.baselinePaths.map((_,i)=>i);
 if(groups||representation==='dxf-polyline')return plan.paths.map((_,i)=>i);
 const owners=new Map(plan.paths.map((path,i)=>[path,i]));
 return cpProcessingLineRuns(plan).map(run=>owners.get(run.path)!);
}
export function processingPreviewLines(paths:CPProcessingPath[],strokeOwners?:readonly number[]):ProcessingPreviewLine[]{
 return paths.flatMap((path,i)=>path.points.slice(0,-1).map((a,edge)=>({key:`${i}:${edge}`,path:i,stroke:strokeOwners?.[i]??i,edge,a,b:path.points[edge+1],assignment:path.assignments[edge],sourceIds:path.points.length===2?path.sourceSegmentIds:[path.sourceSegmentIds[edge]]})));
}
/** Count actual serialized entities: a LINE and a multi-edge POLYLINE each
 * count once. Preserve processing multiplicity and verify preview agreement. */
export function processingPreviewStatistics(plan:CPPathOptimization,report:CPProcessingReadbackReport){
 const polyline=report.format==='dxf-r12-polyline'&&report.representation==='dxf-polyline';
 const supported=polyline||(report.format==='dxf-lines'&&report.representation==='dxf-line');
 const paths=processingOutputPaths(plan,!polyline),occurrences=plan.baselinePaths.length;
 const length=paths.reduce((n,p)=>n+p.points.slice(1).reduce((s,b,i)=>s+Math.hypot(b[0]-p.points[i][0],b[1]-p.points[i][1]),0),0);
 const tolerance=16*Number.EPSILON*Math.max(1,length,report.downLength)*Math.max(1,occurrences);
 if(!supported||report.entityCount!==paths.length||report.pathCount!==paths.length||report.processedEdgeCount!==occurrences||report.plannedPathCount!==plan.paths.length||!Number.isFinite(report.downLength)||Math.abs(report.downLength-length)>tolerance||!Number.isFinite(report.travelLength)||Math.abs(report.travelLength-plan.after.travelDistance)>16*Number.EPSILON*Math.max(1,report.travelLength,plan.after.travelDistance)*Math.max(1,occurrences))throw Error('预览统计与实际 DXF 回读不一致，请重新生成。');
 return {beforeEntities:occurrences,afterEntities:report.entityCount,beforeLength:plan.before.drawLength,afterLength:report.downLength,beforeTravel:plan.before.travelDistance,afterTravel:report.travelLength,plannedGroups:plan.paths.length,sourceEdges:plan.analysis.included.length};
}
