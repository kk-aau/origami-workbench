import {BoundsIndex,type Bounds2} from '../core/boundsIndex';
import type {Point} from '../core/types';

export interface ModelArrangement {
 vertices_coords:Point[];edges_vertices:[number,number][];
 /** One immutable display-coordinate representative per source vertex. */
 sourceVertices:Point[];
 /** Normalized straight edges and all crossing abscissae keep the slab
  * fallback independent of unsafe interior-cut welding in the boundary graph. */
 sourceSegments:readonly [Point,Point][];breaks:number[];breakEnds:number[];eventSegments:number[][];maximalFacesSafe:boolean;
 /** Atomic source spans retain all ring owners, including reversed duplicates. */
 originalSegments:readonly [Point,Point][];sourceSegmentOrigins:number[][];sourceSegmentPoints:Point[][];
}
/** Display-only arrangement. Every tolerance is measured in model coordinates;
 * a dimensionless parameter tolerance must be divided by the edge length. */
export function modelPlanarize(vertices:readonly Point[],edges:readonly [number,number][],epsilon:number):ModelArrangement{
 // Normalize the input once, before intersections and coverage are computed.
 // Otherwise folded copies differing only by roundoff become thousands of
 // artificial thin slabs while their boundary graph has already welded them.
 // The accepted display tolerance applies to each world-coordinate component.
 const coordinate=()=>{
  const buckets=new Map<number,number[]>();
  return (value:number)=>{const bucket=Math.floor(value/epsilon),roundoff=Number.EPSILON*Math.max(1,Math.abs(value))*8,radius=Math.ceil((epsilon+roundoff)/epsilon);
   for(let offset=-radius;offset<=radius;offset++)for(const prior of buckets.get(bucket+offset)??[])if(Math.abs(value-prior)<=epsilon+roundoff)return prior;
   const row=buckets.get(bucket);if(row)row.push(value);else buckets.set(bucket,[value]);return value;
  };
 };
 // Equal x/y events must share coordinates even when their vertices are far
 // apart on the other axis. Representatives never move, so clustering cannot
 // drift transitively beyond the accepted per-coordinate display tolerance.
 const xCoordinate=coordinate(),yCoordinate=coordinate(),representatives=new Map<string,Point>();
 const sourceVertices=vertices.map(p=>{const x=xCoordinate(p[0]),y=yCoordinate(p[1]),key=`${x},${y}`,prior=representatives.get(key);if(prior)return prior;const point:Point=[x,y];representatives.set(key,point);return point;});
 let maximalFacesSafe=true;
 const sourceSegments:[Point,Point][]=[],seenSource=new Set<string>();
 for(const [a,b]of edges){const A=sourceVertices[a],B=sourceVertices[b];if(A[0]===B[0]&&A[1]===B[1])continue;const ka=A.join(','),kb=B.join(','),key=ka<kb?`${ka};${kb}`:`${kb};${ka}`;if(seenSource.has(key))continue;seenSource.add(key);sourceSegments.push([[...A],[...B]]);}
 // Long and short copies of a coincident boundary must use the same endpoint
 // spans in the slab sweep. Independently interpolating them creates tiny
 // positive gaps even though the intersection pass calls them collinear.
 // Split at existing source endpoints, including endpoint-on-edge junctions,
 // never at welded interior cuts. Folded copies of a material vertex may meet
 // a long edge without their last floating-point bits lying exactly on it.
 // Source vertices stay fixed, including when only visible edges are supplied.
 const originalSegments=sourceSegments.map(([a,b])=>[a,b] as [Point,Point]),sourceSegmentPoints=originalSegments.map(([a,b])=>[a,b]),sourceSegmentOrigins:number[][]=[];
 const raw=originalSegments.map(([a,b])=>{const dx=b[0]-a[0],dy=b[1]-a[1];return {a,b,dx,dy};}),pointKeys=sourceSegmentPoints.map(points=>new Set(points.map(p=>p.join(','))));
 const rawBoxes:Bounds2[]=raw.map(({a,b})=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])]),rawIndex=new BoundsIndex(rawBoxes);
 const insert=(index:number,p:Point)=>{const s=raw[index],t=Math.abs(s.dx)>=Math.abs(s.dy)?(p[0]-s.a[0])/s.dx:(p[1]-s.a[1])/s.dy,key=p.join(',');if(t>0&&t<1&&!pointKeys[index].has(key)){sourceSegmentPoints[index].push(p);pointKeys[index].add(key);}};
 for(let i=0;i<raw.length;i++)for(const j of rawIndex.query(rawBoxes[i],epsilon,i)){
  const a=raw[i],b=raw[j];
  // Bound the actual vertical interpolation error, not just perpendicular
  // distance: steep parallel bands can have real height despite tiny spacing.
  // For vertical edges these inequalities require exactly the same x.
  const onLine=(s:typeof a,p:Point)=>Math.abs((p[0]-s.a[0])*s.dy-(p[1]-s.a[1])*s.dx)<=epsilon*Math.abs(s.dx);
  if(onLine(a,b.a))insert(i,b.a);if(onLine(a,b.b))insert(i,b.b);
  if(onLine(b,a.a))insert(j,a.a);if(onLine(b,a.b))insert(j,a.b);
 }
 sourceSegments.length=0;const atomic=new Map<string,number>();
 sourceSegmentPoints.forEach((points,origin)=>{const s=raw[origin];points.sort((a,b)=>Math.abs(s.dx)>=Math.abs(s.dy)?(a[0]-b[0])/s.dx:(a[1]-b[1])/s.dy);
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],ka=a.join(','),kb=b.join(',');if(ka===kb)continue;const key=ka<kb?`${ka};${kb}`:`${kb};${ka}`,prior=atomic.get(key);
   if(prior!==undefined)sourceSegmentOrigins[prior].push(origin);else{atomic.set(key,sourceSegments.length);sourceSegments.push([a,b]);sourceSegmentOrigins.push([origin]);}
  }
 });
 // Near-collinear paths use the ring-parity sweep. A geometric containment
 // probe against the unsplit source contour need not agree inside roundoff.
 if(sourceSegmentPoints.some((points,i)=>points.length>2&&points.some(p=>{const s=raw[i];return (p[0]-s.a[0])*s.dy-(p[1]-s.a[1])*s.dx!==0;})))maximalFacesSafe=false;
 const lines=sourceSegments.map(([a,b])=>{const dx=b[0]-a[0],dy=b[1]-a[1];return {a,b,dx,dy,length:Math.hypot(dx,dy),cuts:[0,1]};});
 const boxes:Bounds2[]=lines.map(({a,b})=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])]),index=new BoundsIndex(boxes);
 const splitXs=sourceSegments.flatMap(([a,b])=>[a[0],b[0]]);
 const add=(line:typeof lines[number],t:number)=>{if(t>0&&t<1)line.cuts.push(t);};
 for(let i=0;i<lines.length;i++)for(const j of index.query(boxes[i],epsilon,i)){
  const a=lines[i],b=lines[j],ox=b.a[0]-a.a[0],oy=b.a[1]-a.a[1],den=a.dx*b.dy-a.dy*b.dx;
  const collinear=Math.abs(ox*a.dy-oy*a.dx)<=epsilon*a.length&&Math.abs((b.b[0]-a.a[0])*a.dy-(b.b[1]-a.a[1])*a.dx)<=epsilon*a.length&&Math.abs(ox*b.dy-oy*b.dx)<=epsilon*b.length&&Math.abs((a.b[0]-b.a[0])*b.dy-(a.b[1]-b.a[1])*b.dx)<=epsilon*b.length;
  if(den!==0&&!collinear){
   const t=(ox*b.dy-oy*b.dx)/den,u=(ox*a.dy-oy*a.dx)/den;
   // Include endpoint joins without shortening either original segment.
   if(t>=0&&t<=1&&u>=0&&u<=1){add(a,t);add(b,u);splitXs.push(a.a[0]+a.dx*t);}
  }else if(collinear){
   if(den!==0||ox*a.dy-oy*a.dx!==0)maximalFacesSafe=false;
   const endpoint=(p:Point,line:typeof a)=>add(line,Math.abs(line.dx)>=Math.abs(line.dy)?(p[0]-line.a[0])/line.dx:(p[1]-line.a[1])/line.dy);
   endpoint(a.a,b);endpoint(a.b,b);endpoint(b.a,a);endpoint(b.b,a);
  }
 }
 const breaks:number[]=[],breakEnds:number[]=[];splitXs.sort((a,b)=>a-b);for(const x of splitXs){if(!breaks.length||x-breaks[breaks.length-1]>epsilon){breaks.push(x);breakEnds.push(x);}else breakEnds[breakEnds.length-1]=x;}
 const eventSegments:number[][]=Array.from({length:breaks.length},()=>[]);
 const output:Point[]=[],buckets=new Map<string,number[]>(),seenEdges=new Set<string>(),outputEdges:[number,number][]=[];
 const vertex=(p:Point)=>{const x=Math.floor(p[0]/epsilon),y=Math.floor(p[1]/epsilon);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const v of buckets.get(`${x+dx},${y+dy}`)??[]){const distance=Math.hypot(output[v][0]-p[0],output[v][1]-p[1]);if(distance<=epsilon){if(distance>Number.EPSILON*Math.max(1,Math.abs(p[0]),Math.abs(p[1]))*8)maximalFacesSafe=false;return v;}}const id=output.length;output.push([...p]);const key=`${x},${y}`,row=buckets.get(key);if(row)row.push(id);else buckets.set(key,[id]);return id;};
 // Use the same stable original-coordinate pivots for the full graph and for
 // a subset of visible faces. Culling buried faces must not move a boundary.
 for(const point of sourceVertices)vertex(point);
 // Register endpoints first, so an interior cut never replaces an endpoint.
 const ends=lines.map(({a,b})=>[vertex(a),vertex(b)] as const);
 lines.forEach((line,e)=>{
  const sorted=line.cuts.sort((a,b)=>a-b),cuts=[0];
  // A long edge may cross an entire visible band inside one merged x-event
  // cluster. Keep its identity so the slab merger cannot miss that transition.
  let priorEvent=-1;
  for(const t of sorted){const x=line.a[0]+line.dx*t,roundoff=Number.EPSILON*Math.max(1,Math.abs(x))*8;let lo=0,hi=breaks.length;while(lo<hi){const mid=(lo+hi)>>>1;if(breaks[mid]<=x+roundoff)lo=mid+1;else hi=mid;}const event=Math.max(0,lo-1);if(event!==priorEvent&&breakEnds[event]-breaks[event]>roundoff)eventSegments[event].push(e);priorEvent=event;}
  for(const t of sorted)if(t>0&&t<1){if((t-cuts[cuts.length-1])*line.length>epsilon&&(1-t)*line.length>epsilon)cuts.push(t);else if(Math.min(Math.abs(t-cuts[cuts.length-1]),1-t)*line.length>Number.EPSILON*Math.max(1,...line.a.map(Math.abs),...line.b.map(Math.abs))*8)maximalFacesSafe=false;}
  cuts.push(1);let prior=ends[e][0];
  for(let i=1;i<cuts.length;i++){
   const t=cuts[i],next=i===cuts.length-1?ends[e][1]:vertex([line.a[0]+line.dx*t,line.a[1]+line.dy*t]);
   if(prior!==next){const key=prior<next?`${prior},${next}`:`${next},${prior}`;if(!seenEdges.has(key)){seenEdges.add(key);outputEdges.push([prior,next]);}}prior=next;
  }
 });
 return {vertices_coords:output,edges_vertices:outputEdges,sourceVertices,sourceSegments,originalSegments,sourceSegmentOrigins,sourceSegmentPoints,breaks,breakEnds,eventSegments,maximalFacesSafe};
}
