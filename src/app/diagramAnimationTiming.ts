import {distance,pointOnSegment} from '../core/geometry';
import type {Point,Segment} from '../core/types';
import type {DiagramAnnotation,DiagramLineAnnotation,DiagramLineAnimationTiming} from './diagramAnnotations';
import {isDiagramCPExistingLine,validateDiagramAnnotations} from './diagramAnnotations';
import type {SimulationStepAnimation} from '../engine/simStepAnimation';
import type {DiagramCPState,DiagramPose} from './diagramProject';
import type {DiagramFoldLinkSettings} from './diagramFoldLinkTypes';
import {mapDiagramFoldLines} from './diagramFoldLink';

export const isDiagramAnimatedLine=(a:DiagramAnnotation):a is DiagramLineAnnotation=>
  a.kind==='line'&&(a.style==='valley'||a.style==='mountain')&&!isDiagramCPExistingLine(a)&&a.foldFaces?.length!==0;

/** Resolve the dependency DAG in action units: every source stroke has one
 * action unit, so B after 80% of A starts at A.start + .8, even in a chain. */
export function diagramAnimationLineWindows(annotations:readonly DiagramAnnotation[]):Map<string,{start:number;end:number}>{
  const lines=annotations.filter(isDiagramAnimatedLine),byId=new Map(lines.map(a=>[a.id,a]));
  if(!lines.some(a=>a.animationTiming))return new Map();
  const windows=new Map<string,{start:number;end:number}>(),visiting=new Set<string>();
  for(const origin of lines){
    if(windows.has(origin.id))continue;
    const chain:DiagramLineAnnotation[]=[];let current:DiagramLineAnnotation|undefined=origin;
    while(current&&!windows.has(current.id)){
      if(visiting.has(current.id))throw Error('折痕启动条件形成循环，请取消其中一条依赖。');
      visiting.add(current.id);chain.push(current);
      const timing=current.animationTiming;
      if(!timing)break;
      if(!Number.isFinite(timing.startAfter)||timing.startAfter<0||timing.startAfter>1||timing.afterLineId===current.id)throw Error('折痕启动条件无效，请重新设置参考折痕和 0% 到 100% 的比例。');
      current=byId.get(timing.afterLineId);
      if(!current)throw Error('参考折痕已删除、改为示意线或暂停参与，请重新选择参考折痕，或改为同时开始。');
    }
    for(let i=chain.length-1;i>=0;i--){
      const line=chain[i],timing=line.animationTiming,reference=timing?windows.get(timing.afterLineId):undefined;
      const start=timing?reference!.start+timing.startAfter*(reference!.end-reference!.start):0;
      windows.set(line.id,{start,end:start+1});visiting.delete(line.id);
    }
  }
  return windows;
}

export function setDiagramLineAnimationTiming(annotations:readonly DiagramAnnotation[],ids:readonly string[],timing:DiagramLineAnimationTiming|undefined):DiagramAnnotation[]{
  const targets=new Set(ids),next=annotations.map(a=>{
    if(!targets.has(a.id)||!isDiagramAnimatedLine(a))return a;
    const {animationTiming:_old,...line}=a;
    return timing?{...line,animationTiming:{...timing}}:line;
  });
  validateDiagramAnnotations(next);diagramAnimationLineWindows(next);return next;
}

/** A deleted or disabled reference stops governing another line. This is a
 * metadata edit only; it cannot create, remove or reassign a physical crease. */
export function cleanDiagramAnimationTimings(annotations:readonly DiagramAnnotation[]):DiagramAnnotation[]{
  const active=new Set(annotations.filter(isDiagramAnimatedLine).map(a=>a.id));
  return annotations.map(a=>{
    if(a.kind!=='line'||!a.animationTiming||active.has(a.id)&&active.has(a.animationTiming.afterLineId))return a;
    const {animationTiming:_old,...line}=a;return line;
  });
}

export function diagramAnimationSourceSegments(annotations:readonly DiagramAnnotation[],pose:DiagramPose,source:DiagramCPState,settings?:DiagramFoldLinkSettings):Map<string,Segment[]>{
  if(!annotations.some(a=>a.kind==='line'&&a.animationTiming))return new Map();
  diagramAnimationLineWindows(annotations);
  return new Map(annotations.filter(isDiagramAnimatedLine).map(line=>{
    const config:DiagramFoldLinkSettings=line.foldFaces?{enabled:true,layers:'selected',selectedFaces:line.foldFaces}:settings??{enabled:true,layers:'all',selectedFaces:[]};
    return [line.id,mapDiagramFoldLines(pose,[line],config,source).segments];
  }));
}

/** Map each source stroke to all of its driven material daughters. Two drawing
 * handles may address one physical hinge, but cannot give it different clocks. */
export function diagramAnimationMaterialTimings(
  annotations:readonly DiagramAnnotation[],mapped:ReadonlyMap<string,readonly Segment[]>,
  edges:readonly (readonly [number,number])[],cp:readonly Point[],ranges:SimulationStepAnimation['ranges'],eps:number
):NonNullable<SimulationStepAnimation['timings']>|undefined {
  const windows=diagramAnimationLineWindows(annotations);if(!windows.size)return undefined;
  const moving=ranges.filter(r=>r.fromAngle!==r.toAngle||r.viaAngle!==undefined&&(r.viaAngle!==r.fromAngle||r.viaAngle!==r.toAngle));
  const byEdge=new Map<number,{start:number;end:number}>(),mappedLines=new Set<string>();
  for(const [id,window] of windows){
    for(const range of moving){
      const [a,b]=edges[range.edge];
      const covered=(mapped.get(id)??[]).some(s=>pointOnSegment(cp[a],s,eps)&&pointOnSegment(cp[b],s,eps)&&distance(cp[a],cp[b])>eps);
      if(!covered)continue;
      const previous=byEdge.get(range.edge);
      if(previous&&(Math.abs(previous.start-window.start)>1e-9||Math.abs(previous.end-window.end)>1e-9))throw Error('重合的折线指向同一条材料折痕，不能使用不同启动时间；请统一这些线的时序。');
      byEdge.set(range.edge,window);mappedLines.add(id);
    }
  }
  for(const line of annotations.filter(isDiagramAnimatedLine))if(line.animationTiming){
    if(!mappedLines.has(line.id)||!mappedLines.has(line.animationTiming.afterLineId))throw Error('启动条件中的折痕在本步没有可驱动的折叠动作，请检查作用纸层和前后 CP。');
  }
  let duration=1;for(const window of byEdge.values())duration=Math.max(duration,window.end);
  return [...byEdge].map(([edge,w])=>({edge,start:w.start/duration,end:w.end/duration})).sort((a,b)=>a.edge-b.edge);
}
