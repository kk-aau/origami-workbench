/** Optional worker progress, never a complexity budget or a deadline. */
let reporter:((operations:number)=>void)|undefined;
let operations=0,lastReport=0,lastSent=0;
export function setDiagramWorkReporter(next:typeof reporter):void {reporter=next;operations=0;lastReport=0;lastSent=0;}
export function flushDiagramWork():void {reporter?.(operations);}
export function reportDiagramWork(count=1):void {
  if(!reporter)return;
  operations+=count;
  if(operations-lastReport>=65_536){lastReport=operations;const now=performance.now();if(now-lastSent>=100){lastSent=now;reporter(operations);}}
}
export class DiagramWorkCounter {tick(count=1):void {reportDiagramWork(count);}}
