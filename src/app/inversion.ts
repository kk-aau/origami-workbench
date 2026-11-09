import type {Point,Segment} from '../core/types';
import {distance} from '../core/geometry';
import {circleGeometry,type CircleGeometry} from './circleTools';

export type InversionResult = {kind:'circle';circle:CircleGeometry}|{kind:'line';origin:Point;direction:Point}|{kind:'unchanged'};
const tolerance=(...values:number[])=>64*Number.EPSILON*Math.max(1,...values.map(Math.abs));
const validPoint=(p:Point)=>p.length===2&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6);
function checkCircle(c:CircleGeometry){circleGeometry(c.center,c.radius);}

/** Signed radius difference: the third picked circle minus the second. */
export function radiusDifferenceCircle(a:CircleGeometry,b:CircleGeometry,c:CircleGeometry):CircleGeometry {
  [a,b,c].forEach(checkCircle);const delta=c.radius-b.radius;
  if(Math.abs(delta)<=tolerance(b.radius,c.radius))throw new Error('后两圆半径相同，结果与原圆重合，请重选第三个圆。');
  if(a.radius+delta<1e-6)throw new Error('相减后半径不为正，请重选第三个圆或交换后两圆次序。');
  return circleGeometry(a.center,a.radius+delta);
}

/** Inverts the complete circumference, not a sampled polyline. */
export function invertCircle(source:CircleGeometry,basis:CircleGeometry):InversionResult {
  checkCircle(source);checkCircle(basis);
  const v:Point=[source.center[0]-basis.center[0],source.center[1]-basis.center[1]],d=Math.hypot(...v),power=basis.radius*basis.radius;
  if(Math.abs(d-source.radius)<=tolerance(d,source.radius)){
    const n:Point=[v[0]/d,v[1]/d],offset=power/(2*d);
    const origin:Point=[basis.center[0]+n[0]*offset,basis.center[1]+n[1]*offset];
    if(!origin.every(Number.isFinite))throw new Error('反演直线超出数值范围。');
    return{kind:'line',origin,direction:[-n[1],n[0]]};
  }
  const factor=power/((d-source.radius)*(d+source.radius));
  return{kind:'circle',circle:circleGeometry([basis.center[0]+factor*v[0],basis.center[1]+factor*v[1]],Math.abs(factor)*source.radius)};
}

/** Uses the source segment's supporting infinite line, not a finite-arc image. */
export function invertSupportingLine(source:Pick<Segment,'a'|'b'>,basis:CircleGeometry):InversionResult {
  checkCircle(basis);if(!validPoint(source.a)||!validPoint(source.b))throw new Error('参考线坐标无效。');
  const v:Point=[source.b[0]-source.a[0],source.b[1]-source.a[1]],length=Math.hypot(...v);
  if(length<1e-6)throw new Error('参考线太短，无法确定支撑直线。');
  const n:Point=[-v[1]/length,v[0]/length],delta:Point=[source.a[0]-basis.center[0],source.a[1]-basis.center[1]],h=n[0]*delta[0]+n[1]*delta[1];
  if(Math.abs(h)<=tolerance(...source.a,...source.b,...basis.center))return{kind:'unchanged'};
  const offset=basis.radius*basis.radius/(2*h);
  return{kind:'circle',circle:circleGeometry([basis.center[0]+n[0]*offset,basis.center[1]+n[1]*offset],Math.abs(offset))};
}

export function sameCircle(a:CircleGeometry,b:CircleGeometry):boolean {
  return distance(a.center,b.center)<=tolerance(...a.center,...b.center)&&Math.abs(a.radius-b.radius)<=tolerance(a.radius,b.radius);
}
