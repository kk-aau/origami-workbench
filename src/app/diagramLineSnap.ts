import type {Point} from '../core/types';
import type {DiagramLineAnnotation} from './diagramAnnotations';

const EPS=1e-8;
const ANGLE_EPS=1e-8;
const PI=Math.PI;
const add=(a:Point,b:Point):Point=>[a[0]+b[0],a[1]+b[1]];
const sub=(a:Point,b:Point):Point=>[a[0]-b[0],a[1]-b[1]];
const mul=(a:Point,s:number):Point=>[a[0]*s,a[1]*s];
const dot=(a:Point,b:Point)=>a[0]*b[0]+a[1]*b[1];
const cross=(a:Point,b:Point)=>a[0]*b[1]-a[1]*b[0];
const length=(a:Point)=>Math.hypot(a[0],a[1]);
const finite=(p:Point)=>p.length===2&&p.every(Number.isFinite);
const axisAngle=(a:number)=>((a%PI)+PI)%PI;
const unit=(p:Point):Point|null=>{const n=length(p);return n>EPS?mul(p,1/n):null;};

export type DiagramLineSnapReference=Pick<DiagramLineAnnotation,'id'|'a'|'b'>;
export interface DiagramLineSnapOptions {
  anchor:Point;
  lines:readonly DiagramLineAnnotation[];
  /** World distance obtained from the screen's snap tolerance and current zoom. */
  radius:number;
  enabled?:boolean;
  /** Additional angular guard, independent of zoom and reference-line length. */
  maxAngleDegrees?:number;
}
export interface DiagramLineSnapResult {
  point:Point;
  kind:'perpendicular'|'bisector';
  /** Actual right-angle foot, or the common vertex of the two bisected lines. */
  vertex:Point;
  /** Unit vector from the drawing anchor towards the snapped endpoint. */
  direction:Point;
  /** One perpendicular reference ray, or the two rays surrounding the bisector. */
  referenceDirections:Point[];
  references:DiagramLineSnapReference[];
  label:string;
}

interface Reference {
  source:DiagramLineAnnotation;
  direction:Point;
  length:number;
  angle:number;
}
const snapshot=(line:DiagramLineAnnotation):DiagramLineSnapReference=>({id:line.id,a:[...line.a],b:[...line.b]});
const preferred=(a:Reference,b:Reference)=>a.length>b.length+EPS||Math.abs(a.length-b.length)<=EPS&&a.source.id<b.source.id;

/** Automatic relations only. Callers retain explicit endpoint/grid/modifier priorities.
 * Finite-segment proximity is checked before considering a perpendicular; bisectors
 * use only references actually incident to the anchor, never a nearby intersection.
 * Sorted reflection lookup avoids a quadratic intersection scan on pointer moves. */
export function snapDiagramLinePoint(pointer:Point,options:DiagramLineSnapOptions):DiagramLineSnapResult|null {
  const {anchor,lines,radius,enabled=true}=options;
  if(!enabled||!finite(pointer)||!finite(anchor)||!Number.isFinite(radius)||radius<=0)return null;
  const delta=sub(pointer,anchor),distance=length(delta);
  if(distance<=EPS)return null;
  const requestedAngle=options.maxAngleDegrees??7.5;
  if(!Number.isFinite(requestedAngle)||requestedAngle<=0)return null;
  const angleLimit=Math.min(12,requestedAngle)*PI/180;
  const angularTolerance=Math.sin(angleLimit);
  // This is solely a numerical co-incidence tolerance, never the visible snap radius.
  const coincidence=Math.max(EPS,Math.abs(anchor[0])*1e-12,Math.abs(anchor[1])*1e-12);
  const incident:Reference[]=[];
  let best:DiagramLineSnapResult|null=null,bestError=Infinity,bestKey='';

  function consider(point:Point,kind:DiagramLineSnapResult['kind'],vertex:Point,referenceDirections:Point[],references:Reference[]) {
    const endpointDelta=sub(point,anchor),direction=unit(endpointDelta);
    if(!direction||dot(endpointDelta,delta)<=0||Math.abs(cross(delta,direction))>distance*angularTolerance+EPS)return;
    const error=length(sub(pointer,point));
    if(error>radius+EPS)return;
    const key=`${kind}:${references.map(reference=>reference.source.id).sort().join(':')}`;
    if(error>bestError+EPS||Math.abs(error-bestError)<=EPS&&best!==null&&key>=bestKey)return;
    bestError=error;bestKey=key;
    best={point:[...point],kind,vertex:[...vertex],direction,referenceDirections:referenceDirections.map(p=>[...p]),
      references:references.map(reference=>snapshot(reference.source)),label:kind==='perpendicular'?'垂直 · 90°':'角平分线'};
  }

  for(const source of lines) {
    if(!finite(source.a)||!finite(source.b))continue;
    const edge=sub(source.b,source.a),edgeLength=length(edge);
    if(!Number.isFinite(edgeLength)||edgeLength<=EPS)continue;
    let direction=mul(edge,1/edgeLength);
    if(direction[1]<-ANGLE_EPS||Math.abs(direction[1])<=ANGLE_EPS&&direction[0]<0)direction=mul(direction,-1);
    const reference:Reference={source,direction,length:edgeLength,angle:axisAngle(Math.atan2(direction[1],direction[0]))};
    const fromStart=sub(anchor,source.a),along=dot(fromStart,mul(edge,1/edgeLength));
    const perpendicularDistance=Math.abs(cross(fromStart,direction));
    if(perpendicularDistance<=coincidence&&along>=-coincidence&&along<=edgeLength+coincidence)incident.push(reference);

    // A perpendicular foot outside a finite reference is unrelated to that segment.
    if(along< -coincidence||along>edgeLength+coincidence)continue;
    const foot=add(source.a,mul(edge,along/edgeLength));
    // Nearby means near the anchor or the pointer, not merely on a remote support line.
    const pointerAlong=dot(sub(pointer,source.a),mul(edge,1/edgeLength));
    const pointerFoot=add(source.a,mul(edge,Math.max(0,Math.min(edgeLength,pointerAlong))/edgeLength));
    if(Math.min(perpendicularDistance,length(sub(pointer,pointerFoot)))>radius*2+EPS)continue;
    const normal:Point=[-direction[1],direction[0]],projection=dot(delta,normal);
    if(Math.abs(projection)<=EPS||Math.abs(cross(delta,normal))>distance*angularTolerance+EPS)continue;
    const projected=add(anchor,mul(normal,projection));
    const useFoot=length(sub(foot,anchor))>EPS&&dot(sub(foot,anchor),delta)>0&&length(sub(pointer,foot))<=radius+EPS;
    const point=useFoot?foot:projected;
    // Choose a reference ray on the visible finite piece when the foot is an endpoint.
    const towardA=sub(source.a,foot),towardB=sub(source.b,foot);
    const referenceRay=unit(length(towardA)>length(towardB)?towardA:towardB)??direction;
    consider(point,'perpendicular',perpendicularDistance<=coincidence?anchor:foot,[referenceRay],[reference]);
  }

  if(incident.length<2)return best;
  incident.sort((a,b)=>a.angle-b.angle||a.source.id.localeCompare(b.source.id));
  const axes:Reference[]=[];
  for(const reference of incident) {
    const last=axes.at(-1);
    if(last&&Math.abs(cross(last.direction,reference.direction))<=ANGLE_EPS) {
      if(preferred(reference,last))axes[axes.length-1]=reference;
    } else axes.push(reference);
  }
  // The first and last sorted axes may be the same unoriented supporting line.
  if(axes.length>1&&Math.abs(cross(axes[0].direction,axes.at(-1)!.direction))<=ANGLE_EPS) {
    const last=axes.pop()!;if(preferred(last,axes[0]))axes[0]=last;
    axes.sort((a,b)=>a.angle-b.angle);
  }
  if(axes.length<2)return best;
  const pointerAngle=Math.atan2(delta[1],delta[0]),seen=new Set<string>();
  for(let i=0;i<axes.length;i++) {
    const first=axes[i],reflected=axisAngle(2*pointerAngle-first.angle);
    let low=0,high=axes.length;
    while(low<high){const middle=(low+high)>>>1;if(axes[middle].angle<reflected)low=middle+1;else high=middle;}
    // The nearest reflected axis gives the closest bisector for this first axis;
    // neighbours also cover the current axis itself and the circular 0/π seam.
    for(let offset=-2;offset<=1;offset++) {
      const j=(low+offset+axes.length)%axes.length;if(j===i)continue;
      const key=i<j?`${i}:${j}`:`${j}:${i}`;if(seen.has(key))continue;seen.add(key);
      const second=axes[j];
      if(Math.abs(cross(first.direction,second.direction))<=ANGLE_EPS)continue;
      for(const sum of [add(first.direction,second.direction),sub(first.direction,second.direction)]) {
        const bisector=unit(sum);if(!bisector)continue;
        const projection=dot(delta,bisector);if(Math.abs(projection)<=EPS)continue;
        const direction=mul(bisector,Math.sign(projection));
        if(Math.abs(cross(delta,direction))>distance*angularTolerance+EPS)continue;
        const rays=[first.direction,second.direction].map(ray=>dot(ray,direction)>=0?ray:mul(ray,-1));
        // Ordering makes the two equal arcs straightforward for the view to draw.
        rays.sort((a,b)=>Math.atan2(cross(direction,a),dot(direction,a))-Math.atan2(cross(direction,b),dot(direction,b)));
        consider(add(anchor,mul(bisector,projection)),'bisector',anchor,rays,[first,second]);
      }
    }
  }
  return best;
}
