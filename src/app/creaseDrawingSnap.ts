import type {Point,Segment} from '../core/types';
import type {SnapPoint} from './snapPoints';
import {nearestSnapPoint} from './snapPoints';
import type {DiagramLineAnnotation} from './diagramAnnotations';
import {snapDiagramLinePoint,type DiagramLineSnapResult} from './diagramLineSnap';
import {diagramGridLineIntersections} from './diagramDrawingTools';
import type {DiagramSnapGrid} from './diagramGrid';
import {gridLatticeNodes} from './gridGeometry';
import {distanceToSegment} from './state';

export interface CreaseDrawingSnapGrid {
  visible:boolean;
  scope:'paper'|'canvas'|'off';
  snap:(point:Point)=>Point;
  /** Required for a paper grid: includes holes and disconnected paper outlines. */
  contains?:(point:Point)=>boolean;
  /** Exact painted lattice; needed where a finite paper edge crosses a grid line. */
  lattice?:DiagramSnapGrid;
}
export interface CreaseDrawingSnapOptions {
  enabled:boolean;
  radius:number;
  points:readonly SnapPoint[];
  anchor?:Point;
  shift?:boolean;
  grid?:CreaseDrawingSnapGrid;
  /** Only displayed finite segments belong here; source geometry stays unchanged. */
  segments?:readonly Pick<Segment,'id'|'a'|'b'>[];
  /** Point-picking tools use exact grid crossings without sliding along a line body. */
  projectToSegments?:boolean;
  relationLines?:readonly DiagramLineAnnotation[];
  /** Last result from the same drawing gesture, used only for discrete targets. */
  previous?:CreaseDrawingSnapResult|null;
}
export interface CreaseDrawingSnapResult {
  point:Point;
  kind:'none'|'point'|'grid'|'grid-intersection'|'segment'|'perpendicular'|'bisector';
  target:SnapPoint|null;
  relation:DiagramLineSnapResult|null;
}
const finite=(point:Point)=>point.length===2&&point.every(Number.isFinite);
const subtract=(a:Point,b:Point):Point=>[a[0]-b[0],a[1]-b[1]];
const cross=(a:Point,b:Point)=>a[0]*b[1]-a[1]*b[0];
const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

/** Retain full-source junction identities, but hidden-only points cannot catch a pointer. */
export function visibleCreaseSnapPoints(points:readonly SnapPoint[],visibleSegmentIds:ReadonlySet<string>):SnapPoint[]{
  return points.filter(point=>point.segmentIds.some(id=>visibleSegmentIds.has(id)));
}

/** Grid painting and snapping share their scope; a hidden grid never attracts the pointer. */
export function creaseGridSnapPoint(point:Point,grid:CreaseDrawingSnapGrid|undefined):Point|null {
  if(!grid?.visible||grid.scope==='off'||!finite(point))return null;
  if(grid.lattice&&(grid.lattice.pattern==='triangular'||grid.lattice.pattern==='square'||grid.lattice.rotation||grid.lattice.diagonal&&grid.lattice.diagonalAngle!==undefined)){
    if(grid.scope==='paper'&&!grid.contains?.(point))return null;
    const nodes=gridLatticeNodes(point,grid.lattice).filter(candidate=>finite(candidate)&&(grid.scope!=='paper'||grid.contains?.(candidate)));
    return nodes.length?nodes.reduce((best,candidate)=>distance(candidate,point)<distance(best,point)?candidate:best):null;
  }
  const result=grid.snap(point);
  if(!finite(result)||grid.scope==='paper'&&(!grid.contains?.(point)||!grid.contains(result)))return null;
  return result;
}

/** Once a construction direction is fixed, its length may stop at a visible
 * grid line, not only at a grid node. Query a short guide around the pointer. */
export function creaseGridRayIntersections(projected:Point,origin:Point,grid:CreaseDrawingSnapGrid|undefined,radius:number):Point[]{
  if(!grid?.visible||grid.scope==='off'||!grid.lattice||!finite(projected)||!finite(origin)||!Number.isFinite(radius)||radius<=0)return [];
  const delta=subtract(projected,origin),length=Math.hypot(...delta);
  if(length<=1e-12)return [];
  const direction:Point=[delta[0]/length,delta[1]/length];
  const guide={a:[projected[0]-direction[0]*radius,projected[1]-direction[1]*radius] as Point,
    b:[projected[0]+direction[0]*radius,projected[1]+direction[1]*radius] as Point};
  return diagramGridLineIntersections(projected,[guide],grid.lattice,radius)
    .filter(candidate=>(candidate[0]-origin[0])*direction[0]+(candidate[1]-origin[1])*direction[1]>1e-9&&
      (grid.scope!=='paper'||grid.contains?.(candidate)))
    .sort((a,b)=>distance(a,projected)-distance(b,projected)||a[0]-b[0]||a[1]-b[1]);
}

/** A real vertex or transverse finite crossing wins over a nearby grid line.
 * Merely lying along an existing line is not an exact point constraint. */
export function creaseRayHasPhysicalPoint(origin:Point,point:Point,points:readonly SnapPoint[],segments:readonly Pick<Segment,'a'|'b'>[]):boolean{
  if(points.some(target=>distance(target.point,point)<=1e-8))return true;
  const direction=subtract(point,origin),length=Math.hypot(...direction);
  if(length<=1e-12)return false;
  return segments.some(segment=>{
    const edge=subtract(segment.b,segment.a);
    return Math.abs(cross(direction,edge))>1e-9*length*Math.hypot(...edge)&&distanceToSegment(point,segment)<=1e-8;
  });
}

/** One resolver supplies hover, press and release. Shift constrains the ray BEFORE
 * target selection; incompatible real vertices are rejected, never moved off paper.
 * Existing points, exact grid/edge crossings and grid nodes win over continuous line-body
 * projections. Shift still rejects every target outside its constrained ray. */
export function snapCreaseDrawingPoint(pointer:Point,options:CreaseDrawingSnapOptions):CreaseDrawingSnapResult {
  const {anchor,radius,points,segments=[],relationLines=[]}=options;
  let point:Point=[...pointer],direction:Point|undefined;
  if(options.shift&&anchor&&finite(anchor)&&finite(pointer)){
    const delta=subtract(pointer,anchor),angle=Math.round(Math.atan2(delta[1],delta[0])/(Math.PI/4))*Math.PI/4;
    direction=[Math.cos(angle),Math.sin(angle)];
    const projection=delta[0]*direction[0]+delta[1]*direction[1];
    point=[anchor[0]+projection*direction[0],anchor[1]+projection*direction[1]];
  }
  const result=(resolved:Point,kind:CreaseDrawingSnapResult['kind'],target:SnapPoint|null=null,relation:DiagramLineSnapResult|null=null):CreaseDrawingSnapResult=>({point:resolved,kind,target,relation});
  if(!options.enabled||!finite(pointer)||!Number.isFinite(radius)||radius<=0)return result(point,'none');
  const discreteResult=(candidate:Point,kind:CreaseDrawingSnapResult['kind'],target:SnapPoint|null=null)=>{
    const relation=anchor&&!direction&&relationLines.length?snapDiagramLinePoint(candidate,{anchor,lines:relationLines,radius}):null;
    // A right-angle marker describes the exact target; it must never move it.
    const exact=relation&&distance(relation.point,candidate)<=1e-9*Math.max(1,distance(candidate,anchor!))?{...relation,point:[...candidate] as Point}:null;
    return result([...candidate],kind,target,exact);
  };
  const compatible=(candidate:Point,ray:Point|undefined=direction)=>{
    if(!ray||!anchor)return true;
    const delta=subtract(candidate,anchor),tolerance=1e-9*Math.max(1,Math.hypot(...delta));
    return Math.abs(cross(delta,ray))<=tolerance&&delta[0]*ray[0]+delta[1]*ray[1]>=-tolerance;
  };
  const compatiblePoints=direction?points.filter(candidate=>compatible(candidate.point)):points;
  const previous=options.previous,releaseRadius=radius*1.35;
  // A small release band prevents cursor noise from dropping a point directly
  // back onto the continuously sliding edge; no coordinates are interpolated.
  const retained=previous?.kind==='point'&&previous.target
    ?compatiblePoints.find(candidate=>candidate.id===previous.target!.id&&distance(candidate.point,previous.point)<=1e-8&&distance(candidate.point,point)<=releaseRadius):undefined;
  const nearest=nearestSnapPoint(compatiblePoints,point,radius);
  const target=retained&&(!nearest||distance(nearest.point,point)>=distance(retained.point,point)*.5)?retained:nearest;
  if(target)return discreteResult(target.point,'point',target);
  const lattice=options.grid?.visible&&options.grid.scope!=='off'?options.grid.lattice:undefined;
  if(lattice&&segments.length){
    const crossings=diagramGridLineIntersections(point,segments,lattice,previous?.kind==='grid-intersection'?releaseRadius:radius)
      .filter(candidate=>compatible(candidate)&&(options.grid!.scope!=='paper'||options.grid!.contains?.(candidate)));
    const retained=previous?.kind==='grid-intersection'
      ?crossings.find(candidate=>distance(candidate,previous.point)<=1e-8&&distance(candidate,point)<=releaseRadius):undefined;
    const nearest=crossings.filter(candidate=>distance(candidate,point)<=radius)
      .sort((a,b)=>distance(a,point)-distance(b,point)||a[0]-b[0]||a[1]-b[1])[0];
    const closest=retained&&(!nearest||distance(nearest,point)>=distance(retained,point)*.5)?retained:nearest;
    if(closest)return discreteResult(closest,'grid-intersection');
  }
  const grid=creaseGridSnapPoint(point,options.grid);
  if(grid&&compatible(grid)&&distance(grid,point)<=radius)return discreteResult(grid,'grid');
  const relation=anchor&&!direction&&relationLines.length?snapDiagramLinePoint(point,{anchor,lines:relationLines,radius}):null;
  function finiteSegmentSnap(ray:Point|undefined=direction):Point|null {
    let best:Point|null=null,bestDistance=radius,bestId='';
    for(const segment of segments){
      if(!finite(segment.a)||!finite(segment.b))continue;
      const edge=subtract(segment.b,segment.a),lengthSquared=edge[0]**2+edge[1]**2;
      if(lengthSquared<=1e-20)continue;
      let candidate:Point;
      if(ray&&anchor){
        const offset=subtract(segment.a,anchor),denominator=cross(ray,edge);
        if(Math.abs(denominator)<=1e-12*Math.sqrt(lengthSquared)){
          if(Math.abs(cross(offset,ray))>1e-9*Math.max(1,Math.hypot(...offset)))continue;
          const fromStart=subtract(point,segment.a),t=Math.max(0,Math.min(1,(fromStart[0]*edge[0]+fromStart[1]*edge[1])/lengthSquared));
          candidate=[segment.a[0]+t*edge[0],segment.a[1]+t*edge[1]];
        }else{
          const along=cross(offset,edge)/denominator,position=cross(offset,ray)/denominator;
          if(along<0||position<0||position>1)continue;
          // Keep the endpoint on the finite source itself, including exact paper
          // edge coordinates; a direction-only projection can leave a tiny gap.
          candidate=[segment.a[0]+position*edge[0],segment.a[1]+position*edge[1]];
        }
      }else{
        const fromStart=subtract(point,segment.a),t=Math.max(0,Math.min(1,(fromStart[0]*edge[0]+fromStart[1]*edge[1])/lengthSquared));
        candidate=[segment.a[0]+t*edge[0],segment.a[1]+t*edge[1]];
      }
      if(!finite(candidate)||!compatible(candidate,ray))continue;
      const error=distance(candidate,point);
      if(error>bestDistance||error===bestDistance&&best!==null&&segment.id>=bestId)continue;
      best=candidate;bestDistance=error;bestId=segment.id;
    }
    return best;
  }
  const body=options.projectToSegments===false?null:finiteSegmentSnap();
  if(body){
    // A relation controls direction, not connectivity. Complete the endpoint at
    // a nearby finite intersection when both constraints fit the pointer radius.
    if(relation){
      const intersection=finiteSegmentSnap(relation.direction);
      if(intersection)return result(intersection,relation.kind,null,{...relation,point:[...intersection]});
    }
    return result(body,'segment');
  }
  if(relation)return result(relation.point,relation.kind,null,relation);
  return result(point,'none');
}
