import {validateDoc,type Doc,type Point,type Segment} from '../core/types';
import {cross,distance,sub} from '../core/geometry';
import {getAngleBisector} from './bisector';
import {lineTarget} from './segmentTools';

export interface LineBisector {kind:'intersecting'|'parallel';origin:Point;direction:Point}

/** Mode 7, two-line branch. Intersecting lines use their farther endpoints to
 * choose the angle; disjoint parallel lines define their equidistant midline. */
export function lineBisector(first:Segment,second:Segment,eps=1e-6):LineBisector{
  const points=[first.a,first.b,second.a,second.b];
  if(points.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6)))throw new Error('两线角平分参考坐标无效或超出范围。');
  const la=distance(first.a,first.b),lb=distance(second.a,second.b);
  if(Math.min(la,lb)<=eps)throw new Error('参考线段为零长或过短。');
  const u:Point=[(first.b[0]-first.a[0])/la,(first.b[1]-first.a[1])/la],v:Point=[(second.b[0]-second.a[0])/lb,(second.b[1]-second.a[1])/lb];
  const angle=Math.abs(cross(u,v));
  if(angle<=1e-10){
    const signed=cross(u,sub(second.a,first.a));
    if(Math.abs(signed)<=eps)throw new Error('两条参考线共线或重合，不能确定两线之间的中线。');
    // The midpoint of the two segment midpoints is on the equidistant line.
    // A symmetric anchor keeps automatic cutoffs independent of endpoint order.
    const origin:Point=[(first.a[0]+first.b[0]+second.a[0]+second.b[0])/4,(first.a[1]+first.b[1]+second.a[1]+second.b[1])/4];
    const direction:Point=u[0]<0||(u[0]===0&&u[1]<0)?[-u[0],-u[1]]:u;
    return{kind:'parallel',origin,direction};
  }
  // A very shallow but nonparallel angle is not silently treated as parallel.
  if(angle<=1e-8)throw new Error('两线近似平行但不平行，交点不稳定；请调整参考线。');
  const t=cross(sub(second.a,first.a),v)/cross(u,v);
  const origin:Point=[first.a[0]+t*u[0],first.a[1]+t*u[1]];
  if(origin.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))throw new Error('两线交点超出坐标范围，请调整参考线。');
  const far=(s:Segment):Point=>{
    const da=distance(origin,s.a),db=distance(origin,s.b);
    if(Math.abs(da-db)>eps)return da>db?s.a:s.b;
    return s.a[0]<s.b[0]||(s.a[0]===s.b[0]&&s.a[1]<s.b[1])?s.a:s.b;
  };
  const a=far(first),b=far(second);
  return{kind:'intersecting',...getAngleBisector(a,origin,b)};
}

/** For intersecting lines, the actual intersection is the new crease origin.
 * A selected finite cutoff may be on either side, as in the two-line mode. */
export function lineBisectorCutoff(bisector:LineBisector,target:Segment,eps=1e-6):{a:Point;b:Point}{
  if(bisector.kind!=='intersecting')throw new Error('平行中线需要两个截止线段，不能以参考锚点作为端点。');
  const end=lineTarget(bisector.origin,bisector.direction,target,eps);
  if(distance(end,bisector.origin)<=eps)throw new Error('截止位置与两线交点重合，不能生成零长线。');
  return{a:[...bisector.origin],b:end};
}

/** Parallel midline has no natural start; both endpoints are explicit finite
 * targets, so input segment orientation cannot choose an arbitrary length. */
export function parallelMidlineCutoffs(bisector:LineBisector,first:Segment,second:Segment,eps=1e-6):{a:Point;b:Point}{
  if(bisector.kind!=='parallel')throw new Error('两条参考线不是平行线，请从交点选择一个截止线段。');
  const a=lineTarget(bisector.origin,bisector.direction,first,eps),b=lineTarget(bisector.origin,bisector.direction,second,eps);
  if(distance(a,b)<=eps)throw new Error('两个截止位置重合，请重新选择第二条截止线。');
  return{a,b};
}

export function parallelMidlineFull(doc:Doc,bisector:LineBisector,eps=1e-6):{a:Point;b:Point}{
  validateDoc(doc);
  if(bisector.kind!=='parallel')throw new Error('完整中线只适用于两条平行参考线。');
  const hits:{point:Point;t:number}[]=[];
  for(const s of doc.segments){if(s.assignment==='A')continue;try{const point=lineTarget(bisector.origin,bisector.direction,s,eps),delta=sub(point,bisector.origin);hits.push({point,t:delta[0]*bisector.direction[0]+delta[1]*bisector.direction[1]});}catch{/* Ignore parallel and extension-only targets. */}}
  const zero=hits.find(h=>Math.abs(h.t)<=eps),left=hits.filter(h=>h.t< -eps).sort((a,b)=>b.t-a.t)[0]??zero,right=hits.filter(h=>h.t>eps).sort((a,b)=>a.t-b.t)[0]??zero;
  if(!left||!right||distance(left.point,right.point)<=eps)throw new Error('中线缺少两端的实际截止，请改选两个截止线段。');
  return{a:left.point,b:right.point};
}
