import type {BspItem,Vec3} from './bsp.js';

type Polygon=Vec3[];
type Box={minX:number;minY:number;maxX:number;maxY:number};
type Face={item:BspItem;box:Box;depth:(p:Vec3)=>number};
export interface ContactVisibilityOptions {
  /** Positive means a is nearer. Called only inside a positive-area overlap. */
  compare:(a:BspItem,b:BspItem,equalDepth:boolean)=>number;
  owners:(item:BspItem)=>readonly number[];
}
const cross=(a:Vec3,b:Vec3,p:Vec3)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const interpolate=(a:Vec3,b:Vec3,t:number):Vec3=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const bounds=(p:Polygon):Box=>({minX:Math.min(...p.map(p=>p[0])),minY:Math.min(...p.map(p=>p[1])),maxX:Math.max(...p.map(p=>p[0])),maxY:Math.max(...p.map(p=>p[1]))});
const overlap=(a:Box,b:Box)=>a.minX<b.maxX&&b.minX<a.maxX&&a.minY<b.maxY&&b.minY<a.maxY;
function area(p:Polygon){let a=0;for(let i=1;i<p.length-1;i++)a+=cross(p[0],p[i],p[i+1]);return a/2;}
function realPolygon(p:Polygon):boolean {
  if(p.length<3)return false;
  const a=area(p),scale=Math.max(...p.flatMap(v=>[Math.abs(v[0]),Math.abs(v[1])]),Number.MIN_VALUE);
  const perimeter=p.reduce((n,v,i)=>n+Math.hypot(v[0]-p[(i+1)%p.length][0],v[1]-p[(i+1)%p.length][1]),0);
  // Reject only area below the rounding uncertainty of screen coordinates.
  // Retaining such zero-width clipping remnants causes combinatorial growth.
  return Number.isFinite(a)&&Math.abs(a)>Number.EPSILON*scale*perimeter*8;
}
function clean(p:Polygon):Polygon {
  const scale=Math.max(...p.flatMap(v=>[Math.abs(v[0]),Math.abs(v[1])]),Number.MIN_VALUE),error=scale*Number.EPSILON*4;
  const same=(a:Vec3,b:Vec3)=>Math.abs(a[0]-b[0])<=error&&Math.abs(a[1]-b[1])<=error,result:Polygon=[];
  for(const point of p)if(!result.length||!same(point,result[result.length-1]))result.push(point);
  if(result.length>1&&same(result[0],result[result.length-1]))result.pop();return result;
}
/** A closing hairline must not be wider than the fragment it closes. */
export function polygonSeamWidth(points:ReadonlyArray<readonly number[]>,maximum:number):number {
  if(points.length<3)return 0;
  const a=points[0];let twiceArea=0,perimeter=0;
  for(let i=0;i<points.length;i++){
    const b=points[i],c=points[(i+1)%points.length];perimeter+=Math.hypot(c[0]-b[0],c[1]-b[1]);
    if(i>0&&i<points.length-1)twiceArea+=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  }
  return perimeter?Math.min(maximum,Math.abs(twiceArea)/perimeter):0;
}
function clip(p:Polygon,value:(v:Vec3)=>number):Polygon {
  const out:Polygon=[];
  for(let i=0;i<p.length;i++){
    const a=p[i],b=p[(i+1)%p.length],u=value(a),v=value(b);
    if(u>=0)out.push(a);
    if((u<0&&v>0)||(u>0&&v<0))out.push(interpolate(a,b,u/(u-v)));
  }
  return clean(out);
}
function intersection(a:Polygon,b:Polygon):Polygon {
  const sign=Math.sign(area(b));let p=a;
  for(let i=0;i<b.length&&p.length;i++){const c=b[i],d=b[(i+1)%b.length];p=clip(p,v=>sign*cross(c,d,v));}
  return realPolygon(p)?p:[];
}
/** Convex difference is a set of convex fragments. No scene-wide paint order
 * is imposed: independent overlap cells may have independent contact orders. */
function subtract(subject:Polygon,occluder:Polygon):Polygon[] {
  const result:Polygon[]=[],sign=Math.sign(area(occluder));let inside=subject;
  for(let i=0;i<occluder.length&&inside.length;i++){
    const a=occluder[i],b=occluder[(i+1)%occluder.length];
    const outside=clip(inside,p=>-sign*cross(a,b,p));
    if(realPolygon(outside))result.push(outside);
    inside=clip(inside,p=>sign*cross(a,b,p));
  }
  return result;
}
function depthPlane(p:Polygon){
  const a=p[0],b=p[1],c=p[2],det=cross(a,b,c);
  const dx=((b[2]-a[2])*(c[1]-a[1])-(c[2]-a[2])*(b[1]-a[1]))/det;
  const dy=((b[0]-a[0])*(c[2]-a[2])-(c[0]-a[0])*(b[2]-a[2]))/det;
  return (p:Vec3)=>a[2]+dx*(p[0]-a[0])+dy*(p[1]-a[1]);
}
/** Roundoff in evaluating two affine depth planes, not a model-space gap. */
const tied=(a:number,b:number)=>Math.abs(a-b)<=Math.max(Math.abs(a),Math.abs(b),Number.MIN_VALUE)*Number.EPSILON*32;
function coveringPatch(subject:Face,other:Face,patch:Polygon,options:ContactVisibilityOptions):Polygon {
  const contact=options.compare(other.item,subject.item,false);
  if(contact)return contact>0?patch:[];
  const depths=patch.map(p=>[subject.depth(p),other.depth(p)]);
  if(depths.every(([a,b])=>tied(a,b))){
    const tie=options.compare(other.item,subject.item,true);
    // The playback depth buffer retains the first material on an unclassified
    // exact tie. IDs break only that tie, never a nonzero physical separation.
    return tie>0||tie===0&&other.item.ref<subject.item.ref?patch:[];
  }
  return clip(patch,p=>other.depth(p)-subject.depth(p));
}
function intervalClip(interval:[number,number],u:number,v:number):[number,number]|null {
  if(u<0&&v<0)return null;
  const [lo,hi]=interval;
  if(u>=0&&v>=0)return interval;
  const t=u/(u-v),next:[number,number]=u<0?[Math.max(lo,t),hi]:[lo,Math.min(hi,t)];
  return next[1]>next[0]?next:null;
}
function coveredInterval(line:BspItem,face:Face,options:ContactVisibilityOptions):[number,number]|null {
  const left=options.owners(line),right=options.owners(face.item);
  if(left.some(id=>right.includes(id)))return null;
  const [a,b]=line.points,p=face.item.points,sign=Math.sign(area(p));let span:[number,number]|null=[0,1];
  for(let i=0;i<p.length&&span;i++)span=intervalClip(span,sign*cross(p[i],p[(i+1)%p.length],a),sign*cross(p[i],p[(i+1)%p.length],b));
  if(!span)return null;
  const contact=options.compare(face.item,line,false);
  if(contact)return contact>0?span:null;
  const u=face.depth(a)-a[2],v=face.depth(b)-b[2];
  if(tied(face.depth(a),a[2])&&tied(face.depth(b),b[2]))return options.compare(face.item,line,true)>0?span:null;
  return intervalClip(span,u,v);
}
/** Exact vector footprints with per-overlap physical/contact depth. A raster
 * compares only samples in common; using a contact as a global BSP partition
 * instead can move unrelated sheets and corrupt another part of the drawing. */
export function visibleContactPieces(items:readonly BspItem[],options:ContactVisibilityOptions):BspItem[] {
  const faces:Face[]=items.filter(i=>i.kind===0&&realPolygon(i.points)).map(item=>({item,box:bounds(item.points),depth:depthPlane(item.points)}));
  // Follow the depth buffer's actual submission order. A hidden sheet cannot
  // occlude a third sheet: compare only the currently visible material in a
  // common region, rather than inferring a global order from pairwise ties.
  let visibleFaces:{face:Face;points:Polygon;box:Box}[]=[];
  for(const face of faces){
    let incoming:Polygon[]=[face.item.points];const retained:typeof visibleFaces=[];
    for(const previous of visibleFaces){
      if(!overlap(face.box,previous.box)){retained.push(previous);continue;}
      const shared=intersection(face.item.points,previous.points);
      if(!shared.length){retained.push(previous);continue;}
      const wins=coveringPatch(previous.face,face,shared,options);
      const loses=realPolygon(wins)?subtract(shared,wins):[shared];
      if(realPolygon(wins))for(const points of subtract(previous.points,wins))retained.push({face:previous.face,points,box:bounds(points)});
      else retained.push(previous);
      for(const patch of loses)incoming=incoming.flatMap(piece=>intersection(piece,patch).length?subtract(piece,patch):[piece]);
    }
    visibleFaces=[...retained,...incoming.map(points=>({face,points,box:bounds(points)}))];
  }
  const result:BspItem[]=visibleFaces.map(({face,points})=>({...face.item,points}));
  for(const line of items.filter(i=>i.kind===1)){
    const box=bounds(line.points);let visible:[number,number][]=[[0,1]];
    for(const fragment of visibleFaces){
      const {face,points,box:cover}=fragment;
      if(cover.minX>box.maxX||cover.maxX<box.minX||cover.minY>box.maxY||cover.maxY<box.minY)continue;
      const covered=coveredInterval(line,{...face,item:{...face.item,points}},options);if(!covered)continue;
      const [lo,hi]=covered;
      visible=visible.flatMap(([a,b])=>hi<=a||lo>=b?[[a,b] as [number,number]]:[...(lo>a?[[a,Math.min(lo,b)] as [number,number]]:[]),...(hi<b?[[Math.max(a,hi),b] as [number,number]]:[])]);
      if(!visible.length)break;
    }
    for(const [a,b] of visible)if(b>a)result.push({...line,points:[interpolate(line.points[0],line.points[1],a),interpolate(line.points[0],line.points[1],b)]});
  }
  return result;
}
