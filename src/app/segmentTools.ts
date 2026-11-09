import { defaultAngle, type Assignment, type Doc, type Point, type Segment } from '../core/types';
import { distance, epsilonFor } from '../core/geometry';

type End = 'a' | 'b';
const sub = (a: Point,b: Point): Point => [a[0]-b[0],a[1]-b[1]];
const cross = (a: Point,b: Point) => a[0]*b[1]-a[1]*b[0];
const point = (p: Point) => Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
function valid(s: Segment,eps: number) {
  if(!point(s.a)||!point(s.b)||distance(s.a,s.b)<=eps)throw new Error('参考线长度为零或坐标无效。');
}
/** Intersection with a finite target, never with its extension. */
export function lineTarget(origin: Point,direction: Point,target: Segment,eps=1e-6): Point {
  valid(target,eps);
  const length=Math.hypot(...direction);
  if(!point(origin)||!point(direction)||length<=eps)throw new Error('构造方向无效。');
  const unit: Point=[direction[0]/length,direction[1]/length];
  const edge=sub(target.b,target.a),delta=sub(target.a,origin),denominator=cross(unit,edge);
  if(Math.abs(denominator)<=1e-10*Math.hypot(...edge))throw new Error('目标线平行或重合，不能确定唯一交点。');
  const t=cross(delta,edge)/denominator,u=cross(delta,unit)/denominator;
  if(u < -eps/Math.hypot(...edge)||u > 1+eps/Math.hypot(...edge))throw new Error('交点在目标线的延长线上，请选择实际经过交点的线段。');
  const p: Point=u<=0?[...target.a]:u>=1?[...target.b]:[origin[0]+t*unit[0],origin[1]+t*unit[1]];
  if(!point(p)||p.some(n=>Math.abs(n)>1e6))throw new Error('交点超出坐标范围。');
  return p;
}
export function extendSegment(source: Segment,end: End,target: Segment,eps=1e-6): Segment {
  valid(source,eps);
  if(source.id===target.id)throw new Error('请选择另一条目标线。');
  const other=end==='a'?'b':'a',direction=sub(source[end],source[other]);
  const hit=lineTarget(source[end],direction,target,eps);
  const delta=sub(hit,source[end]);
  if((delta[0]*direction[0]+delta[1]*direction[1])/Math.hypot(...direction)<=eps)throw new Error('目标不在所选端点的向外延长方向，请选择另一端或其他目标。');
  return {...source,[end]:hit};
}
/** Extend one endpoint to a finite target and apply the active drawing type. */
export function lengthenSegment(source: Segment,end: End,target: Segment,assignment: Assignment,eps=1e-6): Segment {
  const extended=extendSegment(source,end,target,eps);
  return {...extended,assignment,angle:defaultAngle(assignment)};
}
export function trimSegment(source: Segment,end: End,cut: Point,tolerance: number,eps=1e-6): Segment {
  valid(source,eps);
  if(!point(cut)||!Number.isFinite(tolerance)||tolerance<0)throw new Error('截断点无效。');
  const d=sub(source.b,source.a),length=Math.hypot(...d),delta=sub(cut,source.a);
  const t=(delta[0]*d[0]+delta[1]*d[1])/(length*length);
  const projected: Point=[source.a[0]+t*d[0],source.a[1]+t*d[1]];
  if(distance(cut,projected)>tolerance||t*length<=eps||(1-t)*length<=eps)throw new Error('请点击该线段内部的截断点，不能使用端点或线段外的位置。');
  return {...source,[end]:projected};
}
export function divisionParameters(count: number): number[] {
  if(!Number.isInteger(count)||count<2||count>100)throw new Error('等分数必须是 2–100 的整数。');
  return Array.from({length:count-1},(_,i)=>(i+1)/count);
}
export function ratioParameter(a: number,b: number): number {
  if(!Number.isFinite(a)||!Number.isFinite(b)||a<=0||b<=0)throw new Error('内分比两项都必须为正数。');
  const scale=Math.max(a,b),t=(a/scale)/(a/scale+b/scale);
  if(t<=0||t>=1)throw new Error('比例过于悬殊，无法生成有效分点。');
  return t;
}
export function divideSegment(doc: Doc,source: Segment,parameters: number[],from: End='a'): Segment[] {
  const eps=epsilonFor(doc);valid(source,eps);
  if(!parameters.length||parameters.some(t=>!Number.isFinite(t)||t<=0||t>=1))throw new Error('分点必须位于线段内部。');
  const ts=[0,...parameters.map(t=>from==='a'?t:1-t).sort((a,b)=>a-b),1];
  const length=distance(source.a,source.b);
  if(ts.some((t,i)=>i>0&&(t-ts[i-1])*length<=eps))throw new Error('分段太短或分点重复，请减小等分数或调整比例。');
  const used=new Set([...doc.segments.map(s=>s.id),...(doc.objects??[]).map(o=>o.id)]);
  const at=(t:number): Point=>[source.a[0]+t*(source.b[0]-source.a[0]),source.a[1]+t*(source.b[1]-source.a[1])];
  return ts.slice(1).map((t,i)=>{
    let id=source.id;
    if(i){const base=`${source.id}::divide:${i+1}`;id=base;let n=2;while(used.has(id))id=`${base}:${n++}`;used.add(id);}
    return {...source,id,a:at(ts[i]),b:at(t)};
  });
}
export function perpendicularBisector(a: Point,b: Point,target: Segment,eps=1e-6): {a:Point;b:Point} {
  if(!point(a)||!point(b)||distance(a,b)<=eps)throw new Error('两基准点不能重合。');
  const midpoint: Point=[(a[0]+b[0])/2,(a[1]+b[1])/2];
  const hit=lineTarget(midpoint,[-(b[1]-a[1]),b[0]-a[0]],target,eps);
  if(distance(midpoint,hit)<=eps)throw new Error('截止线经过中点，结果长度为零，请换一条截止线。');
  return {a:midpoint,b:hit};
}
