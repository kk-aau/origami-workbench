import type { Doc, Point, Segment } from '../core/types';
import { distance, epsilonFor } from '../core/geometry';
import { lineTarget } from './segmentTools';

export function referenceDirection(base:Segment,perpendicular:boolean):Point {
  const dx=base.b[0]-base.a[0],dy=base.b[1]-base.a[1],length=Math.hypot(dx,dy);
  if(![...base.a,...base.b].every(Number.isFinite)||!Number.isFinite(length)||length<=1e-10)throw new Error('参考线长度为零或坐标无效。');
  return perpendicular?[-dy/length,dx/length]:[dx/length,dy/length];
}
/** Like Oriedita, projection may fall on the supporting line beyond its endpoints. */
export function perpendicularFoot(origin:Point,base:Segment):Point {
  const d=referenceDirection(base,false);
  if(!origin.every(Number.isFinite))throw new Error('起点坐标无效。');
  const t=(origin[0]-base.a[0])*d[0]+(origin[1]-base.a[1])*d[1];
  const foot:Point=[base.a[0]+t*d[0],base.a[1]+t*d[1]];
  if(!foot.every(Number.isFinite)||foot.some(n=>Math.abs(n)>1e6))throw new Error('垂足超出坐标范围。');
  return foot;
}
export function constructionEnd(origin:Point,direction:Point,target:Segment,eps=1e-6):Point {
  const end=lineTarget(origin,direction,target,eps);
  if(distance(origin,end)<=eps)throw new Error('截止线经过起点，不能生成零长度线段。');
  return end;
}
/** Two finite purple candidates, ending at the first real crease/boundary on each side. */
export function directionCandidates(doc:Doc,origin:Point,direction:Point):{a:Point;b:Point}[] {
  const eps=epsilonFor(doc),hits:{point:Point;t:number}[]=[];
  for(const target of doc.segments){
    if(target.assignment==='A')continue;
    try{const point=constructionEnd(origin,direction,target,eps),t=(point[0]-origin[0])*direction[0]+(point[1]-origin[1])*direction[1];hits.push({point,t});}catch{/* Parallel, through-origin or finite-target misses are not stops. */}
  }
  return [-1,1].flatMap(sign=>{
    const first=hits.filter(h=>h.t*sign>eps).sort((a,b)=>Math.abs(a.t)-Math.abs(b.t))[0];
    return first?[{a:origin,b:first.point}]:[];
  });
}
