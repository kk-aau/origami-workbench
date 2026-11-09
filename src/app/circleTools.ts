import type { Doc, DrawingObject, Point } from '../core/types';
import { validateDoc } from '../core/types';
import { distance } from '../core/geometry';
import type { SnapPoint } from './snapPoints';
import {eraseBoxMode} from './erase';

export type CircleObject = Extract<DrawingObject, {kind:'circle'}>;
export type CircleGeometry = Pick<CircleObject,'center'|'radius'>;
export const CIRCLE_COLOR = '#367d86';

export function circleGeometry(center:Point,radius:number):CircleGeometry {
  if(!center.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6)||!Number.isFinite(radius)||radius<1e-6||radius>1e6)
    throw new Error('圆心坐标须在 ±1000000 mm 内，半径须为 0.000001–1000000 mm。');
  return {center:[...center],radius};
}
export function circleThroughThree(a:Point,b:Point,c:Point):CircleGeometry {
  if([a,b,c].some(p=>!p.every(Number.isFinite)))throw new Error('请选择有效坐标。');
  const u:Point=[b[0]-a[0],b[1]-a[1]],v:Point=[c[0]-a[0],c[1]-a[1]];
  const lu=Math.hypot(...u),lv=Math.hypot(...v),cross=u[0]*v[1]-u[1]*v[0];
  if(Math.min(lu,lv,distance(b,c))<1e-6)throw new Error('三点不能重合，请另选一个点。');
  if(Math.abs(cross)<=1e-8*lu*lv)throw new Error('三点共线或过于接近共线，请另选第三点。');
  const x=(lu*lu*v[1]-lv*lv*u[1])/(2*cross),y=(u[0]*lv*lv-v[0]*lu*lu)/(2*cross);
  return circleGeometry([a[0]+x,a[1]+y],Math.hypot(x,y));
}
export function appendCircle(doc:Doc,geometry:CircleGeometry,color=CIRCLE_COLOR):Doc {
  const used=new Set([...doc.segments,...doc.objects??[]].map(o=>o.id));
  let id='circle',n=1;while(used.has(id))id=`circle:${++n}`;
  const next={...doc,objects:[...doc.objects??[],{kind:'circle' as const,id,color,...circleGeometry(geometry.center,geometry.radius)}]};
  validateDoc(next);return next;
}
export function updateCircle(doc:Doc,id:string,patch:Partial<CircleGeometry&{color:string}>):Doc {
  const circle=doc.objects?.find(o=>o.id===id&&o.kind==='circle');
  if(!circle||circle.kind!=='circle')throw new Error('该圆已不存在，请重新选择。');
  const updated={...circle,...patch};circleGeometry(updated.center,updated.radius);
  const next={...doc,objects:doc.objects!.map(o=>o.id===id?updated:o)};validateDoc(next);return next;
}
/** Prefer circumference hits, then centers; stable order resolves concentric ties. */
export function pickCircle(objects:DrawingObject[],point:Point,tolerance:number):CircleObject|undefined {
  const circles=objects.filter((o):o is CircleObject=>o.kind==='circle');
  const nearest=(center:boolean)=>circles.map(o=>({o,d:center?distance(o.center,point):Math.abs(distance(o.center,point)-o.radius)}))
    .filter(h=>h.d<=tolerance).sort((a,b)=>a.d-b.d||a.o.id.localeCompare(b.o.id))[0]?.o;
  return nearest(false)??nearest(true);
}

const finitePoint=(point:Point):boolean=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite);
const validCircle=(circle:CircleGeometry):boolean=>finitePoint(circle.center)&&circle.center.every(value=>Math.abs(value)<=1e6)&&Number.isFinite(circle.radius)&&circle.radius>=1e-6&&circle.radius<=1e6;

/** General selection/erasing measures the painted circumference, never the
 * center fallback used by construction references and circle editing. */
export function circleCircumferenceDistance(circle:CircleGeometry,point:Point):number {
  return finitePoint(point)&&validCircle(circle)?Math.abs(distance(circle.center,point)-circle.radius):Infinity;
}
export function pickCircleCircumference(objects:readonly DrawingObject[],point:Point,tolerance:number,auxiliaryVisible=true):CircleObject|undefined {
  if(!auxiliaryVisible||!finitePoint(point)||!Number.isFinite(tolerance)||tolerance<0)return undefined;
  let closest:CircleObject|undefined,closestDistance=tolerance;
  for(const object of objects){
    if(object.kind!=='circle')continue;
    const value=circleCircumferenceDistance(object,point);
    if(!Number.isFinite(value)||value>closestDistance)continue;
    if(value===closestDistance&&closest&&object.id>=closest.id)continue;
    closest=object;closestDistance=value;
  }
  return closest;
}

/** A crossing rectangle hits a circle iff its continuous distance range from
 * the center reaches the radius. A rectangle entirely inside the disk has no
 * circumference contact and must not select/delete the surrounding circle. */
export function circleIdsInBox(objects:readonly DrawingObject[],a:Point,b:Point,mode:'contained'|'touching'=eraseBoxMode(a,b),auxiliaryVisible=true):Set<string> {
  const ids=new Set<string>();
  if(!auxiliaryVisible||!finitePoint(a)||!finitePoint(b)||(mode!=='contained'&&mode!=='touching'))return ids;
  const minX=Math.min(a[0],b[0]),maxX=Math.max(a[0],b[0]),minY=Math.min(a[1],b[1]),maxY=Math.max(a[1],b[1]);
  for(const object of objects){
    if(object.kind!=='circle'||!validCircle(object))continue;
    const [x,y]=object.center,r=object.radius;
    const epsilon=Number.EPSILON*16*Math.max(1,Math.abs(x),Math.abs(y),Math.abs(minX),Math.abs(maxX),Math.abs(minY),Math.abs(maxY),r);
    if(mode==='contained'){
      if(x-r>=minX-epsilon&&x+r<=maxX+epsilon&&y-r>=minY-epsilon&&y+r<=maxY+epsilon)ids.add(object.id);
      continue;
    }
    const nearestX=Math.max(minX,Math.min(maxX,x)),nearestY=Math.max(minY,Math.min(maxY,y));
    const nearest=Math.hypot(x-nearestX,y-nearestY);
    const farthest=Math.hypot(Math.max(Math.abs(x-minX),Math.abs(x-maxX)),Math.max(Math.abs(y-minY),Math.abs(y-maxY)));
    if(nearest<=r+epsilon&&farthest>=r-epsilon)ids.add(object.id);
  }
  return ids;
}
/** Circle anchors never become crease vertices or enter the folding graph. */
export function circleSnapPoints(objects:DrawingObject[]):SnapPoint[] {
  return objects.flatMap(o=>o.kind!=='circle'?[]:([
    o.center,[o.center[0]+o.radius,o.center[1]],[o.center[0],o.center[1]+o.radius],
    [o.center[0]-o.radius,o.center[1]],[o.center[0],o.center[1]-o.radius],
  ] as Point[]).filter(p=>p.every(n=>Math.abs(n)<=1e6)).map((point,i)=>({id:`circle-anchor:${o.id}:${i}`,point:[...point] as Point,segmentIds:[],kind:'circle' as const})));
}
