import ear from 'rabbit-ear';
import earcut from 'earcut';
import type {FlatFoldResult,Point} from '../core/types';
import {polygonArea} from '../core/geometry';
import {pointBounds} from '../core/pointBounds';
import {modelFaceRings,modelFaceContains} from './modelRings';
import {hasWeakMaterialRings} from '../core/materialWeak';
import {materialLayerRegions} from '../core/materialLayerRegions';
import {modelPlanarize,type ModelArrangement} from './modelPlanarize';
import {modelSurfaceEpsilon,modelSurfacePrecision} from './modelSurfacePrecision';

export interface ModelOverlapCell {polygon:Point[];faces:number[];area:number}
export interface ModelOverlapRegions {cells:ModelOverlapCell[];maxDepth:number;omittedThinRegions:number;epsilon:number}
type Bounds={minX:number;minY:number;maxX:number;maxY:number};
type BoundsNode=Bounds&{ids?:number[];left?:BoundsNode;right?:BoundsNode};
export const modelPolygonBounds=pointBounds;
/** Exact broad phase only: every returned candidate still uses the original
 * double-precision containment/distance predicate. No geometric quantization. */
export function modelBoundsIndex(bounds:Bounds[]){
 const build=(ids:number[]):BoundsNode=>{
  const box={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
  for(const id of ids){const b=bounds[id];box.minX=Math.min(box.minX,b.minX);box.minY=Math.min(box.minY,b.minY);box.maxX=Math.max(box.maxX,b.maxX);box.maxY=Math.max(box.maxY,b.maxY);}
  if(ids.length<=8)return {...box,ids};
  const x=box.maxX-box.minX>=box.maxY-box.minY;
  ids.sort((a,b)=>x?(bounds[a].minX+bounds[a].maxX)-(bounds[b].minX+bounds[b].maxX):(bounds[a].minY+bounds[a].maxY)-(bounds[b].minY+bounds[b].maxY));
  const mid=ids.length>>>1;return {...box,left:build(ids.slice(0,mid)),right:build(ids.slice(mid))};
 };
 const root=build(bounds.map((_,i)=>i));
 const contains=(b:Bounds,p:Point)=>p[0]>=b.minX&&p[0]<=b.maxX&&p[1]>=b.minY&&p[1]<=b.maxY;
 const boxDistance=(b:Bounds,p:Point)=>Math.hypot(Math.max(b.minX-p[0],0,p[0]-b.maxX),Math.max(b.minY-p[1],0,p[1]-b.maxY));
 return {
  at(p:Point){const hits:number[]=[];const visit=(node:BoundsNode)=>{if(!contains(node,p))return;if(node.ids){for(const id of node.ids)if(contains(bounds[id],p))hits.push(id);}else{visit(node.left!);visit(node.right!);}};visit(root);return hits;},
  near(p:Point,radius:number){const hits:number[]=[];const visit=(node:BoundsNode)=>{if(boxDistance(node,p)>radius)return;if(node.ids){for(const id of node.ids)if(boxDistance(bounds[id],p)<=radius)hits.push(id);}else{visit(node.left!);visit(node.right!);}};visit(root);return hits;},
  nearest(p:Point,limit:number,distance:(id:number)=>number){let best=limit;const visit=(node:BoundsNode)=>{if(boxDistance(node,p)>best)return;if(node.ids){for(const id of node.ids)if(boxDistance(bounds[id],p)<=best)best=Math.min(best,distance(id));}else{const a=node.left!,b=node.right!;if(boxDistance(a,p)<=boxDistance(b,p)){visit(a);visit(b);}else{visit(b);visit(a);}}};visit(root);return best;},
 };
}
type PlanarArrangement=ModelArrangement&{rings:{face:number;hole:boolean}[];segmentRings:number[][];ringPoints:Point[][]};
const planarCache=new WeakMap<FlatFoldResult,{key:string;planar:PlanarArrangement}>();
/** Reuse one arrangement for coverage and both visible-boundary passes. The
 * value snapshot also detects callers mutating an existing result in place. */
export function modelPlanarArrangement(result:FlatFoldResult,epsilon:number,visibleFaces?:ReadonlySet<number>):PlanarArrangement{
 const {vertices,faces}=result.geometry;
 const key=JSON.stringify([epsilon,vertices,faces,result.geometry.graph?.faces_holes??null]);
 const cached=visibleFaces?undefined:planarCache.get(result);if(cached?.key===key)return cached.planar;
 const edges:[number,number][]=[],seen=new Set<string>();
 faces.forEach((_,f)=>{if(!visibleFaces||visibleFaces.has(f))modelFaceRings(result,f).forEach(face=>face.forEach((a,i)=>{const b=face[(i+1)%face.length],edgeKey=a<b?`${a},${b}`:`${b},${a}`;if(!seen.has(edgeKey)){seen.add(edgeKey);edges.push([a,b]);}}));});
 const graph=modelPlanarize(vertices,edges,epsilon),rings:PlanarArrangement['rings']=[],ringPoints:Point[][]=[],owners=new Map<string,Set<number>>();
 const segmentKey=(a:Point,b:Point)=>{const first=a.join(','),second=b.join(',');return first<second?`${first};${second}`:`${second};${first}`;};
 const originalIndices=new Map(graph.originalSegments.map(([a,b],index)=>[segmentKey(a,b),index]));
 faces.forEach((_,f)=>{if(!visibleFaces||visibleFaces.has(f))modelFaceRings(result,f).forEach((ring,hole)=>{
  const owner=rings.length,points:Point[]=[];rings.push({face:f,hole:hole>0});ringPoints.push(points);
  ring.forEach((v,i)=>{const a=graph.sourceVertices[v],b=graph.sourceVertices[ring[(i+1)%ring.length]];if(a===b)return;const key=segmentKey(a,b),index=originalIndices.get(key);
   if(index===undefined)throw Error('纸面边界缺少对应的原始线段。');
   const path=graph.sourceSegmentPoints[index],forward=path[0][0]===a[0]&&path[0][1]===a[1];points.push(...(forward?path:path.slice().reverse()).slice(0,-1));
   const row=owners.get(key)??new Set<number>();if(row.has(owner))row.delete(owner);else row.add(owner);owners.set(key,row);
  });
 });});
 const segmentRings=graph.sourceSegmentOrigins.map(origins=>{const row=new Set<number>();for(const origin of origins){const [a,b]=graph.originalSegments[origin];for(const owner of owners.get(segmentKey(a,b))??[]){if(row.has(owner))row.delete(owner);else row.add(owner);}}return [...row];});
 const planar:PlanarArrangement={...graph,rings,ringPoints,segmentRings};
 if(!visibleFaces)planarCache.set(result,{key,planar});return planar;
}
function inside(p:Point,polygon:Point[]):boolean{
 let hit=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];
  if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;
 }
 return hit;
}
/** Connected simple arrangements use maximal planar faces. Disconnected/nested
 * boundaries and weak rings retain the vertical decomposition fallback. */
function planarCells(planar:PlanarArrangement,coverAt:(p:Point)=>number[],epsilon:number):ModelOverlapRegions|null{
 const {vertices_coords:vertices,edges_vertices:edges}=planar;
 if(!edges.length)return null;
 const parent=vertices.map((_,i)=>i),root=(v:number):number=>{while(parent[v]!==v){parent[v]=parent[parent[v]];v=parent[v];}return v;};
 const used=new Set<number>();for(const [a,b] of edges){parent[root(a)]=root(b);used.add(a);used.add(b);}
 if(new Set([...used].map(root)).size!==1)return null;
 const {faces_vertices:faces}=ear.graph.makePlanarFaces(planar);
 // A bridge creates a repeated vertex in a face walk, i.e. a slit/weak ring.
 // Euler's count and simple walks prevent silently losing a bounded region.
 if(faces.length!==edges.length-used.size+1||faces.some(f=>f.length<3||new Set(f).size!==f.length))return null;
 const cells:ModelOverlapCell[]=[];let maxDepth=0,omittedThinRegions=0;
 for(const face of faces){
  const polygon=face.map(v=>[...vertices[v]] as Point),area=Math.abs(polygonArea(polygon));
  if(area<=epsilon*epsilon){omittedThinRegions++;continue;}
  const triangles=earcut(polygon.flat()),parts:Point[][]=[];let probe:Point|undefined,largest=0,triangleAreaSum=0;
  for(let i=0;i<triangles.length;i+=3){const triangle=triangles.slice(i,i+3).map(v=>polygon[v]),[a,b,c]=triangle,triangleArea=Math.abs(polygonArea(triangle));parts.push(triangle);triangleAreaSum+=triangleArea;if(triangleArea>largest){largest=triangleArea;probe=[a[0]+((b[0]-a[0])+(c[0]-a[0]))/3,a[1]+((b[1]-a[1])+(c[1]-a[1]))/3];}}
  const bounds=modelPolygonBounds(polygon),areaTolerance=Math.max(epsilon*epsilon,Number.EPSILON*((bounds.maxX-bounds.minX)**2+(bounds.maxY-bounds.minY)**2)*polygon.length*16);
  // A concave polygon's arithmetic centroid need not be inside. A verified
  // triangle interior is safe; unresolved precision falls back to slabs.
  if(!probe||!inside(probe,polygon)||Math.abs(triangleAreaSum-area)>areaTolerance)return null;
  const cover=coverAt(probe);if(!cover.length)continue;
  maxDepth=Math.max(maxDepth,cover.length);
  const turns=polygon.map((b,i)=>{const a=polygon[(i+polygon.length-1)%polygon.length],c=polygon[(i+1)%polygon.length];return (b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);});
  if(turns.every(t=>t>=0)||turns.every(t=>t<=0))cells.push({polygon,faces:cover,area});
  else{
   // Downstream decoration clipping and interior probes expect convex cells.
   // Only concave planar faces need this split; all triangles share one exact
   // coverage query. These private diagonals never enter visible boundaries.
   for(const triangle of parts){const triangleArea=Math.abs(polygonArea(triangle));if(triangleArea>0)cells.push({polygon:triangle,faces:cover,area:triangleArea});}
  }
 }
 return {cells,maxDepth,omittedThinRegions,epsilon};
}
/** Geometric coverage only, independent of layer order. For a cancellable dynamic
 * preview call in a Worker, never on each main-thread pointermove. */
export function modelOverlapRegions(result:FlatFoldResult,epsilonOverride?:number):ModelOverlapRegions{
 const {vertices,faces,status}=result.geometry;
 if(status!=='ready'||!vertices.length||!faces.length)throw new Error('请先生成有效模型，再计算重叠区域。');
 if(vertices.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6)))throw new Error('重叠区域模型坐标无效或超出范围。');
 // A verified spatial projection may contain edge-on material faces. They
 // remain in the source topology and edge drawing but cover no screen area.
 const edgeOn=result.geometry.graph?.zhezhi_spatialEdgeOnFaces as number[]|undefined;
 if(edgeOn?.length){
  if(!Array.isArray(edgeOn)||edgeOn.some(f=>!Number.isInteger(f)||f<0||f>=faces.length))throw Error('侧立纸面索引无效。');
  for(const f of edgeOn){
   const points=faces[f].map(v=>vertices[v]),a=points[0],b=points.reduce((best,p)=>Math.hypot(p[0]-a[0],p[1]-a[1])>Math.hypot(best[0]-a[0],best[1]-a[1])?p:best,a),length=Math.hypot(b[0]-a[0],b[1]-a[1]);
   const scale=Math.max(1,...points.flat().map(Math.abs));
   if(points.some(p=>Math.abs((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))>Number.EPSILON*128*scale*Math.max(1,length)))throw Error('侧立标记包含实际纸面面积。');
  }
  const ids=faces.flatMap((_,f)=>edgeOn.includes(f)?[]:[f]),graph=result.geometry.graph!;
  const filtered={...result,geometry:{...result.geometry,faces:ids.map(f=>faces[f]),graph:{...graph,faces_vertices:ids.map(f=>faces[f]),faces_holes:ids.map(f=>graph.faces_holes?.[f]??[]),zhezhi_spatialEdgeOnFaces:[]}}};
  const regions=modelOverlapRegions(filtered,epsilonOverride);
  return {...regions,cells:regions.cells.map(cell=>({...cell,faces:cell.faces.map(f=>ids[f])}))};
 }
 const weak=result.geometry.graph&&hasWeakMaterialRings(result.geometry.graph);
 if(faces.some(face=>face.length<3||!weak&&new Set(face).size!==face.length||face.some(v=>!Number.isInteger(v)||v<0||v>=vertices.length)))throw new Error('重叠区域纸面索引无效。');
 const epsilon=modelSurfaceEpsilon(vertices,epsilonOverride),coordinateRoundoff=modelSurfacePrecision(vertices).minimumEpsilon;
 if(weak){const graph=result.geometry.graph!;if(JSON.stringify(graph.faces_vertices)!==JSON.stringify(faces)||JSON.stringify(graph.vertices_coords)!==JSON.stringify(vertices))throw Error('弱边界显示与实际计算图不一致。');materialLayerRegions(graph,epsilon);}
 const planar=modelPlanarArrangement(result,epsilon);
 const display:FlatFoldResult={...result,geometry:{...result.geometry,vertices:planar.sourceVertices,...(result.geometry.graph?{graph:{...result.geometry.graph,vertices_coords:planar.sourceVertices}}:{})}};
 // Sub-epsilon paper faces and holes may collapse in the display copy. Keep
 // that loss explicit, including a hole inside an otherwise intact large face.
 // Coincident full faces retain positive area and do not trigger this warning.
 let collapsedRings=0,ringIndex=0;
 for(let f=0;f<faces.length;f++)for(const ring of modelFaceRings(result,f)){
  // An actual thin triangle (or hole) may collapse when its long side splits
  // through the opposite tip. Inspect the atomic ring, not its unsplit points.
  const originalArea=polygonArea(ring.map(v=>vertices[v])),polygon=planar.ringPoints[ringIndex++],area=polygonArea(polygon),bounds=modelPolygonBounds(polygon);
  if(originalArea!==0&&(new Set(polygon.map(p=>p.join(','))).size<3||originalArea*area<=0||Math.abs(area)<=epsilon*epsilon||bounds.maxX-bounds.minX<=epsilon||bounds.maxY-bounds.minY<=epsilon))collapsedRings++;
 }
 const faceIndex=modelBoundsIndex(faces.map(face=>modelPolygonBounds(face.map(v=>planar.sourceVertices[v]))));
 const coverAt=(probe:Point)=>faceIndex.at(probe).filter(index=>modelFaceContains(display,index,probe)).sort((a,b)=>a-b);
 if(planar.maximalFacesSafe&&!weak&&!result.geometry.graph?.faces_holes?.some(rings=>rings.length)){
  const maximal=planarCells(planar,coverAt,epsilon);if(maximal)return {...maximal,omittedThinRegions:maximal.omittedThinRegions+collapsedRings};
 }
 // Folded vertices that share a vertical line can differ by roundoff. Keeping
 // both x values and then skipping their thin slab leaves a real gap in the
 // surface; an edge probe on that gap can discard an entire visible crease.
 // Use one shared split coordinate instead, so neighboring slabs meet exactly.
 const breaks=planar.breaks;
 const segments=planar.sourceSegments.map(([a,b],id)=>({id,a,b,min:Math.min(a[0],b[0]),max:Math.max(a[0],b[0]),y:(x:number)=>x===a[0]?a[1]:x===b[0]?b[1]:a[1]+(x-a[0])*(b[1]-a[1])/(b[0]-a[0])}));
 const starts=segments.filter(s=>s.min<s.max).sort((a,b)=>a.min-b.min),ends=[...starts].sort((a,b)=>a.max-b.max),verticals=segments.filter(s=>s.max-s.min<=epsilon).sort((a,b)=>a.min-b.min);
 type Band={left:number;right:number;low:typeof segments[number];high:typeof segments[number];faces:number[]};
 const cells:ModelOverlapCell[]=[];
 let omittedThinRegions=0,maxDepth=0;
 let prior=new Map<number,Band>(),start=0,end=0,vertical=0;const active=new Set<typeof segments[number]>(),eventStamp=new Uint32Array(segments.length);
 const ringInside=new Uint8Array(planar.rings.length),outerInside=new Uint8Array(faces.length),holesInside=new Uint32Array(faces.length),faceInside=new Uint8Array(faces.length),insideFaces=new Set<number>();
 const toggle=(segment:number)=>{for(const owner of planar.segmentRings[segment]){
  const ring=planar.rings[owner],before=faceInside[ring.face];
  if(ring.hole)holesInside[ring.face]+=ringInside[owner]?-1:1;else outerInside[ring.face]=ringInside[owner]?0:1;
  ringInside[owner]^=1;
  const after=outerInside[ring.face]&&holesInside[ring.face]===0?1:0;
  if(before!==after){faceInside[ring.face]=after;if(after)insideFaces.add(ring.face);else insideFaces.delete(ring.face);}
 }};
 const finish=(band:Band)=>{
  if(!band.faces.length)return;
  const {low,high}=band;let {left,right}=band;
  // An intersection abscissa depends on both input axes. Its error bound must
  // retain the full model-coordinate roundoff used when normalizing endpoints,
  // even when this particular X interval happens to lie close to zero.
  const minimum=Math.max(low.min,high.min),maximum=Math.min(low.max,high.max),roundoff=Math.max(coordinateRoundoff,Number.EPSILON*Math.max(1,Math.abs(left),Math.abs(right),Math.abs(minimum),Math.abs(maximum))*8);
  // An event cluster may straddle an endpoint. Never extrapolate a steep,
  // short source edge across the whole cluster and manufacture paper area.
  if(left<minimum-roundoff){left=minimum;omittedThinRegions++;}
  if(right>maximum+roundoff){right=maximum;omittedThinRegions++;}
  if(right<=left)return;
  const leftHeight=high.y(left)-low.y(left),rightHeight=high.y(right)-low.y(right);
  // Merged x events can put an actual crossing just inside a slab endpoint.
  // Clip to the true line intersection, never emit a crossed quadrilateral.
  if(leftHeight<0||rightHeight<0){
   if(leftHeight<=0&&rightHeight<=0){omittedThinRegions++;return;}
   const crossing=left+(right-left)*(-leftHeight)/(rightHeight-leftHeight),endpoint=leftHeight<0?left:right;
   // Evaluating two lines at their shared intersection can produce opposite
   // last bits. Correct that endpoint, but do not count a sub-roundoff move as
   // lost paper: reducing display epsilon cannot recover those same bits.
   // A measurable clip into a clustered event remains an explicit diagnostic.
   if(Math.abs(crossing-endpoint)>roundoff)omittedThinRegions++;
   if(leftHeight<0)left=crossing;else right=crossing;
  }
  const raw:Point[]=[[left,low.y(left)],[right,low.y(right)],[right,high.y(right)],[left,high.y(left)]];
  const polygon=raw.filter((p,k)=>Math.hypot(p[0]-raw[(k+3)%4][0],p[1]-raw[(k+3)%4][1])>epsilon),area=(right-left)*((high.y(left)-low.y(left))+(high.y(right)-low.y(right)))/2;
  if(polygon.length<3||area<=epsilon*epsilon){omittedThinRegions++;return;}
  maxDepth=Math.max(maxDepth,band.faces.length);cells.push({polygon,faces:band.faces,area});
 };
 for(let i=1;i<breaks.length;i++){
  const left=breaks[i-1],right=breaks[i],width=right-left;if(width<=0)continue;
  // Sample in the open interval between event clusters. A midpoint inside the
  // left cluster can select a short edge which ends before the actual slab.
  const mid=(planar.breakEnds[i-1]+right)/2;
  while(start<starts.length&&starts[start].min<mid)active.add(starts[start++]);
  while(end<ends.length&&ends[end].max<=mid)active.delete(ends[end++]);
  // A vertical or near-vertical boundary can disappear entirely into a shared
  // x-event cluster. It must still separate coverage on the two sides.
  const barriers:typeof segments=[];while(vertical<verticals.length&&verticals[vertical].min<=planar.breakEnds[i-1]){const s=verticals[vertical++];if(s.max>=left)barriers.push(s);}
  for(const id of planar.eventSegments[i-1])eventStamp[id]=i;
  const crossings=[...active].map(segment=>({segment,middle:segment.y(mid)})).sort((a,b)=>a.middle-b.middle||a.segment.id-b.segment.id),current=new Map<number,Band>();
  ringInside.fill(0);outerInside.fill(0);holesInside.fill(0);faceInside.fill(0);insideFaces.clear();
  for(let j=1;j<crossings.length;j++){
   const low=crossings[j-1],high=crossings[j],height=high.middle-low.middle;
   // Ring parity gives exact membership in this open band, independently of
   // point-in-polygon roundoff or a previous slab's cached probe. Every edge
   // toggles even when the following gap is too thin to emit. Hole interiors
   // are unioned per face, matching modelFaceContains rather than XORing holes.
   toggle(low.segment.id);
   if(height<=epsilon){if(height>0&&insideFaces.size)omittedThinRegions++;continue;}
   if(!insideFaces.size)continue;
   const key=low.segment.id*segments.length+high.segment.id,old=prior.get(key);
   // A boundary crossing merged into this x cluster can change coverage even
   // when the same two edges are adjacent again on its far side.
   const blocked=eventStamp[low.segment.id]===i||eventStamp[high.segment.id]===i||barriers.some(s=>Math.max(s.a[1],s.b[1])>Math.min(low.segment.y(s.min),low.segment.y(s.max))-epsilon&&Math.min(s.a[1],s.b[1])<Math.max(high.segment.y(s.min),high.segment.y(s.max))+epsilon);
   if(old&&!blocked&&old.faces.length===insideFaces.size&&old.faces.every(face=>faceInside[face])){old.right=right;current.set(key,old);prior.delete(key);}
   else current.set(key,{left,right,low:low.segment,high:high.segment,faces:[...insideFaces].sort((a,b)=>a-b)});
  }
  for(const band of prior.values())finish(band);prior=current;
 }
 for(const band of prior.values())finish(band);
 return {cells,maxDepth,omittedThinRegions:omittedThinRegions+collapsedRings,epsilon};
}
