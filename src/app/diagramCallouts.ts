import type {Point} from '../core/types';

/** Illustration-only circular insets. Source positions use the paper drawing's
 * world coordinates or the referenced CP's original millimetre coordinates. */
export interface DiagramCalloutCircle {center:Point;radius:number}
export type DiagramCalloutSource=DiagramCalloutCircle&({kind:'paper'}|{kind:'cp';stateId:string;locator?:DiagramCalloutCircle});
export interface DiagramCalloutComparison {stateId:string;target:DiagramCalloutCircle}
export interface DiagramCallout {id:string;source:DiagramCalloutSource;target:DiagramCalloutCircle;comparison?:DiagramCalloutComparison;hideExistingCreases?:boolean}
export type DiagramCalloutTargetPart='target'|'comparison';
export interface DiagramCalloutTarget {part:DiagramCalloutTargetPart;circle:DiagramCalloutCircle;stateId?:string;label?:string}
export interface DiagramCalloutBounds {minX:number;minY:number;maxX:number;maxY:number}
export const DIAGRAM_CALLOUT_MAX_COUNT=32;
export const DIAGRAM_CALLOUT_MIN_RADIUS=.1;
export const DIAGRAM_CALLOUT_MAX_RADIUS=100_000;
export const DIAGRAM_CALLOUT_MAX_COORDINATE=1_000_000;

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
function record(value:unknown,keys:readonly string[],label:string):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))throw new Error(`${label}字段不完整或版本不支持。`);
  return value as Record<string,unknown>;
}
function identifier(value:unknown):value is string {
  return typeof value==='string'&&!!value.trim()&&value.length<=160&&!/[\u0000-\u001f\u007f]/.test(value);
}
function circle(value:Record<string,unknown>):void {
  if(!Array.isArray(value.center)||value.center.length!==2||!value.center.every(n=>finite(n)&&Math.abs(n)<=DIAGRAM_CALLOUT_MAX_COORDINATE)||
      !Object.hasOwn(value.center,0)||!Object.hasOwn(value.center,1)||!finite(value.radius)||value.radius<DIAGRAM_CALLOUT_MIN_RADIUS||value.radius>DIAGRAM_CALLOUT_MAX_RADIUS)throw new Error('局部放大图的圆心或半径无效。');
}
/** CP references belong to this step's two boundaries, never another step's
 * unrelated state. No geometry, rendered markup, or external resources persist. */
export function validateDiagramCallouts(value:unknown,allowedStateIds?:readonly string[]):asserts value is DiagramCallout[] {
  if(!Array.isArray(value)||value.length>DIAGRAM_CALLOUT_MAX_COUNT)throw new Error(`每步最多放置 ${DIAGRAM_CALLOUT_MAX_COUNT} 个局部放大图。`);
  const ids=new Set<string>();
  for(const raw of value){
    const entry=record(raw,['id','source','target',...(raw&&typeof raw==='object'&&Object.hasOwn(raw,'comparison')?['comparison']:[]),...(raw&&typeof raw==='object'&&Object.hasOwn(raw,'hideExistingCreases')?['hideExistingCreases']:[])],'局部放大图');
    if(!identifier(entry.id)||ids.has(entry.id))throw new Error('局部放大图编号无效或重复。');ids.add(entry.id);
    const candidate=entry.source as Record<string,unknown>|null;
    const source=record(candidate,candidate?.kind==='cp'?['kind','center','radius','stateId',...(Object.hasOwn(candidate,'locator')?['locator']:[])]:['kind','center','radius'],'局部放大图来源');
    if(source.kind!=='paper'&&source.kind!=='cp')throw new Error('局部放大图来源必须为纸面或 CP。');
    if(source.kind==='cp'&&(!identifier(source.stateId)||allowedStateIds&&!allowedStateIds.includes(source.stateId)))throw new Error('局部放大图必须引用本步骤的前 CP 或后 CP。');
    if(source.kind==='cp'&&Object.hasOwn(source,'locator'))circle(record(source.locator,['center','radius'],'CP 局部图定位圆'));
    if(Object.hasOwn(entry,'hideExistingCreases')&&(source.kind!=='cp'||typeof entry.hideExistingCreases!=='boolean'))throw new Error('屏蔽已有折痕设置无效。');
    circle(source);circle(record(entry.target,['center','radius'],'局部放大图显示圆'));
    if(Object.hasOwn(entry,'comparison')){
      const comparison=record(entry.comparison,['stateId','target'],'CP 前后对照圆');
      if(source.kind!=='cp'||!identifier(comparison.stateId)||comparison.stateId===source.stateId||
          allowedStateIds&&(source.stateId!==allowedStateIds[0]||comparison.stateId!==allowedStateIds[1]))throw new Error('CP 对照圆必须依次引用本步骤的操作前 CP 和操作后 CP。');
      circle(record(comparison.target,['center','radius'],'CP 操作后显示圆'));
    }
  }
}

/** A CP selection remains in its original coordinates. Its small circle is a
 * separate drawing aid; moving it never chooses another part of the CP.
 * Older projects derive a stable circle beside the target without mutation. */
export function diagramCalloutLocator(callout:DiagramCallout):DiagramCalloutCircle {
  if(callout.source.kind==='paper')return callout.source;
  if(callout.source.locator)return callout.source.locator;
  const {source,target}=callout,offset=3*target.radius,left=target.center[0]-offset;
  const x=left>=-DIAGRAM_CALLOUT_MAX_COORDINATE?left:target.center[0]+offset;
  return {center:[Math.max(-DIAGRAM_CALLOUT_MAX_COORDINATE,Math.min(DIAGRAM_CALLOUT_MAX_COORDINATE,x)),target.center[1]],radius:Math.max(DIAGRAM_CALLOUT_MIN_RADIUS,Math.min(DIAGRAM_CALLOUT_MAX_RADIUS,source.radius,target.radius/2.5))};
}

/** Comparison circles share one CP crop, while each is free to move and scale
 * on the main illustration. A legacy single circle keeps its original label-free layout. */
export function diagramCalloutTargets(callout:DiagramCallout):DiagramCalloutTarget[] {
  const target:DiagramCalloutTarget={part:'target',circle:callout.target,...(callout.source.kind==='cp'?{stateId:callout.source.stateId}:{})};
  if(!callout.comparison)return [target];
  return [{...target,label:'操作前 CP'},{part:'comparison',circle:callout.comparison.target,stateId:callout.comparison.stateId,label:'操作后 CP'}];
}

export function diagramCalloutBounds(callout:DiagramCallout):DiagramCalloutBounds {
  const targets=diagramCalloutTargets(callout),circles=[diagramCalloutLocator(callout),...targets.map(target=>target.circle)];
  return {minX:Math.min(...circles.map(c=>c.center[0]-c.radius)),minY:Math.min(...circles.map(c=>c.center[1]-c.radius)),maxX:Math.max(...circles.map(c=>c.center[0]+c.radius)),maxY:Math.max(...circles.map(c=>c.center[1]+c.radius),...targets.filter(target=>target.label).map(({circle:c})=>c.center[1]+c.radius*1.4))};
}
export function diagramCalloutsBounds(callouts:readonly DiagramCallout[]):DiagramCalloutBounds|null {
  if(!callouts.length)return null;
  const bounds=callouts.map(diagramCalloutBounds);
  return {minX:Math.min(...bounds.map(b=>b.minX)),minY:Math.min(...bounds.map(b=>b.minY)),maxX:Math.max(...bounds.map(b=>b.maxX)),maxY:Math.max(...bounds.map(b=>b.maxY))};
}
/** Drawing-frame convention shared with annotationBounds. */
export function diagramCalloutDrawingBounds(callouts:readonly DiagramCallout[]):{x:number;y:number;width:number;height:number}|null {
  const bounds=diagramCalloutsBounds(callouts);
  return bounds?{x:bounds.minX,y:bounds.minY,width:bounds.maxX-bounds.minX,height:bounds.maxY-bounds.minY}:null;
}
/** Paper magnifiers use exterior tangents. CP locators and comparison circles
 * stand independently. A contained paper pair has no exterior connector. */
export function diagramCalloutConnectors(callout:DiagramCallout,target:DiagramCalloutCircle=callout.target):[Point,Point][] {
  if(callout.source.kind==='cp')return [];
  const a=diagramCalloutLocator(callout),b=target,dx=b.center[0]-a.center[0],dy=b.center[1]-a.center[1],distance=Math.hypot(dx,dy);
  if(distance<=Math.abs(a.radius-b.radius))return [];
  const x=dx/distance,y=dy/distance,c=(a.radius-b.radius)/distance,s=Math.sqrt(Math.max(0,1-c*c));
  return [-1,1].map(sign=>{
    const nx=x*c-sign*y*s,ny=y*c+sign*x*s;
    return [[a.center[0]+a.radius*nx,a.center[1]+a.radius*ny],[b.center[0]+b.radius*nx,b.center[1]+b.radius*ny]];
  });
}
