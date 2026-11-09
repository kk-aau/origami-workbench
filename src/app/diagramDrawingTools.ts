import type {Point} from '../core/types';
import {overlappingSegmentPairs} from '../core/segmentPairs';
import type {DiagramAnnotation,DiagramLineAnnotation,DiagramSymbolAnnotation} from './diagramAnnotations';
import {DIAGRAM_ANNOTATION_LIMITS,validateDiagramAnnotations} from './diagramAnnotations';
import {symbolNativeGrips,pointHitsDiagramSymbol,symbolIntersectsSegment,symbolIntersectsBox,type DiagramAnnotationBounds} from './diagramAnnotationSVG';
import {diagramSnapGrid,diagramGridNodes,diagramGridAxes,type DiagramSnapGrid} from './diagramGrid';

const EPS=1e-9;
const sub=(a:Point,b:Point):Point=>[a[0]-b[0],a[1]-b[1]];
const add=(a:Point,b:Point):Point=>[a[0]+b[0],a[1]+b[1]];
const mul=(a:Point,n:number):Point=>[a[0]*n,a[1]*n];
const cross=(a:Point,b:Point)=>a[0]*b[1]-a[1]*b[0];
const dot=(a:Point,b:Point)=>a[0]*b[0]+a[1]*b[1];
const magnitude=(a:Point)=>Math.hypot(a[0],a[1]);
const normalize=(a:Point):Point|null=>{const d=magnitude(a);return d>EPS?mul(a,1/d):null;};
const normalAngle=(angle:number)=>((angle%360)+360)%360;
const finitePoint=(p:Point)=>p.length===2&&p.every(Number.isFinite);

export interface DiagramIntersection {point:Point;t:number;u:number}
/** Intersect the two supporting lines, preserving parameters for finite/ray tools. */
export function intersectDiagramLines(a:Pick<DiagramLineAnnotation,'a'|'b'>,b:Pick<DiagramLineAnnotation,'a'|'b'>):DiagramIntersection|null {
  const v=sub(a.b,a.a),w=sub(b.b,b.a),denom=cross(v,w);
  if(Math.abs(denom)<=EPS*Math.max(1,magnitude(v)*magnitude(w)))return null;
  const d=sub(b.a,a.a),t=cross(d,w)/denom,u=cross(d,v)/denom;
  return {point:add(a.a,mul(v,t)),t,u};
}
export function diagramLineIntersections(lines:readonly DiagramLineAnnotation[],limit=Infinity):Point[] {
  const points:Point[]=[],seen=new Set<string>(),references=lines.slice(0,limit).filter(line=>finitePoint(line.a)&&finitePoint(line.b));
  for(const [i,j] of overlappingSegmentPairs(references,EPS)){
    const hit=intersectDiagramLines(references[i],references[j]);
    if(hit&&hit.t>=-EPS&&hit.t<=1+EPS&&hit.u>=-EPS&&hit.u<=1+EPS){
      const key=hit.point.map(value=>value.toFixed(8)).join(',');
      if(!seen.has(key)){seen.add(key);points.push(hit.point);}
    }
  }
  return points;
}
/** Query only finite references within the screen tolerance. Large patterns do
 * not need every global crossing materialised for a single pointer position. */
export function diagramNearbyLineIntersections(pointer:Point,lines:readonly DiagramLineAnnotation[],radius:number):Point[] {
  if(!finitePoint(pointer)||!Number.isFinite(radius)||radius<=0)return [];
  const nearby=lines.filter(line=>finitePoint(line.a)&&finitePoint(line.b)&&
    pointer[0]>=Math.min(line.a[0],line.b[0])-radius&&pointer[0]<=Math.max(line.a[0],line.b[0])+radius&&
    pointer[1]>=Math.min(line.a[1],line.b[1])-radius&&pointer[1]<=Math.max(line.a[1],line.b[1])+radius&&
    pointDiagramLineDistance(pointer,line)<=radius);
  return diagramLineIntersections(nearby).filter(point=>magnitude(sub(point,pointer))<=radius);
}
/** Exact crossings of a finite crease and the visible horizontal/vertical grid.
 * The nearest two grid coordinates around its perpendicular foot suffice, even
 * when the grid is much denser than the pointer tolerance. */
export function diagramGridLineIntersections(pointer:Point,lines:readonly Pick<DiagramLineAnnotation,'a'|'b'>[],spacing:number|DiagramSnapGrid|undefined,radius:number,diagonalSpacing?:number):Point[] {
  const grid=diagramSnapGrid(typeof spacing==='object'?spacing:undefined,typeof spacing==='number'?spacing:undefined);
  if(!finitePoint(pointer)||!grid||!Number.isFinite(radius)||radius<=0)return [];
  const result:Point[]=[],seen=new Set<string>();
  const axes=diagramGridAxes(grid,diagonalSpacing);
  for(const line of lines){
    if(!finitePoint(line.a)||!finitePoint(line.b)||pointDiagramLineDistance(pointer,line)>radius)continue;
    const edge=sub(line.b,line.a),den=dot(edge,edge);if(den<=EPS*EPS)continue;
    const foot=add(line.a,mul(edge,Math.max(0,Math.min(1,dot(sub(pointer,line.a),edge)/den))));
    for(const {normal,step} of axes){
      const change=dot(edge,normal);if(Math.abs(change)<=EPS)continue;
      const index=Math.floor(dot(sub(foot,grid.origin),normal)/step);
      for(const offset of [0,1]){
        const t=((index+offset)*step-dot(sub(line.a,grid.origin),normal))/change;if(t< -EPS||t>1+EPS)continue;
        const point=add(line.a,mul(edge,Math.max(0,Math.min(1,t))));
        if(magnitude(sub(point,pointer))>radius)continue;
        const key=point.map(value=>value.toFixed(8)).join(',');if(seen.has(key))continue;
        seen.add(key);result.push(point);
      }
    }
  }
  return result;
}
export interface DiagramSnapOptions {
  enabled:boolean;radius:number;targets:Point[];gridSpacing?:number;grid?:DiagramSnapGrid;anchor?:Point;constrain?:boolean;
}
/** All candidates are compared to one fixed point; Shift always preserves its 45° ray. */
export function snapDiagramPoint(point:Point,{enabled,radius,targets,gridSpacing,grid,anchor,constrain=false}:DiagramSnapOptions):Point {
  let candidate:Point=[...point],direction:Point|null=null;
  if(anchor&&constrain){
    const delta=sub(candidate,anchor),angle=Math.round(Math.atan2(delta[1],delta[0])/(Math.PI/4))*Math.PI/4;
    direction=[Math.cos(angle),Math.sin(angle)];candidate=add(anchor,mul(direction,magnitude(delta)));
  }
  if(!enabled)return candidate;
  function nearest(possible:Point[]):Point|null {
    let best:Point|null=null,distance=radius;
    for(const target of possible){
      if(!finitePoint(target))continue;
      if(direction&&anchor){const delta=sub(target,anchor);if(Math.abs(cross(delta,direction))>1e-6||dot(delta,direction)<-EPS)continue;}
      const d=magnitude(sub(target,candidate));
      if(d<distance||d===distance&&best&&(target[0]<best[0]||target[0]===best[0]&&target[1]<best[1])){distance=d;best=target;}
    }
    return best?[...best]:null;
  }
  // Real corners and intersections remain selectable even if a grid node is closer.
  const explicit=nearest(targets);if(explicit)return explicit;
  const lattice=diagramSnapGrid(grid,gridSpacing);
  return (lattice?nearest(diagramGridNodes(candidate,lattice)):null)??candidate;
}
/** CAD symbol grips prefer explicit native points, then finite edges, then the grid. */
export function snapDiagramSymbolPoint(point:Point,options:DiagramSnapOptions&{lines?:DiagramLineAnnotation[]}):Point {
  const {enabled,radius,targets,gridSpacing,grid,anchor,constrain=false,lines=[]}=options;
  const candidate=snapDiagramPoint(point,{...options,enabled:false});
  if(!enabled)return candidate;
  let direction:Point|null=null;
  if(anchor&&constrain) {
    const delta=sub(point,anchor),angle=Math.round(Math.atan2(delta[1],delta[0])/(Math.PI/4))*Math.PI/4;
    direction=[Math.cos(angle),Math.sin(angle)];
  }
  function nearest(points:Point[]):Point|null {
    let best:Point|null=null,distance=radius;
    for(const target of points) {
      if(!finitePoint(target))continue;
      if(direction&&anchor){const delta=sub(target,anchor);if(Math.abs(cross(delta,direction))>1e-6||dot(delta,direction)<-EPS)continue;}
      const d=magnitude(sub(target,candidate));if(d<distance){distance=d;best=target;}
    }
    return best?[...best]:null;
  }
  const explicit=nearest(targets);if(explicit)return explicit;
  const edgePoints:Point[]=[];
  for(const line of lines) {
    if(!finitePoint(line.a)||!finitePoint(line.b))continue;
    if(candidate[0]<Math.min(line.a[0],line.b[0])-radius||candidate[0]>Math.max(line.a[0],line.b[0])+radius||
        candidate[1]<Math.min(line.a[1],line.b[1])-radius||candidate[1]>Math.max(line.a[1],line.b[1])+radius)continue;
    if(direction&&anchor) {
      const hit=intersectDiagramLines({a:anchor,b:add(anchor,direction)},line);
      if(hit) {
        if(hit.t>=-EPS&&hit.u>=-EPS&&hit.u<=1+EPS)edgePoints.push(hit.point);
        continue;
      }
      // A collinear edge can offer a clipped nearest point on the same ray.
      if(Math.abs(cross(sub(line.a,anchor),direction))>1e-6||Math.abs(cross(sub(line.b,anchor),direction))>1e-6)continue;
    }
    const edge=sub(line.b,line.a),denom=dot(edge,edge);
    const t=denom>0?Math.max(0,Math.min(1,dot(sub(candidate,line.a),edge)/denom)):0;
    edgePoints.push(add(line.a,mul(edge,t)));
  }
  const edge=nearest(edgePoints);if(edge)return edge;
  return snapDiagramPoint(point,{enabled:true,radius,targets:[],gridSpacing,grid,anchor,constrain});
}
export type DiagramAxisSnapOptions=Pick<DiagramSnapOptions,'enabled'|'radius'|'targets'|'gridSpacing'|'grid'>&{lines?:DiagramLineAnnotation[]};
/** Resize along the original baseline; every snapped result remains on that axis. */
export function snapDiagramSymbolAxisPoint(pointer:Point,center:Point,axisEndpoint:Point,
    {enabled,radius,targets,gridSpacing,grid,lines=[]}:DiagramAxisSnapOptions):Point {
  const direction=normalize(sub(axisEndpoint,center));if(!direction)return [...center];
  const project=(p:Point):Point=>add(center,mul(direction,dot(sub(p,center),direction)));
  const candidate=project(pointer);if(!enabled)return candidate;
  function nearest(points:Point[]):Point|null {
    let best:Point|null=null,distance=radius;
    for(const point of points) {
      if(!finitePoint(point)||Math.abs(cross(sub(point,center),direction!))>1e-6)continue;
      const onAxis=project(point),d=magnitude(sub(onAxis,candidate));
      if(d<distance){distance=d;best=onAxis;}
    }
    return best;
  }
  const explicit=nearest(targets);if(explicit)return explicit;
  const crossings:Point[]=[];
  for(const line of lines) {
    if(!finitePoint(line.a)||!finitePoint(line.b))continue;
    if(candidate[0]<Math.min(line.a[0],line.b[0])-radius||candidate[0]>Math.max(line.a[0],line.b[0])+radius||
        candidate[1]<Math.min(line.a[1],line.b[1])-radius||candidate[1]>Math.max(line.a[1],line.b[1])+radius)continue;
    const hit=intersectDiagramLines({a:center,b:add(center,direction)},line);
    if(hit&&hit.u>=-EPS&&hit.u<=1+EPS)crossings.push(hit.point);
  }
  const crossing=nearest(crossings);if(crossing)return crossing;
  const gridPoints:Point[]=[];
  const lattice=diagramSnapGrid(grid,gridSpacing);
  if(lattice) {
    for(const {normal,step} of diagramGridAxes(lattice)) {
      const change=dot(direction,normal);if(Math.abs(change)<=EPS)continue;
      const closest=Math.round(dot(sub(candidate,lattice.origin),normal)/step);
      for(let offset=-1;offset<=1;offset++) {
        const t=((closest+offset)*step-dot(sub(center,lattice.origin),normal))/change;
        gridPoints.push(add(center,mul(direction,t)));
      }
    }
  }
  return nearest(gridPoints)??candidate;
}
/** A rotation grip snaps in the drawing, while Shift constrains the actual baseline angle. */
export function snapDiagramSymbolRotationPoint(pointer:Point,center:Point,baselineAngle:number,
    options:DiagramAxisSnapOptions&{constrain?:boolean}):Point {
  const delta=sub(pointer,center),distance=magnitude(delta);
  if(distance<=EPS)return [...pointer];
  const targets=options.targets.filter(target=>finitePoint(target)&&magnitude(sub(target,center))>EPS);
  if(!options.constrain){
    const snapped=snapDiagramSymbolPoint(pointer,{...options,targets});
    return magnitude(sub(snapped,center))>EPS?snapped:[...pointer];
  }
  const normal=baselineAngle*Math.PI/180+Math.PI/2;
  const change=Math.atan2(Math.sin(Math.atan2(delta[1],delta[0])-normal),Math.cos(Math.atan2(delta[1],delta[0])-normal));
  const aligned=(Math.round((baselineAngle+change*180/Math.PI)/15)*15+90)*Math.PI/180;
  const direction:Point=[Math.cos(aligned),Math.sin(aligned)],candidate=add(center,mul(direction,distance));
  const point=snapDiagramSymbolAxisPoint(candidate,center,candidate,{...options,targets});
  return dot(sub(point,center),direction)>EPS?point:candidate;
}
/** A group move uses one anchor and one common delta, preserving relative positions. */
export function snapDiagramTranslation(anchor:Point,delta:Point,options:Pick<DiagramSnapOptions,'enabled'|'radius'|'targets'|'gridSpacing'|'grid'>):Point {
  return sub(snapDiagramPoint(add(anchor,delta),options),anchor);
}
/** Exclude moved drawing endpoints and their intersections, retaining independent references. */
export function diagramMoveSnapTargets(annotations:DiagramAnnotation[],ids:string[],modelVertices:Point[]=[],modelLines:DiagramLineAnnotation[]=[]):Point[] {
  const selected=new Set(ids),lines=[...modelLines,...annotations.filter((a):a is DiagramLineAnnotation=>a.kind==='line'&&!selected.has(a.id))];
  const symbolAnchors=annotations.filter((a):a is DiagramSymbolAnnotation=>a.kind==='symbol'&&!selected.has(a.id))
    .flatMap(annotation=>symbolNativeGrips(annotation).filter(grip=>grip.kind==='anchor'||grip.kind==='endpoint').map(grip=>grip.point));
  return [...modelVertices,...lines.flatMap(line=>[line.a,line.b]),...diagramLineIntersections(lines),...symbolAnchors];
}
export function pointDiagramLineDistance(p:Point,line:Pick<DiagramLineAnnotation,'a'|'b'>):number {
  const direction=sub(line.b,line.a),denom=dot(direction,direction);
  const t=denom>EPS?Math.max(0,Math.min(1,dot(sub(p,line.a),direction)/denom)):0;
  return magnitude(sub(p,add(line.a,mul(direction,t))));
}
export function pointHitsDiagramAnnotation(p:Point,a:DiagramAnnotation,tolerance:number):boolean {
  if(a.kind==='line')return pointDiagramLineDistance(p,a)<=tolerance+a.width/2;
  return pointHitsDiagramSymbol(a,p,tolerance);
}
export function pickDiagramAnnotation(annotations:DiagramAnnotation[],point:Point,tolerance:number):DiagramAnnotation|null {
  for(let i=annotations.length-1;i>=0;i--)if(pointHitsDiagramAnnotation(point,annotations[i],tolerance))return annotations[i];
  return null;
}
function inside(p:Point,box:DiagramAnnotationBounds):boolean {return p[0]>=box.x-EPS&&p[0]<=box.x+box.width+EPS&&p[1]>=box.y-EPS&&p[1]<=box.y+box.height+EPS;}
function segmentIntersectsBox(a:Point,b:Point,box:DiagramAnnotationBounds):boolean {
  if(inside(a,box)||inside(b,box))return true;
  const x=box.x,y=box.y,w=box.width,h=box.height;
  const corners:Point[]=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
  return corners.some((p,i)=>{const hit=intersectDiagramLines({a,b},{a:p,b:corners[(i+1)%4]});return !!hit&&hit.t>=-EPS&&hit.t<=1+EPS&&hit.u>=-EPS&&hit.u<=1+EPS;});
}
export function diagramAnnotationsInBox(annotations:DiagramAnnotation[],a:Point,b:Point):string[] {
  const box={x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),width:Math.abs(b[0]-a[0]),height:Math.abs(b[1]-a[1])};
  return annotations.filter(annotation=>{
    if(annotation.kind==='line')return segmentIntersectsBox(annotation.a,annotation.b,box);
    return symbolIntersectsBox(annotation,a,b);
  }).map(a=>a.id);
}
/** Use swept segments rather than sampled cursor points, so fast erasing never skips lines. */
export function diagramEraseHits(annotations:DiagramAnnotation[],from:Point,to:Point,tolerance:number):string[] {
  return annotations.filter(a=>{
    if(a.kind==='line'){
      const hit=intersectDiagramLines(a,{a:from,b:to});
      if(hit&&hit.t>=0&&hit.t<=1&&hit.u>=0&&hit.u<=1)return true;
      return Math.min(pointDiagramLineDistance(from,a),pointDiagramLineDistance(to,a),pointDiagramLineDistance(a.a,{a:from,b:to}),pointDiagramLineDistance(a.b,{a:from,b:to}))<=tolerance+a.width/2;
    }
    return symbolIntersectsSegment(a,from,to,tolerance);
  }).map(a=>a.id);
}

/** A finite construction through a point, independent of CP and model geometry. */
export function constructDiagramLine(reference:DiagramLineAnnotation,through:Point,kind:'parallel'|'perpendicular',length:number):{a:Point;b:Point}|null {
  const unit=normalize(sub(reference.b,reference.a));if(!unit||!finitePoint(through)||!Number.isFinite(length)||length<=0)return null;
  const direction:Point=kind==='perpendicular'?[-unit[1],unit[0]]:unit,half=mul(direction,length/2);
  return {a:sub(through,half),b:add(through,half)};
}
/** Select the closest of the internal/external bisector rays using the indicated endpoint. */
export function bisectDiagramLines(first:DiagramLineAnnotation,second:DiagramLineAnnotation,end:Point):{a:Point;b:Point}|null {
  const hit=intersectDiagramLines(first,second),u=normalize(sub(first.b,first.a)),v=normalize(sub(second.b,second.a));
  if(!hit||!u||!v)return null;
  const delta=sub(end,hit.point),directions=[normalize(add(u,v)),normalize(sub(u,v))].filter((p):p is Point=>!!p);
  let chosen:Point|null=null,projection=0,distance=Infinity;
  for(const direction of directions){const d=dot(delta,direction),error=magnitude(sub(delta,mul(direction,d)));if(Math.abs(d)>EPS&&error<distance){distance=error;chosen=direction;projection=d;}}
  return chosen?{a:[...hit.point],b:add(hit.point,mul(chosen,projection))}:null;
}
function lineCuts(line:DiagramLineAnnotation,lines:DiagramLineAnnotation[]):number[] {
  const values=lines.filter(l=>l.id!==line.id).flatMap(other=>{const hit=intersectDiagramLines(line,other);return hit&&hit.u>=-EPS&&hit.u<=1+EPS&&hit.t>EPS&&hit.t<1-EPS?[hit.t]:[];});
  return [...new Set(values.map(n=>Math.round(n/EPS)*EPS))].sort((a,b)=>a-b);
}
/** Remove exactly the interval under the pointer, preserving the remaining line pieces. */
export function trimDiagramLine(line:DiagramLineAnnotation,lines:DiagramLineAnnotation[],point:Point,idFactory=()=>crypto.randomUUID()):DiagramLineAnnotation[]|null {
  const cuts=lineCuts(line,lines);if(!cuts.length)return null;
  const direction=sub(line.b,line.a),t=Math.max(0,Math.min(1,dot(sub(point,line.a),direction)/dot(direction,direction))),boundaries=[0,...cuts,1];
  let low=0,high=1;for(let i=0;i<boundaries.length-1;i++)if(t>=boundaries[i]-EPS&&t<=boundaries[i+1]+EPS){low=boundaries[i];high=boundaries[i+1];break;}
  const result:DiagramLineAnnotation[]=[];
  if(low>EPS)result.push({...structuredClone(line),b:add(line.a,mul(direction,low))});
  if(high<1-EPS)result.push({...structuredClone(line),id:result.length?idFactory():line.id,a:add(line.a,mul(direction,high))});
  return result;
}
/** Extend only the clicked near endpoint to the first finite crossing with another line. */
export function extendDiagramLine(line:DiagramLineAnnotation,lines:DiagramLineAnnotation[],point:Point):DiagramLineAnnotation|null {
  const atStart=magnitude(sub(point,line.a))<magnitude(sub(point,line.b));
  const hits=lines.filter(l=>l.id!==line.id).flatMap(other=>{const hit=intersectDiagramLines(line,other);return hit&&hit.u>=-EPS&&hit.u<=1+EPS&&(atStart?hit.t< -EPS:hit.t>1+EPS)?[hit]:[];});
  hits.sort((a,b)=>atStart?b.t-a.t:a.t-b.t);const hit=hits[0];
  return hit?{...structuredClone(line),...(atStart?{a:hit.point}:{b:hit.point})}:null;
}

export type DiagramTransform={kind:'translate';delta:Point}|{kind:'rotate';center:Point;angle:number}|{kind:'scale';center:Point;factor:number}|{kind:'mirror';axis:'x'|'y';center:Point}|{kind:'mirrorLine';a:Point;b:Point};
/** Transform the drawing overlay only; CPs and step poses are intentionally absent. */
export function transformDiagramAnnotations(annotations:DiagramAnnotation[],ids:string[],transform:DiagramTransform):DiagramAnnotation[] {
  if(transform.kind==='scale'&&(!Number.isFinite(transform.factor)||transform.factor<=0))throw new Error('缩放倍数必须为有限正数。');
  if(transform.kind==='rotate'&&!Number.isFinite(transform.angle))throw new Error('旋转角度必须是有限数字。');
  let mirrorDirection:Point|undefined;
  if(transform.kind==='mirrorLine'){
    if(!finitePoint(transform.a)||!finitePoint(transform.b))throw new Error('镜像轴的两个端点必须是有限坐标。');
    const direction=sub(transform.b,transform.a),length=magnitude(direction);
    if(!Number.isFinite(length)||length<=EPS)throw new Error('镜像轴的两个端点不能重合或过近。');
    mirrorDirection=mul(direction,1/length);
  }
  const selected=new Set(ids),r=transform.kind==='rotate'?transform.angle*Math.PI/180:0;
  function project(p:Point):Point {
    if(transform.kind==='translate')return add(p,transform.delta);
    if(transform.kind==='mirrorLine'){
      const delta=sub(p,transform.a);
      return add(transform.a,sub(mul(mirrorDirection!,2*dot(delta,mirrorDirection!)),delta));
    }
    const d=sub(p,transform.center);
    if(transform.kind==='scale')return add(transform.center,mul(d,transform.factor));
    if(transform.kind==='rotate')return add(transform.center,[d[0]*Math.cos(r)-d[1]*Math.sin(r),d[0]*Math.sin(r)+d[1]*Math.cos(r)]);
    return add(transform.center,transform.axis==='x'?[d[0],-d[1]]:[-d[0],d[1]]);
  }
  const next=annotations.map(a=>{
    const cloned=structuredClone(a);if(!selected.has(a.id))return cloned;
    if(cloned.kind==='line')return {...cloned,a:project(cloned.a),b:project(cloned.b)};
    const symbol:DiagramSymbolAnnotation={...cloned,position:project(cloned.position)};
    if(transform.kind==='rotate')symbol.rotation=normalAngle(symbol.rotation+transform.angle);
    if(transform.kind==='scale')symbol.size*=transform.factor;
    if(transform.kind==='mirror'){
      symbol.rotation=normalAngle(transform.axis==='x'?180-symbol.rotation:-symbol.rotation);
      symbol.mirrored=!symbol.mirrored;
    }
    if(transform.kind==='mirrorLine'){
      symbol.rotation=normalAngle(2*Math.atan2(mirrorDirection![1],mirrorDirection![0])*180/Math.PI+180-symbol.rotation);
      symbol.mirrored=!symbol.mirrored;
    }
    return symbol;
  });
  validateDiagramAnnotations(next);return next;
}
export function copyDiagramAnnotations(annotations:DiagramAnnotation[],ids:string[],offset:Point):{annotations:DiagramAnnotation[];ids:string[]} {
  const selected=new Set(ids),copies=transformDiagramAnnotations(annotations.filter(a=>selected.has(a.id)),ids,{kind:'translate',delta:offset}),allIds=new Set(annotations.map(a=>a.id));
  const copiedIds=new Map<string,string>();
  for(const copy of copies){const old=copy.id;do{copy.id=crypto.randomUUID();}while(allIds.has(copy.id));allIds.add(copy.id);copiedIds.set(old,copy.id);}
  for(const copy of copies)if(copy.kind==='line'&&copy.animationTiming)copy.animationTiming={...copy.animationTiming,afterLineId:copiedIds.get(copy.animationTiming.afterLineId)??copy.animationTiming.afterLineId};
  return {annotations:[...structuredClone(annotations),...copies],ids:copies.map(a=>a.id)};
}

/** Reflect copies across a drawn axis. Fresh ids make every copy independent of
 * its source CP identity; paper-face targeting remains the caller's decision. */
export function mirrorCopyDiagramAnnotations(annotations:DiagramAnnotation[],ids:string[],axisStart:Point,axisEnd:Point):{annotations:DiagramAnnotation[];ids:string[]} {
  validateDiagramAnnotations(annotations);
  const selected=new Set(ids),sources=annotations.filter(annotation=>selected.has(annotation.id));
  const copies=transformDiagramAnnotations(sources,ids,{kind:'mirrorLine',a:axisStart,b:axisEnd}),allIds=new Set(annotations.map(annotation=>annotation.id));
  const copiedIds=new Map<string,string>();
  for(const copy of copies){const old=copy.id;do{copy.id=crypto.randomUUID();}while(allIds.has(copy.id));allIds.add(copy.id);copiedIds.set(old,copy.id);}
  for(const copy of copies)if(copy.kind==='line'&&copy.animationTiming)copy.animationTiming={...copy.animationTiming,afterLineId:copiedIds.get(copy.animationTiming.afterLineId)??copy.animationTiming.afterLineId};
  const next=[...structuredClone(annotations),...copies];
  validateDiagramAnnotations(next);
  return {annotations:next,ids:copies.map(annotation=>annotation.id)};
}

/** Expand around the same center to the SVG viewport aspect ratio, with uniform units. */
export function diagramVisibleRect(rect:DiagramAnnotationBounds,size:{width:number;height:number}):DiagramAnnotationBounds {
  const units=Math.max(rect.width/Math.max(1,size.width),rect.height/Math.max(1,size.height)),width=size.width*units,height=size.height*units;
  return {x:rect.x+(rect.width-width)/2,y:rect.y+(rect.height-height)/2,width,height};
}
