import type {Point,Segment} from '../core/types';
import {distance,distanceToSegment} from './state';
import {angleOffsets,type AngleSystem} from './angleSystem';
import {lineTarget} from './segmentTools';

export interface AngleCandidate {origin:Point;direction:Point;end:Point;angle:number}
function validPoint(p:Point){
  if(!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))throw new Error('角度构造坐标无效或超出范围。');
}
/** Modes 13/18 omit baseline in divided systems; custom systems use only specified angles. */
export function constructionFan(origin:Point,toward:Point,system:AngleSystem,multiplier:10|100,eps=1e-6):AngleCandidate[]{
  validPoint(origin);validPoint(toward);const length=distance(origin,toward);
  if(length<=eps)throw new Error('两个角度基准点不能重合。');
  const angles=angleOffsets(system).filter(a=>system.kind==='custom'||a!==0);
  const base=Math.atan2(toward[1]-origin[1],toward[0]-origin[0]);
  return angles.map(angle=>{
    const radians=base+angle*Math.PI/180,direction:Point=[Math.cos(radians),Math.sin(radians)];
    // Preview endpoints can extend beyond document limits; only committed geometry must fit.
    return{origin:[...origin],direction,end:[origin[0]+length*multiplier*direction[0],origin[1]+length*multiplier*direction[1]],angle};
  });
}
function closestCandidate(fan:AngleCandidate[],pointer:Point,radius:number):number{
  validPoint(pointer);
  if(!Number.isFinite(radius)||radius<0)throw new Error('候选选择半径无效。');
  let index=-1,best=Infinity;
  fan.forEach((f,i)=>{const d=distanceToSegment(pointer,{a:f.origin,b:f.end});if(d<best){index=i;best=d;}});
  if(index<0||best>radius)throw new Error('请点击紫色候选方向附近。');
  return index;
}
export function convergenceFans(a:Point,b:Point,system:AngleSystem,eps=1e-6):[AngleCandidate[],AngleCandidate[]]{
  return[constructionFan(a,b,system,10,eps),constructionFan(b,a,system,10,eps)];
}
/** Pick one candidate from each fan at the same pointer location; return both finite legs. */
export function angleConvergence(a:Point,b:Point,system:AngleSystem,pointer:Point,radius:number,eps=1e-6):{point:Point;first:number;second:number;legs:{a:Point;b:Point}[]}{
  const fans=convergenceFans(a,b,system,eps),first=closestCandidate(fans[0],pointer,radius),second=closestCandidate(fans[1],pointer,radius);
  const u=fans[0][first].direction,v=fans[1][second].direction,delta:Point=[b[0]-a[0],b[1]-a[1]],den=u[0]*v[1]-u[1]*v[0];
  if(Math.abs(den)<=1e-8)throw new Error('两个候选方向平行或过于接近平行，不能确定会聚点。');
  const t=(delta[0]*v[1]-delta[1]*v[0])/den,w=(delta[0]*u[1]-delta[1]*u[0])/den;
  if(t<=eps||w<=eps)throw new Error('请在两组候选的前方选择会聚点，不能生成反向或零长线。');
  const point:Point=[a[0]+t*u[0],a[1]+t*u[1]];validPoint(point);
  return{point,first,second,legs:[{a:[...a],b:[...point]},{a:[...b],b:[...point]}]};
}
/** deg4: third click chooses a nearby finite preview ray and projects onto it. */
export function angleProjection(first:Point,origin:Point,system:AngleSystem,pointer:Point,radius:number,segments:readonly Segment[]=[],eps=1e-6):{point:Point;candidate:number;snappedTo?:string}{
  const fan=constructionFan(origin,first,system,100,eps),candidate=closestCandidate(fan,pointer,radius),direction=fan[candidate].direction;
  const delta:Point=[pointer[0]-origin[0],pointer[1]-origin[1]],t=delta[0]*direction[0]+delta[1]*direction[1];
  if(t<=eps)throw new Error('投影终点与起点重合或位于反向，请重新选择。');
  let point:Point=[origin[0]+t*direction[0],origin[1]+t*direction[1]],snappedTo:string|undefined;
  let target:Segment|undefined,best=Infinity;
  for(const segment of segments){
    validPoint(segment.a);validPoint(segment.b);if(distance(segment.a,segment.b)<=eps)continue;
    const d=distanceToSegment(pointer,segment);if(d<best){target=segment;best=d;}
  }
  if(target&&best<=radius){
    try{
      const hit=lineTarget(origin,direction,target,eps);
      const forward=(hit[0]-origin[0])*direction[0]+(hit[1]-origin[1])*direction[1];
      // Original deg4 only prefers a crossing if its distance is less than twice projection error.
      if(forward>eps&&distance(pointer,hit)<2*distance(pointer,point)){point=hit;snappedTo=target.id;}
    }catch{/* Parallel or extension-only target: retain the projected endpoint. */}
  }
  validPoint(point);return{point,candidate,...(snappedTo?{snappedTo}:{})};
}
