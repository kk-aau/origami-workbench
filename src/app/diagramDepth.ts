import type {FlatFoldResult,Point} from '../core/types';
import type {DiagramPose} from './diagramProject';
import {isDiagramPaperPoseIsometric} from './diagramPaperPose';

/** Illustration parameters, independent of physical crease angles. */
export interface DiagramDepth {amount:number;direction:number}
export const defaultDiagramDepth=():DiagramDepth=>({amount:.05,direction:135});
const isometryCache=new WeakMap<FlatFoldResult['geometry'],WeakMap<DiagramPose['sourceDoc'],boolean>>();
export function diagramDepthAvailable(pose:Pick<DiagramPose,'result'|'sourceDoc'|'spatial'|'paperDeformation'>):boolean {
 const {result}=pose,order=result.layers.faceOrder,n=result.geometry.faces.length;
 if(pose.spatial||pose.paperDeformation?.nodes.length||result.geometry.status!=='ready'||result.layers.status!=='solved'||n<=1||!order||order.length!==n||new Set(order).size!==n||!order.every(f=>Number.isInteger(f)&&f>=0&&f<n))return false;
 // Imported snapshots carry `modified` even when their material is still
 // exactly flat. Check isometry once instead of disabling every reopened file.
 if(result.geometry.modified){
  let entries=isometryCache.get(result.geometry);if(!entries){entries=new WeakMap();isometryCache.set(result.geometry,entries);}
  let valid=entries.get(pose.sourceDoc);if(valid===undefined){try{valid=isDiagramPaperPoseIsometric(pose as DiagramPose);}catch{valid=false;}entries.set(pose.sourceDoc,valid);}
  return valid;
 }
 return true;
}
export const diagramDepthActive=(pose:Pick<DiagramPose,'result'|'sourceDoc'|'spatial'|'paperDeformation'|'view'>)=>!!pose.view?.depth?.amount&&diagramDepthAvailable(pose);
interface DepthResult {vertices:Point[];effectiveAmount:number}
const cache=new WeakMap<FlatFoldResult['geometry'],{triangles:readonly (readonly number[])[][];variants:Map<string,DepthResult>}>();
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);

/** Project a material point through the same continuous display cells. */
export function diagramDepthMaterialPoint(mesh:{graph:{vertices_coords:Point[]};triangles:number[][][];vertices:Point[]},point:Point):Point|null {
 for(const row of mesh.triangles)for(const ids of row){
  const [a,b,c]=ids.map(v=>mesh.graph.vertices_coords[v]),area=cross(a,b,c);if(!area)continue;
  const wb=cross(a,point,c)/area,wc=cross(a,b,point)/area,wa=1-wb-wc;
  if(Math.min(wa,wb,wc)<-1e-8)continue;
  const weights=[wa,wb,wc];return [0,1].map(axis=>ids.reduce((sum,v,i)=>sum+mesh.vertices[v][axis]*weights[i],0)) as Point;
 }
 return null;
}

/** Continuous directional relief: ONE displacement per material vertex, shared
 * by all incident faces. No detached layers or added physical mesh. Analytic
 * scaling retains each triangle's winding; this is not a folding simulation. */
export function diagramDepthVertices(pose:Pick<DiagramPose,'result'|'sourceDoc'|'spatial'|'paperDeformation'|'view'>,vertices:Point[],triangles:readonly (readonly number[])[][]):DepthResult {
 if(!diagramDepthActive(pose))return {vertices,effectiveAmount:0};
 const {amount,direction}=pose.view!.depth!,order=pose.result.layers.faceOrder!,key=`${amount}:${direction}:${order.join(',')}`;
 let entry=cache.get(pose.result.geometry);if(entry?.triangles!==triangles){entry={triangles,variants:new Map()};cache.set(pose.result.geometry,entry);}
 const saved=entry.variants.get(key);if(saved)return saved;
 const heights=new Float64Array(vertices.length),weights=new Uint32Array(vertices.length);
 order.forEach((face,rank)=>{for(const v of new Set(triangles[face].flat())){heights[v]+=rank/(order.length-1)-.5;weights[v]++;}});
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 vertices.forEach(([x,y],i)=>{minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);if(weights[i])heights[i]/=weights[i];});
 const scale=Math.max(maxX-minX,maxY-minY)*amount,angle=direction*Math.PI/180,dx=Math.cos(angle)*scale,dy=Math.sin(angle)*scale;
 const moved=vertices.map(([x,y],i):Point=>[x+dx*heights[i],y+dy*heights[i]]);
 let factor=1;
 for(const row of triangles)for(const ids of row){
  const [a,b,c]=ids,area=cross(vertices[a],vertices[b],vertices[c]),changed=cross(moved[a],moved[b],moved[c]);
  if(!area){factor=0;continue;}
  const ratio=changed/area;if(ratio<.2)factor=Math.min(factor,.8/(1-ratio));
 }
 const result={vertices:factor===1?moved:vertices.map(([x,y],i):Point=>[x+dx*heights[i]*factor,y+dy*heights[i]*factor]),effectiveAmount:amount*factor};
 entry.variants.set(key,result);if(entry.variants.size>8)entry.variants.delete(entry.variants.keys().next().value!);
 return result;
}
