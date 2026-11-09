import type {DiagnosticResult,Point} from '../core/types';

export const DIAGNOSTIC_HIGHLIGHT_COLOR='#e53935';
export interface DiagnosticHighlights {segmentIds:ReadonlySet<string>;points:Point[]}

/** A fresh check shows all errors; choosing a row isolates that issue. */
export function diagnosticHighlights(result:DiagnosticResult|null,focusedIssueId:string|null):DiagnosticHighlights{
 const issues=result?.issues.filter(issue=>focusedIssueId===null?issue.severity==='error':issue.id===focusedIssueId)??[];
 const segmentIds=new Set<string>(),points=new Map<string,Point>();
 for(const issue of issues){
  for(const id of issue.segmentIds)segmentIds.add(id);
  if(issue.point)points.set(issue.point.join(','),issue.point);
 }
 return {segmentIds,points:[...points.values()]};
}
