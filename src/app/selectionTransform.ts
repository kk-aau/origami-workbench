import {appendCircle,circleGeometry,type CircleObject} from './circleTools';
import {distance,epsilonFor} from '../core/geometry';
import {validateDoc,type Doc,type Point,type Segment} from '../core/types';
import {uncoveredCopies} from './mirror';
import {overlayDrawnSegmentsWithIds} from './drawOverlay';
import {swapGeneratedLines} from './drawingSwap';

export type SelectionTransform =
  | {kind:'translate';from:Point;to:Point}
  | {kind:'similarity';a:Point;b:Point;c:Point;d:Point};

/** Closest point on the selected segments, including their interiors. A pivot
 * on a source uses the closest distinct endpoint so an orbit still exists. */
export function rotationCopyReference(segments:readonly Segment[],center:Point,eps=1e-6):Point {
  checkPoint(center);let closest:Point|null=null,best=Infinity;
  for(const s of segments){
    const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],length2=dx*dx+dy*dy;
    if(length2<=eps*eps)continue;
    const t=Math.max(0,Math.min(1,((center[0]-s.a[0])*dx+(center[1]-s.a[1])*dy)/length2));
    const point:Point=[s.a[0]+t*dx,s.a[1]+t*dy],d=distance(center,point);
    if(d<best){best=d;closest=point;}
  }
  if(best<=eps){closest=null;best=Infinity;for(const s of segments)for(const point of [s.a,s.b]){const d=distance(center,point);if(d>eps&&d<best){closest=[...point];best=d;}}}
  if(!closest)throw new Error('选区没有可用的旋转参考点。');
  return closest;
}

/** Project the cursor onto the orbit; its distance never scales the copies. */
export function rotationCopyOrbit(center:Point,reference:Point,cursor:Point,eps=1e-6):{transform:SelectionTransform;target:Point;radius:number} {
  [center,reference,cursor].forEach(checkPoint);
  const radius=distance(center,reference),d=distance(center,cursor);
  if(radius<=eps)throw new Error('旋转参考点不能与中心重合。');
  if(d<=eps)throw new Error('请将鼠标移离旋转中心，再点击落位。');
  const target:Point=[center[0]+(cursor[0]-center[0])*radius/d,center[1]+(cursor[1]-center[1])*radius/d];
  return {radius,target,transform:{kind:'similarity',a:[...center],b:[...reference],c:[...center],d:target}};
}

export function rotationSelectionTransform(center:Point,degrees:number):SelectionTransform {
  checkPoint(center);if(!Number.isFinite(degrees))throw new Error('旋转角度必须为有限数值。');
  const radians=(degrees%360)*Math.PI/180;
  return {kind:'similarity',a:[...center],b:[center[0]+1,center[1]],c:[...center],d:[center[0]+Math.cos(radians),center[1]+Math.sin(radians)]};
}

function checkPoint(p:Point){
  if(!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))throw new Error('变换坐标超出范围（±1000000 mm）。');
}

/** Orientation-preserving similarity: A maps to C and B maps to D. */
export function transformPoint(point:Point,transform:SelectionTransform,eps=1e-6):Point{
  checkPoint(point);
  let result:Point;
  if(transform.kind==='translate'){
    const {from,to}=transform;[from,to].forEach(checkPoint);
    result=[point[0]+to[0]-from[0],point[1]+to[1]-from[1]];
  }else{
    const {a,b,c,d}=transform;[a,b,c,d].forEach(checkPoint);
    if(distance(a,b)<=eps||distance(c,d)<=eps)throw new Error('四点定位的起始两点及目标两点分别不能重合或过近。');
    const ux=b[0]-a[0],uy=b[1]-a[1],vx=d[0]-c[0],vy=d[1]-c[1],den=ux*ux+uy*uy;
    const real=(ux*vx+uy*vy)/den,imag=(ux*vy-uy*vx)/den,x=point[0]-a[0],y=point[1]-a[1];
    result=[c[0]+real*x-imag*y,c[1]+imag*x+real*y];
  }
  checkPoint(result);return result;
}

/** Pure preview. Keeps assignment and explicit zero/null fold angles unchanged. */
export function previewSelectionTransform(doc:Doc,ids:readonly string[],transform:SelectionTransform,lockBoundary=false):Segment[]{
  validateDoc(doc);const unique=new Set(ids),eps=epsilonFor(doc);
  if(!unique.size)throw new Error('请先选择需要变换的线段。');
  const sources=doc.segments.filter(s=>unique.has(s.id));
  if(sources.length!==unique.size)throw new Error('选中线段已变化，请重新选择。');
  if(lockBoundary&&sources.some(s=>s.assignment==='B'))throw new Error('边界保护已开启，请取消保护后再变换纸边。');
  return sources.map(s=>{
    if(distance(s.a,s.b)<=eps)throw new Error('选区含零长或过短线段，请先整理。');
    const result={...s,a:transformPoint(s.a,transform,eps),b:transformPoint(s.b,transform,eps)};
    if(distance(result.a,result.b)<=eps)throw new Error('变换结果线段过短，请增大目标两点的间距。');
    return result;
  });
}

/** Atomic document proposal; caller commits through normal splitting/history pipeline. */
export function applySelectionTransform(doc:Doc,ids:readonly string[],transform:SelectionTransform,copy:boolean,lockBoundary=false,swapGenerated=false):Doc{
  return applySelectionTransformWithIds(doc,ids,transform,copy,lockBoundary,swapGenerated).doc;
}

/** The inserted identity set excludes unselected creases split by the transform. */
export function applySelectionTransformWithIds(doc:Doc,ids:readonly string[],transform:SelectionTransform,copy:boolean,lockBoundary=false,swapGenerated=false):{doc:Doc;drawnIds:string[]}{
  const candidates=swapGeneratedLines(previewSelectionTransform(doc,ids,transform,lockBoundary),copy&&swapGenerated),unique=new Set(ids),eps=epsilonFor(doc);
  if(candidates.every(s=>{const source=doc.segments.find(v=>v.id===s.id)!;return distance(s.a,source.a)<=eps&&distance(s.b,source.b)<=eps;}))throw new Error('变换前后位置相同，无需重复操作。');
  const base=copy?doc:{...doc,segments:doc.segments.filter(s=>!unique.has(s.id))};
  // Validate against the complete remaining drawing before publishing any removals.
  const additions=uncoveredCopies(base,candidates,copy?'copy':'move',copy?'复制':'移动',!copy);
  return overlayDrawnSegmentsWithIds(base,additions,lockBoundary);
}

export function previewCircleTransform(doc:Doc,ids:readonly string[],transform:SelectionTransform):CircleObject[]{
 const wanted=new Set(ids),sources=(doc.objects??[]).filter((o):o is CircleObject=>o.kind==='circle'&&wanted.has(o.id));
 if(sources.length!==wanted.size)throw new Error('选中的圆已变化，请重新选择。');
 return sources.map(o=>{const center=transformPoint(o.center,transform),edge=transformPoint([o.center[0]+o.radius,o.center[1]],transform);return {...o,...circleGeometry(center,distance(center,edge))};});
}
export function applyDrawingSelectionTransform(doc:Doc,ids:readonly string[],circleIds:readonly string[],transform:SelectionTransform,copy:boolean,lockBoundary=false,swapGenerated=false):{doc:Doc;drawnIds:string[]}{
 if(!ids.length&&!circleIds.length)throw new Error('请先选择线段或辅助圆。');
 const circles=previewCircleTransform(doc,circleIds,transform);
 const result=ids.length?applySelectionTransformWithIds(doc,ids,transform,copy,lockBoundary,swapGenerated):{doc,drawnIds:[]};
 if(copy)for(const circle of circles)result.doc=appendCircle(result.doc,circle,circle.color);
 else {const byId=new Map(circles.map(c=>[c.id,c]));result.doc={...result.doc,objects:result.doc.objects?.map(o=>byId.get(o.id)??o)};}
 validateDoc(result.doc);return result;
}
export function drawingRotationReference(doc:Doc,ids:ReadonlySet<string>,circleIds:ReadonlySet<string>,center:Point):Point{
 const points:Point[]=[];
 const segments=doc.segments.filter(s=>ids.has(s.id));
 if(segments.length)points.push(rotationCopyReference(segments,center,epsilonFor(doc)));
 for(const o of doc.objects??[])if(o.kind==='circle'&&circleIds.has(o.id)){
  const d=distance(center,o.center),direction:Point=d>1e-6?[(center[0]-o.center[0])/d,(center[1]-o.center[1])/d]:[1,0];
  let point:Point=[o.center[0]+direction[0]*o.radius,o.center[1]+direction[1]*o.radius];
  if(distance(point,center)<=epsilonFor(doc))point=[o.center[0]-direction[0]*o.radius,o.center[1]-direction[1]*o.radius];
  points.push(point);
 }
 points.sort((a,b)=>distance(a,center)-distance(b,center));if(!points.length)throw new Error('请先选择线段或辅助圆。');return points[0];
}
