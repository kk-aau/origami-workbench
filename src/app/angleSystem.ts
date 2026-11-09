import type {Point,Segment} from '../core/types';
import {distance} from '../core/geometry';
import {lineTarget} from './segmentTools';

export type AngleSystem = {kind:'divided';divider:number}|{kind:'custom';angles:[number,number,number]};
export const DEFAULT_ANGLE_SYSTEM:AngleSystem={kind:'divided',divider:8};
const normalize=(a:number)=>((a%360)+360)%360;
const radians=(a:number)=>a*Math.PI/180;
const unit=(a:number):Point=>[Math.cos(radians(a)),Math.sin(radians(a))];
function validPoint(p:Point){
  if(!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))throw new Error('角度构造坐标无效或超出范围。');
}
function validate(system:AngleSystem){
  if(system.kind==='divided'){
    if(!Number.isInteger(system.divider)||system.divider<2||system.divider>360)throw new Error('角度等分数必须为 2–360 的整数。');
  }else if(system.kind!=='custom'||system.angles.length!==3||system.angles.some(a=>!Number.isFinite(a)||a<0||a>360))throw new Error('请设置三个 0–360° 范围内的自定义角度。');
}
/** Oriedita custom angles are A,B,C,360-A,360-B,360-C, not cumulative angles. */
export function angleOffsets(system:AngleSystem,includeBaseline=false):number[]{
  validate(system);
  const values=system.kind==='divided'?Array.from({length:system.divider*2},(_,i)=>180*i/system.divider):[...system.angles,...system.angles.map(a=>360-a)];
  if(includeBaseline&&system.kind==='custom')values.unshift(0);
  const result:number[]=[];
  for(const value of values){const a=normalize(value);if(!result.some(b=>Math.min(Math.abs(a-b),360-Math.abs(a-b))<1e-9))result.push(a);}
  return result;
}
/** deg3 uses the SECOND point as origin and the first point as its baseline direction. */
export function angleFan(first:Point,origin:Point,system:AngleSystem,eps=1e-6):{origin:Point;direction:Point;end:Point;angle:number}[]{
  validPoint(first);validPoint(origin);const length=distance(first,origin);
  if(length<=eps)throw new Error('两个角度基准点不能重合。');
  const base=Math.atan2(first[1]-origin[1],first[0]-origin[0])*180/Math.PI;
  return angleOffsets(system,true).map(angle=>{
    const direction=unit(base+angle),end:Point=[origin[0]+length*direction[0],origin[1]+length*direction[1]];
    validPoint(end);return{origin:[...origin],direction,end,angle};
  });
}
export function angleRayCutoff(origin:Point,direction:Point,target:Segment,eps=1e-6):Point{
  validPoint(origin);validPoint(target.a);validPoint(target.b);
  const hit=lineTarget(origin,direction,target,eps),length=Math.hypot(...direction);
  if(((hit[0]-origin[0])*direction[0]+(hit[1]-origin[1])*direction[1])/length<=eps)throw new Error('请选择候选方向前方的实际截止线，不能生成反向或零长线段。');
  return hit;
}
function segmentDistance(p:Point,s:Segment):number{
  const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],den=dx*dx+dy*dy;
  if(den===0)return Infinity;
  const t=Math.max(0,Math.min(1,((p[0]-s.a[0])*dx+(p[1]-s.a[1])*dy)/den));
  return distance(p,[s.a[0]+dx*t,s.a[1]+dy*t]);
}
export interface AngleSnapOptions {radius?:number;segments?:Segment[];vertices?:Point[];eps?:number}
/** Project onto an active angle; optional finite-line snap precedes same-direction vertex snap. */
export function snapAnglePoint(origin:Point,pointer:Point,system:AngleSystem,options:AngleSnapOptions={}):Point{
  validPoint(origin);validPoint(pointer);validate(system);
  const {radius=0,eps=1e-6}=options;
  if(!Number.isFinite(radius)||radius<0)throw new Error('角度吸附半径无效。');
  if(distance(origin,pointer)<=eps)return[...origin];
  const raw=normalize(Math.atan2(pointer[1]-origin[1],pointer[0]-origin[0])*180/Math.PI);
  let angle:number;
  if(system.kind==='divided'){
    const step=180/system.divider;angle=Math.floor(raw/step+0.5)*step;
  }else{
    const offsets=angleOffsets(system);angle=offsets[0];let best=Infinity;
    for(const a of offsets){const d=Math.min(normalize(a-raw),normalize(raw-a));if(d<best){best=d;angle=a;}}
  }
  return snapAnglePointOnDirection(origin,pointer,angle,options);
}

/** Shared projection onto one already selected ray. This leaves each caller's
 * direction-selection semantics independent from finite edge/vertex snapping. */
export function snapAnglePointOnDirection(origin:Point,pointer:Point,angleDegrees:number,options:AngleSnapOptions={}):Point{
  validPoint(origin);validPoint(pointer);
  const {radius=0,segments=[],vertices=[],eps=1e-6}=options;
  if(!Number.isFinite(radius)||radius<0)throw new Error('角度吸附半径无效。');
  if(!Number.isFinite(angleDegrees))throw new Error('角度构造方向无效。');
  if(distance(origin,pointer)<=eps)return[...origin];
  const direction=unit(angleDegrees),delta:Point=[pointer[0]-origin[0],pointer[1]-origin[1]],projection=delta[0]*direction[0]+delta[1]*direction[1];
  let result:Point=[origin[0]+projection*direction[0],origin[1]+projection*direction[1]];
  const projected:Point=[...result];
  let edge:Point|undefined,best=Infinity;
  for(const s of segments){
    validPoint(s.a);validPoint(s.b);
    if(segmentDistance(pointer,s)>radius)continue;
    // A nearby almost-parallel segment may meet the constrained ray far away.
    // Compare the actual intersection to the projected endpoint, not just the
    // pointer's distance to the reference. Other valid nearby edges still count.
    try{
      const hit=lineTarget(origin,direction,s,eps),d=distance(projected,hit);
      if(d<=radius&&(hit[0]-origin[0])*delta[0]+(hit[1]-origin[1])*delta[1]>0&&
          (d<best||d===best&&edge&&(hit[0]<edge[0]||hit[0]===edge[0]&&hit[1]<edge[1]))){edge=hit;best=d;}
    }catch{/* Parallel and out-of-segment targets cannot attract the endpoint. */}
  }
  if(edge)result=edge;
  validPoint(result);
  let vertex:Point|undefined;best=Infinity;
  for(const p of vertices){
    validPoint(p);const d=distance(projected,p),a:Point=[p[0]-origin[0],p[1]-origin[1]];
    if(a[0]*direction[0]+a[1]*direction[1]<=0||Math.abs(a[0]*direction[1]-a[1]*direction[0])>Math.max(eps,Math.hypot(...a)*radians(1e-5)))continue;
    if(d<=radius&&(d<best||d===best&&vertex&&(p[0]<vertex[0]||p[0]===vertex[0]&&p[1]<vertex[1]))){best=d;vertex=p;}
  }
  if(vertex&&best<=radius){
    const a:Point=[result[0]-origin[0],result[1]-origin[1]],b:Point=[vertex[0]-origin[0],vertex[1]-origin[1]];
    const dot=a[0]*b[0]+a[1]*b[1],cross=a[0]*b[1]-a[1]*b[0];
    if(dot>0&&Math.abs(Math.atan2(cross,dot))<=radians(1e-5))result=[...vertex];
  }
  return result;
}
