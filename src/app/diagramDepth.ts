import type {FlatFoldResult,Point} from '../core/types';
import type {DiagramPose} from './diagramProject';
import {isDiagramPaperPoseIsometric} from './diagramPaperPose';
import {modelOverlapRegions} from './modelOverlapRegions';

/** Illustration parameters, independent of physical crease angles. */
export interface DiagramDepth {amount:number;direction:number}
export const defaultDiagramDepth=():DiagramDepth=>({amount:.05,direction:135});
const isometryCache=new WeakMap<FlatFoldResult['geometry'],WeakMap<DiagramPose['sourceDoc'],{spatial:DiagramPose['spatial'];valid:boolean}>>();
export function diagramDepthAvailable(pose:Pick<DiagramPose,'result'|'sourceDoc'|'spatial'|'paperDeformation'>):boolean {
 const {result}=pose,order=result.layers.faceOrder,n=result.geometry.faces.length;
 if(pose.paperDeformation?.nodes.length||result.geometry.status!=='ready'||result.layers.status!=='solved'||n<=1||!order||order.length!==n||new Set(order).size!==n||!order.every(f=>Number.isInteger(f)&&f>=0&&f<n))return false;
 // Imported snapshots carry `modified` even when their material is still
 // exactly flat. Check isometry once instead of disabling every reopened file.
 // A rigid spatial face is generally foreshortened on screen. Validate its
 // actual material/3D transform, rather than rejecting that projection as strain.
 if(result.geometry.modified||pose.spatial){
  let entries=isometryCache.get(result.geometry);if(!entries){entries=new WeakMap();isometryCache.set(result.geometry,entries);}
  let entry=entries.get(pose.sourceDoc);if(!entry||entry.spatial!==pose.spatial){let valid=false;try{valid=isDiagramPaperPoseIsometric(pose as DiagramPose);}catch{/* Invalid physical poses never receive a display deformation. */}entry={spatial:pose.spatial,valid};entries.set(pose.sourceDoc,entry);}
  return entry.valid;
 }
 return true;
}
export const diagramDepthActive=(pose:Pick<DiagramPose,'result'|'sourceDoc'|'spatial'|'paperDeformation'|'view'>)=>!!pose.view?.depth?.amount&&diagramDepthAvailable(pose);
interface DepthResult {vertices:Point[];effectiveAmount:number}
const cache=new WeakMap<FlatFoldResult['geometry'],{triangles:readonly (readonly number[])[][];variants:Map<string,DepthResult>}>();
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);

/** Only faces that cover the same patch of paper constrain its display height.
 * Keep an entire face at one level even when it spans multiple patches. */
const reliefCache=new WeakMap<FlatFoldResult['geometry'],{covers:number[][]|null;orderKey:string;heights:Float64Array}>();
function reliefFaceHeights(result:FlatFoldResult,order:number[],orderKey:string):Float64Array {
 let entry=reliefCache.get(result.geometry);
 if(entry?.orderKey===orderKey)return entry.heights;
 if(!entry){
  const regions=modelOverlapRegions(result);
  entry={covers:regions.omittedThinRegions||!regions.cells.length?null:regions.cells.map(cell=>cell.faces),orderKey:'',heights:new Float64Array(order.length)};
  reliefCache.set(result.geometry,entry);
 }
 const rank=new Uint32Array(order.length);
 order.forEach((face,i)=>{rank[face]=i;});
 const heights=new Float64Array(order.length);
 if(entry.covers){
  const above=order.map(()=>new Set<number>());
  for(const cover of entry.covers){
   const stack=[...cover].sort((a,b)=>rank[a]-rank[b]);
   for(let i=1;i<stack.length;i++)above[stack[i-1]].add(stack[i]);
  }
  const belowCount=new Uint32Array(order.length),aboveCount=new Uint32Array(order.length);
  let span=0;
  for(const face of order)for(const next of above[face]){
   belowCount[next]=Math.max(belowCount[next],belowCount[face]+1);
   span=Math.max(span,belowCount[next]);
  }
  for(let i=order.length-1;i>=0;i--){
   const face=order[i];
   for(const next of above[face])aboveCount[face]=Math.max(aboveCount[face],aboveCount[next]+1);
   if(span)heights[face]=(belowCount[face]-aboveCount[face])/(2*span);
  }
 }else{
  // An unresolved thin patch could contain a real overlap. Retain the
  // certified paint order for this illustration instead of merging its faces.
  for(const face of order)heights[face]=rank[face]/(order.length-1)-.5;
 }
 entry.orderKey=orderKey;entry.heights=heights;return heights;
}

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
 const {amount,direction}=pose.view!.depth!,order=pose.result.layers.faceOrder!,orderKey=order.join(','),key=`${amount}:${direction}:${orderKey}`;
 let entry=cache.get(pose.result.geometry);if(entry?.triangles!==triangles){entry={triangles,variants:new Map()};cache.set(pose.result.geometry,entry);}
 const saved=entry.variants.get(key);if(saved)return saved;
 const heights=new Float64Array(vertices.length),weights=new Uint32Array(vertices.length);
 const faceHeights=reliefFaceHeights(pose.result,order,orderKey);
 order.forEach(face=>{for(const v of new Set(triangles[face].flat())){heights[v]+=faceHeights[face];weights[v]++;}});
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 vertices.forEach(([x,y],i)=>{minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);if(weights[i])heights[i]/=weights[i];});
 // Exactly edge-on material has no invertible screen interior. Keep its whole
 // indexed boundary (including shared hinges) at the physical position. Other
 // faces can still expand, without opening a fake selectable area in that face.
 const edgeOn=new Set((pose.result.geometry.graph?.zhezhi_spatialEdgeOnFaces as number[]|undefined)??[]);
 for(const face of edgeOn)for(const v of triangles[face]?.flat()??[])heights[v]=0;
 const scale=Math.max(maxX-minX,maxY-minY)*amount,angle=direction*Math.PI/180,dx=Math.cos(angle)*scale,dy=Math.sin(angle)*scale;
 const moved=vertices.map(([x,y],i):Point=>[x+dx*heights[i],y+dy*heights[i]]);
 let factor=1;
 for(const [face,row] of triangles.entries())for(const ids of row){
  const [a,b,c]=ids,area=cross(vertices[a],vertices[b],vertices[c]),changed=cross(moved[a],moved[b],moved[c]);
  if(!area){if(!edgeOn.has(face))factor=0;continue;}
  const ratio=changed/area;if(ratio<.2)factor=Math.min(factor,.8/(1-ratio));
 }
 const result={vertices:factor===1?moved:vertices.map(([x,y],i):Point=>[x+dx*heights[i]*factor,y+dy*heights[i]*factor]),effectiveAmount:amount*factor};
 entry.variants.set(key,result);if(entry.variants.size>8)entry.variants.delete(entry.variants.keys().next().value!);
 return result;
}
