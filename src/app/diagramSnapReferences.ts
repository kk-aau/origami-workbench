import type {Point} from '../core/types';
import {epsilonFor} from '../core/geometry';
import type {DiagramAnnotation,DiagramLineAnnotation} from './diagramAnnotations';
import {isDiagramCPLine} from './diagramAnnotations';
import type {DiagramPose} from './diagramProject';
import type {ModelViewState} from './modelViewState';
import {diagramPresentation,diagramFaceVisible,diagramBackgroundLinesForDrawing,isDiagramBackgroundLine} from './diagramDrawing';
import {diagramIllustrationMesh} from './diagramIllustrationMesh';
import {diagramTearWindowOutline} from './diagramTearWindowGeometry';
import {diagramPreviewSourceIds,diagramBackgroundSourceIds} from './diagramStationarySnapReferences';

export interface DiagramSnapPreviewSegment {
  id:string;a:Point;b:Point;style:DiagramLineAnnotation['style'];face:number;
  visibility:'visible'|'hidden'|'unknown';existing?:boolean;
}
export interface DiagramSnapReferenceOptions {
  pose:DiagramPose|null;view:ModelViewState;annotations:readonly DiagramAnnotation[];
  foldLinkEnabled?:boolean;foldLinkPreview?:readonly DiagramSnapPreviewSegment[];
}
/** Display-only provenance, never stored on source annotations or in the CP.
 * An empty set means a real paper edge or an independently retained route. */
export interface DiagramSnapReference extends DiagramLineAnnotation {snapSourceIds?:string[]}
type Bounds={minX:number;minY:number;maxX:number;maxY:number};
type Cell={points:Point[];sign:number;bounds:Bounds};
type ShownFace={face:number;rank:number;cells:Cell[];bounds:Bounds};
type Interval=[number,number];
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const length=(a:Point,b:Point)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
const finitePoint=(point:Point)=>point.length===2&&point.every(Number.isFinite);
const bounds=(points:Point[]):Bounds=>{
  const box={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
  for(const [x,y] of points){box.minX=Math.min(box.minX,x);box.minY=Math.min(box.minY,y);box.maxX=Math.max(box.maxX,x);box.maxY=Math.max(box.maxY,y);}return box;
};
const overlaps=(a:Bounds,b:Bounds,eps:number)=>a.maxX+eps>=b.minX&&a.minX-eps<=b.maxX&&a.maxY+eps>=b.minY&&a.minY-eps<=b.maxY;

function mergeIntervals(intervals:readonly Interval[],eps:number):Interval[]{
  const result:Interval[]=[];
  for(const [start,end] of intervals.map(([a,b])=>[Math.max(0,a),Math.min(1,b)] as Interval).filter(([a,b])=>b-a>eps).sort((a,b)=>a[0]-b[0])){
    const previous=result.at(-1);if(previous&&start<=previous[1]+eps)previous[1]=Math.max(previous[1],end);else result.push([start,end]);
  }
  return result;
}
function subtractIntervals(source:readonly Interval[],removed:readonly Interval[],eps:number):Interval[]{
  const cuts=mergeIntervals(removed,eps),result:Interval[]=[];
  for(const [lo,hi] of mergeIntervals(source,eps)){
    let start=lo;
    for(const [a,b] of cuts){if(b<=start+eps)continue;if(a>=hi-eps)break;if(a-start>eps)result.push([start,Math.min(a,hi)]);start=Math.max(start,b);if(start>=hi-eps)break;}
    if(hi-start>eps)result.push([start,hi]);
  }
  return result;
}
function intersectIntervals(first:readonly Interval[],second:readonly Interval[],eps:number):Interval[]{
  const a=mergeIntervals(first,eps),b=mergeIntervals(second,eps),result:Interval[]=[];let i=0,j=0;
  while(i<a.length&&j<b.length){const lo=Math.max(a[i][0],b[j][0]),hi=Math.min(a[i][1],b[j][1]);if(hi-lo>eps)result.push([lo,hi]);if(a[i][1]<b[j][1])i++;else j++;}
  return result;
}
function polygonContains(point:Point,polygon:readonly Point[],eps:number){
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[j],b=polygon[i],size=length(a,b),along=(point[0]-a[0])*(b[0]-a[0])+(point[1]-a[1])*(b[1]-a[1]);
    if(size>eps&&Math.abs(cross(a,b,point))<=eps*size&&along>=-eps*size&&along<=size*size+eps*size)return true;
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
/** Intervals are display fragments of the same finite original line. The
 * irregular mask outline is never inserted into the source CP or mesh. */
function polygonIntervals(line:DiagramLineAnnotation,polygon:readonly Point[],eps:number):Interval[]{
  const dx=line.b[0]-line.a[0],dy=line.b[1]-line.a[1],size=Math.hypot(dx,dy),stops=[0,1];
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],ex=b[0]-a[0],ey=b[1]-a[1],qx=a[0]-line.a[0],qy=a[1]-line.a[1],den=dx*ey-dy*ex,edgeLength=Math.hypot(ex,ey);
    if(Math.abs(den)>eps*Math.max(size,edgeLength)){
      const t=(qx*ey-qy*ex)/den,u=(qx*dy-qy*dx)/den;if(t>0&&t<1&&u>=-eps/Math.max(eps,edgeLength)&&u<=1+eps/Math.max(eps,edgeLength))stops.push(t);
    }else if(Math.abs(qx*dy-qy*dx)<=eps*size){for(const p of [a,b]){const t=((p[0]-line.a[0])*dx+(p[1]-line.a[1])*dy)/(size*size);if(t>0&&t<1)stops.push(t);}}
  }
  const sorted=stops.sort((a,b)=>a-b).filter((value,index,list)=>!index||(value-list[index-1])*size>eps),result:Interval[]=[];
  for(let i=1;i<sorted.length;i++){
    const lo=sorted[i-1],hi=sorted[i],mid=(lo+hi)/2;
    if((hi-lo)*size>eps&&polygonContains([line.a[0]+dx*mid,line.a[1]+dy*mid],polygon,eps))result.push([lo,hi]);
  }
  return mergeIntervals(result,eps/size);
}

/** Clip against a projected illustration triangle, including its boundary. */
function coveredInterval(a:Point,b:Point,cell:Cell,eps:number):Interval|null {
  let lo=0,hi=1;
  for(let edge=0;edge<3;edge++){
    const p=cell.points[edge],q=cell.points[(edge+1)%3],tolerance=eps*length(p,q),from=cell.sign*cross(p,q,a),to=cell.sign*cross(p,q,b);
    // Projection round-off must not reveal an identical lower-layer edge.
    const start=Math.abs(from)<=tolerance?0:from,end=Math.abs(to)<=tolerance?0:to;
    if(start< -tolerance&&end< -tolerance)return null;
    const delta=end-start;
    if(Math.abs(delta)<=Number.EPSILON*Math.max(1,Math.abs(start),Math.abs(end))){if(start< -tolerance)return null;continue;}
    const at=-start/delta;
    if(delta>0)lo=Math.max(lo,at);else hi=Math.min(hi,at);
    if(hi<lo)return null;
  }
  return hi>lo?[Math.max(0,lo),Math.min(1,hi)]:null;
}

/** Static geometry preparation for ordinary line drawing. Call from a memo,
 * not from pointer movement. The saved annotations and material IDs stay intact. */
export function buildDiagramSnapReferences({pose,view,annotations,foldLinkEnabled=false,foldLinkPreview=[]}:DiagramSnapReferenceOptions):DiagramSnapReference[] {
  const eps=pose?epsilonFor(pose.sourceDoc):1e-7,result:DiagramSnapReference[]=[],seen=new Map<string,DiagramSnapReference>();
  const add=(line:DiagramSnapReference)=>{
    if(!finitePoint(line.a)||!finitePoint(line.b)||length(line.a,line.b)<=eps)return;
    const a=line.a.map(value=>Math.round(value/eps)).join(','),b=line.b.map(value=>Math.round(value/eps)).join(','),key=a<b?`${a}|${b}`:`${b}|${a}`;
    const sources=line.snapSourceIds??[],old=seen.get(key);
    if(old){old.snapSourceIds=old.snapSourceIds?.length&&sources.length?[...new Set([...old.snapSourceIds,...sources])]:[];return;}
    const reference={...line,a:[...line.a] as Point,b:[...line.b] as Point,snapSourceIds:[...sources]};seen.set(key,reference);result.push(reference);
  };
  const shown=pose?diagramPresentation(pose,view):null,visibleFaces=shown?new Set(shown.visibleOrder):null,faces:ShownFace[]=[];
  if(pose&&shown){
    // One mesh serves every boundary and background fragment. Its triangles
    // retain holes, indexed F marks and locally pulled illustration cells.
    const mesh=diagramIllustrationMesh(pose);
    shown.visibleOrder.forEach((face,rank)=>{
      const cells=(mesh.triangles[face]??[]).flatMap(ids=>{
        const points=ids.map(vertex=>shown.vertices[vertex]);if(points.some(point=>!point||!finitePoint(point)))return [];
        const area=cross(points[0],points[1],points[2]);
        return Math.abs(area)>eps*eps?[{points,sign:Math.sign(area),bounds:bounds(points)}]:[];
      });
      if(cells.length)faces.push({face,rank,cells,bounds:bounds(cells.flatMap(cell=>cell.points))});
    });
  }
  const byFace=new Map(faces.map(face=>[face.face,face])),windows=new Map<number,Array<{points:Point[];bounds:Bounds}>>();
  if(pose)for(const annotation of annotations){
    if(annotation.kind!=='symbol'||annotation.symbol!=='tearWindow'||!annotation.cutawayFaces?.length)continue;
    const points=diagramTearWindowOutline(annotation),window={points,bounds:bounds(points)};
    for(const face of new Set(annotation.cutawayFaces))if(visibleFaces?.has(face)){const rows=windows.get(face)??[];rows.push(window);windows.set(face,rows);}
  }
  const pieces=(line:DiagramSnapReference,intervals:readonly Interval[]):DiagramSnapReference[]=>{
    const size=length(line.a,line.b);if(!Number.isFinite(size)||size<=eps)return [];
    const normal=mergeIntervals(intervals,eps/size);
    if(normal.length===1&&normal[0][0]===0&&normal[0][1]===1)return [line];
    const at=(t:number):Point=>[line.a[0]+(line.b[0]-line.a[0])*t,line.a[1]+(line.b[1]-line.a[1])*t];
    return normal.map(([lo,hi],part)=>({...line,id:`${line.id}:visible:${part}`,a:at(lo),b:at(hi)}));
  };
  function lineVisibility(line:DiagramLineAnnotation):{exposed:(rank:number,owners?:readonly number[],opaque?:boolean)=>Interval[];openedAbove:(rank:number)=>Interval[];tolerance:number}{
    const size=length(line.a,line.b);
    if(!finitePoint(line.a)||!finitePoint(line.b)||!Number.isFinite(size)||size<=eps)return {exposed:()=>[] as Interval[],openedAbove:()=>[] as Interval[],tolerance:1};
    const tolerance=eps/size,box=bounds([line.a,line.b]),cachedWindows=new Map<number,Interval[]>();
    const faceWindows=(face:number)=>{
      const old=cachedWindows.get(face);if(old)return old;
      const intervals=mergeIntervals((windows.get(face)??[]).flatMap(window=>overlaps(box,window.bounds,eps)?polygonIntervals(line,window.points,eps):[]),tolerance);
      cachedWindows.set(face,intervals);return intervals;
    };
    const faceCoverage=(face:ShownFace)=>mergeIntervals(face.cells.flatMap(cell=>{
      if(!overlaps(box,cell.bounds,eps))return [];const interval=coveredInterval(line.a,line.b,cell,eps);return interval?[interval]:[];
    }),tolerance);
    const ownHidden=(owners:readonly number[]|undefined)=>{
      const contributing=[...new Set(owners?.filter(face=>visibleFaces?.has(face))??[])];
      if(!contributing.length)return [];
      let hidden:Interval[]=[[0,1]];
      for(const face of contributing){hidden=intersectIntervals(hidden,faceWindows(face),tolerance);if(!hidden.length)break;}
      return hidden;
    };
    const exposed=(rank:number,owners?:readonly number[],opaque=true)=>{
      const covered=[...ownHidden(owners)];
      if(opaque)for(const face of faces){
        if(face.rank<=rank||!overlaps(box,face.bounds,eps))continue;
        covered.push(...subtractIntervals(faceCoverage(face),faceWindows(face.face),tolerance));
      }
      return subtractIntervals([[0,1]],covered,tolerance);
    };
    const openedAbove=(rank:number)=>mergeIntervals(faces.flatMap(face=>face.rank>rank&&overlaps(box,face.bounds,eps)?intersectIntervals(faceCoverage(face),faceWindows(face.face),tolerance):[]),tolerance);
    return {exposed,openedAbove,tolerance};
  }
  if(pose&&shown){
    shown.visibleOrder.forEach((face,rank)=>{
      const rings=diagramIllustrationMesh(pose).rings[face];
      rings.forEach((ring,r)=>ring.forEach((vertex,edge)=>{
        const a=shown.vertices[vertex],b=shown.vertices[ring[(edge+1)%ring.length]];if(!a||!b)return;
        const line:DiagramLineAnnotation={id:`model-edge:${face}:${r}:${edge}`,kind:'line',a,b,style:'crease',color:'#41634e',width:.1,foldFaces:[face]};
        for(const part of pieces(line,lineVisibility(line).exposed(rank,[face],shown.solid)))add(part);
      }));
    });
  }
  for(const annotation of annotations){
    if(annotation.kind!=='line'||isDiagramBackgroundLine(annotation))continue;
    if(pose&&annotation.foldFaces?.length&&!annotation.foldFaces.some(face=>diagramFaceVisible(pose,face)))continue;
    // These sources are paint-free: their current presented paper pieces come
    // from the linked preview, and their outside pieces come from the background.
    if(foldLinkEnabled&&(isDiagramCPLine(annotation)||['valley','mountain'].includes(annotation.style)&&annotation.foldFaces?.length!==0))continue;
    for(const part of pieces({...annotation,snapSourceIds:[annotation.id]},lineVisibility(annotation).exposed(Infinity,annotation.foldFaces,false)))add(part);
  }
  if(foldLinkEnabled)for(const segment of foldLinkPreview){
    if(visibleFaces&&!visibleFaces.has(segment.face))continue;
    const line:DiagramSnapReference={id:`snap-preview:${segment.id}`,kind:'line',a:segment.a,b:segment.b,style:segment.style,color:'#41634e',width:.1,foldFaces:[segment.face]};
    line.snapSourceIds=diagramPreviewSourceIds(segment,annotations,eps);
    const visibility=lineVisibility(line);
    if(segment.visibility==='hidden'){
      const owner=byFace.get(segment.face);if(!shown?.solid||!owner)continue;
      // A previously covered route becomes a reference only in an actual
      // opening of paper above it, and only while no other layer covers it.
      for(const part of pieces(line,intersectIntervals(visibility.exposed(owner.rank,[segment.face]),visibility.openedAbove(owner.rank),visibility.tolerance)))add(part);
    }else for(const part of pieces(line,visibility.exposed(Infinity,[segment.face],false)))add(part);
  }
  for(const background of diagramBackgroundLinesForDrawing(pose,[...annotations],foldLinkEnabled,view)){
    const snapSourceIds=diagramBackgroundSourceIds(background,annotations,eps);
    for(const part of pieces({...background,snapSourceIds},lineVisibility(background).exposed(-1)))add(part);
  }
  return result;
}
