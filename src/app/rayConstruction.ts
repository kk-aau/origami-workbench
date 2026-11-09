import {cross,distance,epsilonFor,sub} from '../core/geometry';
import {validateDoc,type Assignment,type Doc,type Point,type Segment} from '../core/types';
import {overlayDrawnSegments} from './drawOverlay';
import {applyDrawingFoldAngle} from './foldAngles';
import {line} from './state';

const validPoint=(point:Point)=>Array.isArray(point)&&point.length===2&&point.every(value=>Number.isFinite(value)&&Math.abs(value)<=1e6);

/** The selected finite target bounds the ray. Never extend that target or
 * reverse the direction chosen by the first two points. */
export function rayConstructionGeometry(start:Point,through:Point,target:Pick<Segment,'a'|'b'>,epsilon=1e-6):{a:Point;b:Point}{
  if(!validPoint(start)||!validPoint(through)||!validPoint(target.a)||!validPoint(target.b)||!Number.isFinite(epsilon)||epsilon<=0)throw new Error('射线的坐标或容差无效。');
  const length=distance(start,through),targetLength=distance(target.a,target.b);
  if(length<=epsilon)throw new Error('射线起点与经过点不能重合或过近，请重新选择经过点。');
  if(targetLength<=epsilon)throw new Error('目标线段长度为零或过短，请选择另一条已有线段。');
  const direction:Point=[(through[0]-start[0])/length,(through[1]-start[1])/length];
  const targetDirection:Point=[(target.b[0]-target.a[0])/targetLength,(target.b[1]-target.a[1])/targetLength];
  const denominator=cross(direction,targetDirection),delta=sub(target.a,start);
  if(Math.abs(denominator)<=epsilon/Math.min(length,targetLength)){
    if(Math.abs(cross(delta,direction))<=epsilon)throw new Error('目标线段与射线共线，不能确定唯一交点，请选择另一条线段。');
    throw new Error('目标线段与射线平行，不能相交，请选择另一条线段。');
  }
  const forward=cross(delta,targetDirection)/denominator,along=cross(delta,direction)/denominator;
  if(along < -epsilon||along > targetLength+epsilon)throw new Error('射线只与目标的延长线相交，未命中这条有限线段，请选择另一条线段。');
  if(forward<length-epsilon)throw new Error('目标交点位于经过点后方，射线不能回退，请选择经过点前方路径上的线段。');
  // Snap accepted endpoint contact to the actual target endpoint, rather than
  // retaining a roundoff point just outside the finite segment.
  const parameter=Math.max(0,Math.min(1,along/targetLength));
  const end:Point=parameter===0?[...target.a]:parameter===1?[...target.b]:[target.a[0]+(target.b[0]-target.a[0])*parameter,target.a[1]+(target.b[1]-target.a[1])*parameter];
  if(!validPoint(end)||distance(start,end)<=epsilon)throw new Error('射线交点无效或与起点过近，请选择另一条线段。');
  return {a:[...start],b:end};
}

/** Resolve the target again at commit time; the caller publishes through its
 * ordinary document/material commit so the operation remains one undo step. */
export function appendRayConstruction(doc:Doc,start:Point,through:Point,targetId:string,assignment:Assignment,lockBoundary=false,drawingAngle?:number|null):Doc{
  validateDoc(doc);
  const target=doc.segments.find(segment=>segment.id===targetId);
  if(!target)throw new Error('射线目标线段已不存在，请重新选择已有线段。');
  const {a,b}=rayConstructionGeometry(start,through,target,epsilonFor(doc));
  return overlayDrawnSegments(doc,applyDrawingFoldAngle([line(a,b,assignment)],drawingAngle),lockBoundary);
}
