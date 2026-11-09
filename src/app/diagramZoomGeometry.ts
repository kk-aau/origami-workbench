import type {Point} from '../core/types';

export interface DiagramZoomBounds {x:number;y:number;width:number;height:number}
export interface DiagramZoomCircleRegion {kind:'circle';center:Point;radius:number}
/** The sampled wave is both the visible divider and the actual clipping edge.
 * Its endpoints lie on the rectangle; all other points remain strictly inside.
 * Left means the positive cross-product side of the directed wave. */
export interface DiagramZoomWaveRegion {kind:'wave';points:Point[];side:'left'|'right';bounds:DiagramZoomBounds}
export type DiagramZoomRegion=DiagramZoomCircleRegion|DiagramZoomWaveRegion;
export const DIAGRAM_ZOOM_MAX_WAVE_POINTS=256;
const coordinateLimit=1_000_000;
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const point=(value:unknown):value is Point=>Array.isArray(value)&&value.length===2&&value.every(n=>finite(n)&&Math.abs(n)<=coordinateLimit);
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const copy=(p:Point):Point=>[p[0],p[1]];
const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const tolerance=(bounds:DiagramZoomBounds)=>Math.max(1e-8,Math.max(bounds.width,bounds.height)*1e-9);
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));

export function validateDiagramZoomBounds(value:unknown):asserts value is DiagramZoomBounds {
  if(!record(value)||Object.keys(value).some(k=>!['x','y','width','height'].includes(k))||
    !finite(value.x)||!finite(value.y)||!finite(value.width)||!finite(value.height)||value.width<=1e-6||value.height<=1e-6||
    [value.x,value.y,value.x+value.width,value.y+value.height].some(n=>Math.abs(n)>coordinateLimit))throw new Error('放大选区的展示范围无效。');
}
const validateBounds:(value:unknown)=>asserts value is DiagramZoomBounds=validateDiagramZoomBounds;
function inBounds(p:Point,b:DiagramZoomBounds,eps=0){return p[0]>=b.x-eps&&p[0]<=b.x+b.width+eps&&p[1]>=b.y-eps&&p[1]<=b.y+b.height+eps;}
function segmentDistance(p:Point,a:Point,b:Point){
  const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
  const t=length?clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length,0,1):0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function onSegment(p:Point,a:Point,b:Point,eps:number){return segmentDistance(p,a,b)<=eps;}
function intersects(a:Point,b:Point,c:Point,d:Point,eps:number){
  if(onSegment(a,c,d,eps)||onSegment(b,c,d,eps)||onSegment(c,a,b,eps)||onSegment(d,a,b,eps))return true;
  const ab=distance(a,b),cd=distance(c,d),ca=cross(a,b,c),da=cross(a,b,d),ac=cross(c,d,a),bc=cross(c,d,b);
  return (ca>eps*ab&&da< -eps*ab||ca< -eps*ab&&da>eps*ab)&&(ac>eps*cd&&bc< -eps*cd||ac< -eps*cd&&bc>eps*cd);
}
function area(points:readonly Point[]){
  // Translate before summing to retain accuracy for small selections far from 0.
  const origin=points[0];let result=0;
  for(let i=1;i+1<points.length;i++)result+=cross(origin,points[i],points[i+1]);
  return result/2;
}
/** Clockwise on screen (positive signed area in the SVG coordinate system). */
function boundaryPosition(p:Point,b:DiagramZoomBounds,eps:number):number|null {
  if(!inBounds(p,b,eps))return null;
  const x=clamp(p[0]-b.x,0,b.width),y=clamp(p[1]-b.y,0,b.height);
  if(y<=eps)return x;
  if(b.width-x<=eps)return b.width+y;
  if(b.height-y<=eps)return 2*b.width+b.height-x;
  if(x<=eps)return 2*(b.width+b.height)-y;
  return null;
}
function perimeterPoint(t:number,b:DiagramZoomBounds):Point {
  const perimeter=2*(b.width+b.height);t=((t%perimeter)+perimeter)%perimeter;
  if(t<=b.width)return [b.x+t,b.y];
  t-=b.width;if(t<=b.height)return [b.x+b.width,b.y+t];
  t-=b.height;if(t<=b.width)return [b.x+b.width-t,b.y+b.height];
  return [b.x,b.y+b.height-(t-b.width)];
}
function boundaryRoute(from:Point,to:Point,b:DiagramZoomBounds,clockwise:boolean):Point[] {
  const eps=tolerance(b),perimeter=2*(b.width+b.height),start=boundaryPosition(from,b,eps)!,end=boundaryPosition(to,b,eps)!;
  const span=clockwise?(end-start+perimeter)%perimeter:(start-end+perimeter)%perimeter;
  const corners=[0,b.width,b.width+b.height,2*b.width+b.height];
  return corners.map(t=>({t,offset:clockwise?(t-start+perimeter)%perimeter:(start-t+perimeter)%perimeter}))
    .filter(c=>c.offset>eps&&c.offset<span-eps).sort((a,c)=>a.offset-c.offset).map(c=>perimeterPoint(c.t,b));
}
function wavePolygonUnchecked(points:readonly Point[],bounds:DiagramZoomBounds,side:'left'|'right'):Point[] {
  const eps=tolerance(bounds),first=perimeterPoint(boundaryPosition(points[0],bounds,eps)!,bounds),last=perimeterPoint(boundaryPosition(points[points.length-1],bounds,eps)!,bounds);
  return [first,...points.slice(1,-1).map(copy),last,...boundaryRoute(last,first,bounds,side==='left')];
}
function validateWave(points:unknown,bounds:DiagramZoomBounds):asserts points is Point[] {
  if(!Array.isArray(points)||points.length<2||points.length>DIAGRAM_ZOOM_MAX_WAVE_POINTS||!points.every(point))throw new Error('波浪线放大选区需要 2 到 256 个有效点。');
  const eps=tolerance(bounds),first=points[0],last=points[points.length-1];
  if(boundaryPosition(first,bounds,eps)===null||boundaryPosition(last,bounds,eps)===null||distance(first,last)<=eps)throw new Error('波浪线需要从展示范围的一侧边界连接到另一处边界。');
  if(points.slice(1,-1).some(p=>!inBounds(p,bounds)||boundaryPosition(p,bounds,eps)!==null))throw new Error('波浪线的中间部分必须位于展示范围内部。');
  for(let i=0;i+1<points.length;i++){
    if(distance(points[i],points[i+1])<=eps)throw new Error('波浪线不能包含重复点。');
    if(i>0&&onSegment(points[i+1],points[i-1],points[i],eps)||i>0&&onSegment(points[i-1],points[i],points[i+1],eps))throw new Error('波浪线不能折返重叠。');
    for(let j=i+2;j+1<points.length;j++)if(intersects(points[i],points[i+1],points[j],points[j+1],eps))throw new Error('波浪线不能自交或接触自身。');
  }
  const left=wavePolygonUnchecked(points,bounds,'left'),right=wavePolygonUnchecked(points,bounds,'right'),minimum=Math.max(eps*eps,bounds.width*bounds.height*1e-12);
  if(area(left)<=minimum||area(right)>= -minimum)throw new Error('波浪线没有将展示范围分成两个可选择的区域。');
}

/** Strict persisted-input validation: rejects extra fields and invalid topology. */
export function validateDiagramZoomRegion(value:unknown):asserts value is DiagramZoomRegion {
  if(!record(value))throw new Error('放大选区无效。');
  if(value.kind==='circle'){
    if(Object.keys(value).some(k=>!['kind','center','radius'].includes(k))||!point(value.center)||!finite(value.radius)||value.radius<=1e-6||value.radius>coordinateLimit||
      value.center.some(n=>Math.abs(n)+(value.radius as number)>coordinateLimit))throw new Error('圆形放大选区的位置或半径无效。');
    return;
  }
  if(value.kind!=='wave'||Object.keys(value).some(k=>!['kind','points','side','bounds'].includes(k))||value.side!=='left'&&value.side!=='right')throw new Error('放大选区类型或选择侧无效。');
  validateBounds(value.bounds);validateWave(value.points,value.bounds);
}

export function diagramZoomRegionPolygon(region:DiagramZoomWaveRegion):Point[] {
  validateDiagramZoomRegion(region);return wavePolygonUnchecked(region.points,region.bounds,region.side);
}
export function diagramZoomRegionBounds(region:DiagramZoomRegion):DiagramZoomBounds {
  validateDiagramZoomRegion(region);
  if(region.kind==='circle')return {x:region.center[0]-region.radius,y:region.center[1]-region.radius,width:2*region.radius,height:2*region.radius};
  const points=wavePolygonUnchecked(region.points,region.bounds,region.side),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys);
  return {x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y};
}
export function diagramZoomRegionPath(region:DiagramZoomRegion):string {
  validateDiagramZoomRegion(region);
  if(region.kind==='circle'){
    const [x,y]=region.center,r=region.radius;
    return `M ${x-r} ${y} A ${r} ${r} 0 1 0 ${x+r} ${y} A ${r} ${r} 0 1 0 ${x-r} ${y} Z`;
  }
  return wavePolygonUnchecked(region.points,region.bounds,region.side).map((p,i)=>`${i?'L':'M'} ${p[0]} ${p[1]}`).join(' ')+' Z';
}
function polygonContains(points:readonly Point[],p:Point,eps:number){
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[j],b=points[i];if(onSegment(p,a,b,eps))return true;
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
export function diagramZoomRegionContains(region:DiagramZoomRegion,p:Point):boolean {
  return prepareDiagramZoomRegionContains(region)(p);
}
/** Validate once for pointer hover / snapping loops. Captured values own their
 * coordinates, so later project edits cannot silently change this predicate. */
export function prepareDiagramZoomRegionContains(region:DiagramZoomRegion):(p:Point)=>boolean {
  validateDiagramZoomRegion(region);
  if(region.kind==='circle'){
    const center=copy(region.center),radius=region.radius,eps=Math.max(1e-8,radius*1e-9);
    return p=>point(p)&&distance(center,p)<=radius+eps;
  }
  const polygon=wavePolygonUnchecked(region.points,region.bounds,region.side),eps=tolerance(region.bounds);
  return p=>point(p)&&polygonContains(polygon,p,eps);
}
export interface DiagramZoomVisibleSegment {a:Point;b:Point}
/** Clip selection / eraser candidates to the same visible boundary as artwork.
 * Prepare once per region; each query only intersects one line with its edge. */
export function prepareDiagramZoomVisibleSegments(region:DiagramZoomRegion):(a:Point,b:Point)=>DiagramZoomVisibleSegment[] {
  validateDiagramZoomRegion(region);
  const circle=region.kind==='circle'?{center:copy(region.center),radius:region.radius}:null;
  const polygon=region.kind==='wave'?wavePolygonUnchecked(region.points,region.bounds,region.side):null;
  const eps=region.kind==='circle'?Math.max(1e-8,region.radius*1e-9):tolerance(region.bounds);
  const inside=(p:Point)=>circle?distance(circle.center,p)<=circle.radius+eps:polygonContains(polygon!,p,eps);
  return (a,b)=>{
    if(!point(a)||!point(b))return [];
    const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<=eps)return [];
    const parameters=[0,1],add=(t:number)=>{if(t>= -eps/length&&t<=1+eps/length)parameters.push(clamp(t,0,1));};
    if(circle){
      const ux=dx/length,uy=dy/length,cx=circle.center[0]-a[0],cy=circle.center[1]-a[1],along=cx*ux+cy*uy,perpendicular=cx*uy-cy*ux;
      const halfSquared=circle.radius*circle.radius-perpendicular*perpendicular;
      if(halfSquared>=0){const half=Math.sqrt(halfSquared);add((along-half)/length);add((along+half)/length);}
    }else for(let i=0;i<polygon!.length;i++){
      const c=polygon![i],d=polygon![(i+1)%polygon!.length],ex=d[0]-c[0],ey=d[1]-c[1],edgeLength=Math.hypot(ex,ey),denominator=dx*ey-dy*ex;
      const ox=c[0]-a[0],oy=c[1]-a[1];
      if(Math.abs(denominator)<=eps*Math.max(length,edgeLength)){
        if(Math.abs(ox*dy-oy*dx)<=eps*length){add((ox*dx+oy*dy)/(length*length));add(((d[0]-a[0])*dx+(d[1]-a[1])*dy)/(length*length));}
      }else{
        const t=(ox*ey-oy*ex)/denominator,u=(ox*dy-oy*dx)/denominator;
        if(u>= -eps/edgeLength&&u<=1+eps/edgeLength)add(t);
      }
    }
    const sorted=parameters.sort((x,y)=>x-y).filter((t,i,all)=>i===0||(t-all[i-1])*length>eps),result:DiagramZoomVisibleSegment[]=[];
    const at=(t:number):Point=>t===0?copy(a):t===1?copy(b):[a[0]+dx*t,a[1]+dy*t];
    for(let i=1;i<sorted.length;i++){
      const from=sorted[i-1],to=sorted[i];if((to-from)*length<=eps||!inside(at((from+to)/2)))continue;
      const start=at(from),end=at(to),previous=result.at(-1);
      if(previous&&distance(previous.b,start)<=eps)previous.b=end;else result.push({a:start,b:end});
    }
    return result;
  };
}
export function diagramZoomVisibleSegments(region:DiagramZoomRegion,a:Point,b:Point):DiagramZoomVisibleSegment[] {
  return prepareDiagramZoomVisibleSegments(region)(a,b);
}
/** A click on the divider or outside the rectangle is deliberately ambiguous. */
export function diagramZoomWaveSideAt(points:Point[],bounds:DiagramZoomBounds,selection:Point):'left'|'right'|null {
  validateBounds(bounds);validateWave(points,bounds);
  const eps=tolerance(bounds);if(!point(selection)||!inBounds(selection,bounds,eps))return null;
  if(points.some((p,i)=>i>0&&onSegment(selection,points[i-1],p,eps)))return null;
  const left=polygonContains(wavePolygonUnchecked(points,bounds,'left'),selection,eps),right=polygonContains(wavePolygonUnchecked(points,bounds,'right'),selection,eps);
  return left===right?null:left?'left':'right';
}
export function createDiagramZoomWaveRegion(points:Point[],bounds:DiagramZoomBounds,selection:Point):DiagramZoomWaveRegion {
  const side=diagramZoomWaveSideAt(points,bounds,selection);
  if(!side)throw new Error('请点击波浪线分割出的一侧区域，避开分界线。');
  return {kind:'wave',points:points.map(copy),bounds:{...bounds},side};
}

/** Extend a two-point gesture across the displayed rectangle. The deterministic
 * sampled sine contour is also used for clipping, so the picture and selection
 * cannot disagree at the wave edge. */
export function diagramZoomWavyDivider(a:Point,b:Point,bounds:DiagramZoomBounds):Point[] {
  validateBounds(bounds);if(!point(a)||!point(b))throw new Error('波浪分界线的位置无效。');
  const eps=tolerance(bounds),dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  if(length<=eps)throw new Error('请拖动绘制波浪分界线。');
  let start=-Infinity,end=Infinity;
  for(const [origin,direction,min,max] of [[a[0],dx,bounds.x,bounds.x+bounds.width],[a[1],dy,bounds.y,bounds.y+bounds.height]]){
    if(Math.abs(direction)<=eps){if(origin<min-eps||origin>max+eps)throw new Error('波浪分界线没有穿过展示范围。');continue;}
    const lo=(min-origin)/direction,hi=(max-origin)/direction;start=Math.max(start,Math.min(lo,hi));end=Math.min(end,Math.max(lo,hi));
  }
  if(!Number.isFinite(start)||!Number.isFinite(end)||(end-start)*length<=eps)throw new Error('波浪分界线没有穿过展示范围。');
  const first:Point=[clamp(a[0]+start*dx,bounds.x,bounds.x+bounds.width),clamp(a[1]+start*dy,bounds.y,bounds.y+bounds.height)];
  const last:Point=[clamp(a[0]+end*dx,bounds.x,bounds.x+bounds.width),clamp(a[1]+end*dy,bounds.y,bounds.y+bounds.height)];
  const chord=distance(first,last),nx=-dy/length,ny=dx/length,cycles=3,segments=96;
  let amplitude=Math.min(chord*.035,Math.min(bounds.width,bounds.height)*.045);
  for(let attempt=0;attempt<14;attempt++,amplitude*=.5){
    const points=Array.from({length:segments+1},(_,i):Point=>{
      if(i===0)return copy(first);if(i===segments)return copy(last);
      const t=i/segments,offset=Math.sin(t*Math.PI*2*cycles)*Math.sin(t*Math.PI)*amplitude;
      return [first[0]+(last[0]-first[0])*t+nx*offset,first[1]+(last[1]-first[1])*t+ny*offset];
    });
    try{validateWave(points,bounds);return points;}catch(error){if(attempt===13)throw error;}
  }
  throw new Error('波浪分界线无法形成有效选区。');
}
