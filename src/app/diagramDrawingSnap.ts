import type {Point} from '../core/types';
import type {DiagramLineAnnotation} from './diagramAnnotations';
import {snapDiagramSymbolPoint,snapDiagramSymbolAxisPoint,diagramNearbyLineIntersections,diagramGridLineIntersections,pointDiagramLineDistance} from './diagramDrawingTools';
import {diagramAnglePoint} from './diagramPrecisionTools';
import {snapDiagramLinePoint,type DiagramLineSnapResult} from './diagramLineSnap';
import {diagramSnapGrid,diagramGridIsNode,type DiagramSnapGrid} from './diagramGrid';

interface DrawingSnapOptions {
  enabled:boolean;radius:number;targets:Point[];lines:readonly DiagramLineAnnotation[];
  /** Reuse geometry prepared when references change, never on each pointer move. */
  intersections?:readonly Point[];
  gridSpacing?:number;gridDiagonalSpacing?:number;grid?:DiagramSnapGrid;anchor?:Point;shiftKey?:boolean;altKey?:boolean;anglePreset?:number;
}
export interface DiagramSnapFeedback {kind:'point'|'intersection'|'grid-intersection'|'edge'|'grid';label:string;point:Point}
export interface DiagramDrawingSnap {point:Point;relation:DiagramLineSnapResult|null;target?:DiagramSnapFeedback}

/** Drawing priority: explicit angle constraints, real points, geometric
 * relations, then the grid. Mark only relations the final segment satisfies. */
export function snapDiagramDrawingLine(pointer:Point,options:DrawingSnapOptions):DiagramDrawingSnap {
  const {anchor,radius,lines,gridSpacing,anglePreset=0,shiftKey=false,altKey=false}=options,enabled=options.enabled&&!altKey;
  const grid=diagramSnapGrid(options.grid,gridSpacing);
  const intersections=enabled?(options.intersections??diagramNearbyLineIntersections(pointer,lines,radius)):[];
  const gridIntersections=enabled?diagramGridLineIntersections(pointer,lines,grid,radius,options.gridDiagonalSpacing):[];
  const targets=enabled?[...options.targets,...intersections,...gridIntersections]:options.targets;
  const base={enabled,radius,targets,gridSpacing,grid,anchor,constrain:shiftKey};
  const separation=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const eps=Math.max(1e-8,radius*1e-6);
  function targetAt(point:Point):DiagramSnapFeedback|undefined {
    if(!enabled)return;
    const kind=options.targets.some(p=>separation(p,point)<=eps)?'point'
      :intersections.some(p=>separation(p,point)<=eps)?'intersection'
      :gridIntersections.some(p=>separation(p,point)<=eps)?'grid-intersection'
      :lines.some(line=>pointDiagramLineDistance(point,line)<=eps)?'edge'
      :grid&&diagramGridIsNode(point,grid,eps)?'grid':undefined;
    return kind?{kind,point:[...point],label:{point:'端点 / 纸角',intersection:'交点','grid-intersection':'折痕与网格交点',edge:'在线段上',grid:'网格点'}[kind]}:undefined;
  }
  if(!anchor){const point=snapDiagramSymbolPoint(pointer,{...base,lines:[...lines]});return {point,relation:null,target:targetAt(point)};}
  const classify=(point:Point):DiagramDrawingSnap=>{
    const candidate=enabled?snapDiagramLinePoint(point,{anchor,lines,radius}):null;
    const delta:Point=[point[0]-anchor[0],point[1]-anchor[1]],length=Math.hypot(...delta);
    const aligned=candidate&&length>eps&&Math.abs(delta[0]*candidate.direction[1]-delta[1]*candidate.direction[0])<=eps&&delta[0]*candidate.direction[0]+delta[1]*candidate.direction[1]>0;
    return {point,relation:aligned?{...candidate,point:[...point]}:null,target:targetAt(point)};
  };
  if(shiftKey)return classify(snapDiagramSymbolPoint(pointer,{...base,lines:[...lines]}));
  if(anglePreset>0&&!altKey)return classify(diagramAnglePoint(anchor,pointer,anglePreset,{radius:enabled?radius:0,vertices:enabled?targets:[],segments:enabled?lines.map(line=>({id:line.id,a:line.a,b:line.b,assignment:'F',angle:0})):[]}));
  if(!enabled)return {point:[...pointer],relation:null};
  let fixed:Point|undefined,distance=radius;
  for(const target of targets){const d=Math.hypot(pointer[0]-target[0],pointer[1]-target[1]);if(d<distance){fixed=target;distance=d;}}
  if(fixed)return classify([...fixed]);
  const relation=snapDiagramLinePoint(pointer,{anchor,lines,radius});
  if(relation){
    // Preserve the detected direction while landing exactly on a nearby finite
    // edge. A second snap must not accumulate into a jump beyond the pointer.
    const point=snapDiagramSymbolAxisPoint(relation.point,anchor,relation.point,{enabled:true,radius,targets:[],lines:[...lines]});
    const delta:Point=[point[0]-anchor[0],point[1]-anchor[1]];
    const endpoint=separation(point,pointer)<=radius+eps&&delta[0]*relation.direction[0]+delta[1]*relation.direction[1]>eps?point:relation.point;
    return {point:endpoint,relation:{...relation,point:[...endpoint]},target:targetAt(endpoint)};
  }
  return classify(snapDiagramSymbolPoint(pointer,{...base,targets:[],lines:[...lines]}));
}
