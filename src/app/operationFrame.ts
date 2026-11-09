import type {Point} from '../core/types';
import type {Bounds} from './paper';
import type {BackgroundView} from './backgroundAnchor';

/** Operation frames live in canvas-local CSS pixels, not in the document. */
export type OperationFrame=Bounds;
export type FrameDrag=
  |{kind:'create';anchor:Point}
  |{kind:'corner';anchor:Point}
  |{kind:'move';initial:OperationFrame;press:Point}
  |{kind:'side';initial:OperationFrame;side:'left'|'right'|'top'|'bottom'};
const LIMIT=1e7;
function checkPoint(p:Point){if(!Array.isArray(p)||p.length!==2||!p.every(n=>Number.isFinite(n)&&Math.abs(n)<=LIMIT))throw new Error('操作框坐标无效或超出范围。');}
function checkFrame(f:OperationFrame){
  if(!f||![f.x,f.y,f.width,f.height].every(Number.isFinite)||f.width<0||f.height<0)throw new Error('操作框尺寸无效。');
  checkPoint([f.x,f.y]);checkPoint([f.x+f.width,f.y+f.height]);
}
export function frameBetween(a:Point,b:Point):OperationFrame{
  checkPoint(a);checkPoint(b);return{x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),width:Math.abs(b[0]-a[0]),height:Math.abs(b[1]-a[1])};
}
export function frameCorners(frame:OperationFrame):Point[]{
  checkFrame(frame);const{x,y,width:w,height:h}=frame;return[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
}
function edgeDistance(p:Point,a:Point,b:Point){
  const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
  const t=den?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)):0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}

/** Classify using raw pointer, but use the separately snapped point for a new
 * corner. Existing corner/edge drags keep the opposite geometry fixed.
 */
export function beginFrameDrag(frame:OperationFrame|null,raw:Point,radius:number,snapped:Point=raw):FrameDrag{
  checkPoint(raw);checkPoint(snapped);
  if(!Number.isFinite(radius)||radius<0||radius>10000)throw new Error('操作框命中距离无效。');
  if(!frame)return{kind:'create',anchor:[...snapped]};
  const corners=frameCorners(frame);
  const corner=corners.map((p,i)=>({i,d:Math.hypot(p[0]-raw[0],p[1]-raw[1])})).sort((a,b)=>a.d-b.d||a.i-b.i)[0];
  if(corner.d<radius)return{kind:'corner',anchor:[...corners[(corner.i+2)%4]]};
  const sides=['top','right','bottom','left'] as const;
  const edge=corners.map((p,i)=>({i,d:edgeDistance(raw,p,corners[(i+1)%4])})).sort((a,b)=>a.d-b.d||a.i-b.i)[0];
  if(edge.d<radius)return{kind:'side',initial:{...frame},side:sides[edge.i]};
  if(raw[0]>=frame.x&&raw[0]<=frame.x+frame.width&&raw[1]>=frame.y&&raw[1]<=frame.y+frame.height)return{kind:'move',initial:{...frame},press:[...raw]};
  return{kind:'create',anchor:[...snapped]};
}
export function updateFrameDrag(drag:FrameDrag,p:Point):OperationFrame{
  checkPoint(p);
  if(drag.kind==='create'||drag.kind==='corner')return frameBetween(drag.anchor,p);
  const f=drag.initial;checkFrame(f);
  if(drag.kind==='move'){
    checkPoint(drag.press);
    const next={...f,x:f.x+p[0]-drag.press[0],y:f.y+p[1]-drag.press[1]};checkFrame(next);return next;
  }
  let left=f.x,right=f.x+f.width,top=f.y,bottom=f.y+f.height;
  if(drag.side==='left')left=p[0];else if(drag.side==='right')right=p[0];else if(drag.side==='top')top=p[1];else bottom=p[1];
  return frameBetween([left,top],[right,bottom]);
}
/** Match upstream: a screen area below one square pixel is inactive. */
export function finishFrameDrag(drag:FrameDrag,p:Point):OperationFrame|null{
  const frame=updateFrameDrag(drag,p);return frame.width*frame.height<1?null:frame;
}
/** Use CURRENT camera: a fixed screen frame bounds different world content
 * after panning. Never derive export bounds from the original drag camera.
 */
export function frameWorldBounds(frame:OperationFrame,view:BackgroundView):Bounds{
  checkFrame(frame);
  if(frame.width*frame.height<1)throw new Error('请先绘制有效操作框。');
  if(!view||![view.x,view.y,view.units].every(Number.isFinite)||view.units<=0)throw new Error('画布坐标比例无效。');
  const x=view.x+frame.x*view.units,y=view.y+frame.y*view.units,width=frame.width*view.units,height=frame.height*view.units;
  if(![x,y,x+width,y+height].every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6))throw new Error('操作框对应的作品范围超出 ±1000000 mm。');
  return{x,y,width,height};
}
