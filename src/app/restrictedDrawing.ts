import {validateDoc,type Assignment,type Doc,type Point,type Segment} from '../core/types';
import {distance} from '../core/geometry';
import {line} from './state';
import {appendCircle,circleGeometry} from './circleTools';
import {overlayDrawnSegments} from './drawOverlay';
import {applyDrawingFoldAngle} from './foldAngles';
import type {Bounds} from './paper';
import {gridLatticeNodes,gridToWorld,gridToLocal,type GridPattern} from './gridGeometry';
import {diagramGridLineIntersections} from './diagramDrawingTools';

export interface RestrictedAnchors {
  /** Actual vertices, not synthetic circle quadrant anchors. Memoize in caller. */
  vertices:readonly Point[];
  centers:readonly Point[];
  /** Displayed finite references only; never snap to arbitrary line bodies. */
  segments?:readonly Pick<Segment,'a'|'b'>[];
  /** Omit for hidden grid; bounds omit for full-plane grid. */
  grid?:{origin:Point;step:number;stepY?:number;pattern?:GridPattern;diagonal?:boolean;diagonalAngle?:number;rotation?:number;bounds?:Bounds;contains?:(point:Point)=>boolean};
}
const valid=(p:Point)=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6);

/** Endpoints beat circle centers, which beat grid on exact ties. O(n), no sorting. */
export function restrictedDrawingPoint(position:Point,radius:number,anchors:RestrictedAnchors):Point|null {
  if(!valid(position)||!Number.isFinite(radius)||radius<0)throw new Error('受限取点的位置或容差无效。');
  let best=radius,nearest:Point|null=null;
  function consider(p:Point){
    if(!valid(p))return;
    const d=distance(position,p);
    if(d<=best&&(!nearest||d<best)){best=d;nearest=p;}
  }
  anchors.vertices.forEach(consider);anchors.centers.forEach(consider);
  if(anchors.grid){
    const {origin,step,bounds,contains}=anchors.grid;
    const triangular=anchors.grid.pattern==='triangular';
    const stepY=triangular?step*Math.sqrt(3)/2:anchors.grid.stepY??step,steps=[step,stepY];
    if(!valid(origin)||steps.some(n=>!Number.isFinite(n)||n<=0))throw new Error('受限网格的原点或格距无效。');
    if(bounds&&(![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite)||bounds.width<0||bounds.height<0))throw new Error('受限网格范围无效。');
    const lattice={origin,stepX:step,stepY,pattern:anchors.grid.pattern,diagonal:anchors.grid.diagonal,diagonalAngle:anchors.grid.diagonalAngle,rotation:anchors.grid.rotation};
    if(!triangular&&(anchors.grid.pattern==='square'||anchors.grid.rotation)){
      const local=gridToLocal(position,lattice);
      const visible=(candidate:Point)=>(!bounds||candidate[0]>=bounds.x-1e-9&&candidate[0]<=bounds.x+bounds.width+1e-9&&candidate[1]>=bounds.y-1e-9&&candidate[1]<=bounds.y+bounds.height+1e-9)&&(!contains||contains(candidate));
      // Rotation preserves distances, but the world paper mask must not clamp
      // indices in the rotated local lattice. Enumerate only the pointer band.
      const offsets=anchors.grid.pattern==='square'&&anchors.grid.diagonal&&anchors.grid.diagonalAngle===undefined?[0,.5]:[0];
      let count=0;
      for(const offset of offsets){
        const left=Math.ceil((local[0]-best)/step-offset-1e-10),right=Math.floor((local[0]+best)/step-offset+1e-10);
        const top=Math.ceil((local[1]-best)/stepY-offset-1e-10),bottom=Math.floor((local[1]+best)/stepY-offset+1e-10);
        count+=Math.max(0,right-left+1)*Math.max(0,bottom-top+1);if(count>10000)throw new Error('网格过密，请放大画布后选择可见网格点。');
        for(let x=left;x<=right;x++)for(let y=top;y<=bottom;y++){
          const candidate=gridToWorld([(x+offset)*step,(y+offset)*stepY],lattice);
          if(visible(candidate))consider(candidate);
        }
      }
      if(anchors.grid.diagonal&&anchors.grid.diagonalAngle!==undefined){
        for(const candidate of gridLatticeNodes(position,lattice))if(visible(candidate))consider(candidate);
      }
    }else if(triangular){
      let first=Math.ceil((position[1]-best-origin[1])/stepY),last=Math.floor((position[1]+best-origin[1])/stepY);
      if(bounds){first=Math.max(first,Math.ceil((bounds.y-origin[1])/stepY));last=Math.min(last,Math.floor((bounds.y+bounds.height-origin[1])/stepY));}
      if(last-first+1>10000)throw new Error('网格过密，请放大画布后选择可见网格点。');
      let count=0;
      for(let row=first;row<=last;row++){
        const offset=row/2;
        let left=Math.ceil((position[0]-best-origin[0])/step-offset),right=Math.floor((position[0]+best-origin[0])/step-offset);
        if(bounds){left=Math.max(left,Math.ceil((bounds.x-origin[0])/step-offset));right=Math.min(right,Math.floor((bounds.x+bounds.width-origin[0])/step-offset));}
        count+=Math.max(0,right-left+1);if(count>10000)throw new Error('网格过密，请放大画布后选择可见网格点。');
        for(let column=left;column<=right;column++){
          const candidate:Point=[origin[0]+(column+offset)*step,origin[1]+row*stepY];
          if(!contains||contains(candidate))consider(candidate);
        }
      }
    }else{
    if(anchors.grid.diagonal&&anchors.grid.diagonalAngle!==undefined){
      for(const candidate of gridLatticeNodes(position,{origin,stepX:step,stepY,diagonal:true,diagonalAngle:anchors.grid.diagonalAngle})){
        if(bounds&&(candidate[0]<bounds.x||candidate[0]>bounds.x+bounds.width||candidate[1]<bounds.y||candidate[1]>bounds.y+bounds.height))continue;
        if(!contains||contains(candidate))consider(candidate);
      }
    }
    const indices=position.map((n,i)=>{
      const spacing=steps[i],index=Math.round((n-origin[i])/spacing);
      if(!bounds)return index;
      const start=i===0?bounds.x:bounds.y,end=start+(i===0?bounds.width:bounds.height);
      const min=Math.ceil((start-origin[i])/spacing),max=Math.floor((end-origin[i])/spacing);
      return min>max?NaN:Math.max(min,Math.min(max,index));
    });
    const gridPoint:Point=[origin[0]+indices[0]*step,origin[1]+indices[1]*stepY];
    if(valid(gridPoint)&&(!contains||contains(gridPoint)))consider(gridPoint);
    else if(contains) {
      // Visible editor grids have step > 3 px and radius 11 px, so this is small.
      // Reject pathological invisible grids explicitly rather than freeze input.
      const range=(axis:number)=>{
        const spacing=steps[axis];
        let lo=Math.ceil((position[axis]-best-origin[axis])/spacing),hi=Math.floor((position[axis]+best-origin[axis])/spacing);
        if(bounds){const start=axis===0?bounds.x:bounds.y,end=start+(axis===0?bounds.width:bounds.height);lo=Math.max(lo,Math.ceil((start-origin[axis])/spacing));hi=Math.min(hi,Math.floor((end-origin[axis])/spacing));}
        return [lo,hi];
      };
      const [x0,x1]=range(0),[y0,y1]=range(1);
      if((x1-x0+1)*(y1-y0+1)>10000)throw new Error('网格过密，请放大画布后选择可见网格点。');
      for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){
        const candidate:Point=[origin[0]+x*step,origin[1]+y*stepY];
        if(valid(candidate)&&distance(position,candidate)<=best&&contains(candidate))consider(candidate);
      }
    }
    }
    // The shared resolver queries nearby crossings only. A positive query
    // radius also lets the inclusive radius-zero contract accept exact hits;
    // consider() still enforces the caller's original radius.
    for(const candidate of diagramGridLineIntersections(position,anchors.segments??[],lattice,Math.max(best,1e-9))){
      if(bounds&&(candidate[0]<bounds.x||candidate[0]>bounds.x+bounds.width||candidate[1]<bounds.y||candidate[1]>bounds.y+bounds.height))continue;
      if(!contains||contains(candidate))consider(candidate);
    }
  }
  return nearest?[...nearest] as Point:null;
}

export function restrictedDrawingGeometry(start:Point,end:Point,radius:number,anchors:RestrictedAnchors):{a:Point;b:Point}{
  const a=restrictedDrawingPoint(start,radius,anchors),b=restrictedDrawingPoint(end,radius,anchors);
  if(!a||!b)throw new Error('起点和终点都须靠近已有顶点、圆心、启用的网格点或线与网格交点。');
  if(distance(a,b)<1e-6)throw new Error('两个受限点不能重合，请选择另一个点。');
  return{a,b};
}

/** Validate both endpoints again on commit; publish through normal App.commit. */
export function appendRestrictedDrawing(doc:Doc,kind:'line'|'circle',start:Point,end:Point,radius:number,anchors:RestrictedAnchors,assignment:Assignment,lockBoundary=false,drawingAngle?:number|null):Doc {
  validateDoc(doc);
  const {a,b}=restrictedDrawingGeometry(start,end,radius,anchors);
  if(kind==='circle')return appendCircle(doc,circleGeometry(a,distance(a,b)));
  return overlayDrawnSegments(doc,applyDrawingFoldAngle([line(a,b,assignment)],drawingAngle),lockBoundary);
}
