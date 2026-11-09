import type {Point} from '../core/types';
import type {ModelLayerRegion} from './modelRegionLayers';
import type {ModelRegionBoundaries} from './modelRegionBoundaries';

export interface ModelRegionShadow {
 a:Point;b:Point;inward:Point;upperFace:number;lowerFace:number;
 /** Union of visible cells of the receiving face, excluding holes/occluded cells. */
 clipRegions:number[];
}
export interface ModelRegionShadows {strips:ModelRegionShadow[];ambiguousEdges:number}

/** Local order only: no global face order or face-number tie breaking.
 * Coordinates stay in model space; renderers project endpoints and normals.
 * This describes 10-unit illustrative strips, not physical lighting/cloth thickness.
 */
export function modelRegionShadows(regions:ModelLayerRegion[],boundaries:ModelRegionBoundaries,epsilon=1e-8):ModelRegionShadows{
 if(!Number.isFinite(epsilon)||epsilon<=0)throw new Error('局部阴影计算精度必须是有限正数。');
 const visible=new Map<number,number[]>();
 regions.forEach((r,i)=>{
  if(r.layers.status!=='ordered')return;
  const order=r.layers.topToBottom;
  if(!order.length||order.length!==r.faces.length||new Set(order).size!==order.length||order.some(id=>!Number.isInteger(id)||id<0||!r.faces.includes(id)))throw new Error('局部阴影纸面层序无效。');
  const list=visible.get(order[0])??[];list.push(i);visible.set(order[0],list);
 });
 const strips:ModelRegionShadow[]=[];let ambiguousEdges=boundaries.ambiguousEdges;
 if(!Number.isInteger(ambiguousEdges)||ambiguousEdges<0)throw new Error('局部阴影边界状态无效。');
 for(const edge of boundaries.edges){
  if([edge.a,edge.b].some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)))||[edge.leftRegion,edge.rightRegion].some(i=>i!==null&&(!Number.isInteger(i)||i<0||i>=regions.length)))throw new Error('局部阴影边界无效。');
  if(edge.leftRegion===null||edge.rightRegion===null)continue; // no exterior/hole shadows
  const left=regions[edge.leftRegion].layers,right=regions[edge.rightRegion].layers;
  if(left.status!=='ordered'||right.status!=='ordered'){ambiguousEdges++;continue;}
  const l=left.topToBottom[0],r=right.topToBottom[0];if(l===r)continue;
  const leftAbove=left.topToBottom.includes(r),rightAbove=right.topToBottom.includes(l);
  if(leftAbove&&rightAbove){ambiguousEdges++;continue;} // contradictory local transition
  if(!leftAbove&&!rightAbove)continue; // adjacent non-overlapping faces
  const dx=edge.b[0]-edge.a[0],dy=edge.b[1]-edge.a[1],length=Math.hypot(dx,dy);
  if(length<=epsilon){ambiguousEdges++;continue;}
  const sign=leftAbove?-1:1,upperFace=leftAbove?l:r,lowerFace=leftAbove?r:l;
  strips.push({a:[...edge.a],b:[...edge.b],inward:[-dy/length*sign,dx/length*sign],upperFace,lowerFace,clipRegions:[...visible.get(lowerFace)!]});
 }
 return {strips,ambiguousEdges};
}
