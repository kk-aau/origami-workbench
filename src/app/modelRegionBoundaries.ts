import {modelFaceContains,modelFaceRings} from './modelRings';
import {polygonArea} from '../core/geometry';
import {modelBoundsIndex,modelPlanarArrangement,modelPolygonBounds} from './modelOverlapRegions';
import type {FlatFoldResult,Point} from '../core/types';
import type {ModelLayerRegion} from './modelRegionLayers';
import {modelSurfaceEpsilon} from './modelSurfacePrecision';

export interface ModelRegionBoundary {a:Point;b:Point;leftRegion:number|null;rightRegion:number|null}
export interface ModelRegionBoundaries {edges:ModelRegionBoundary[];ambiguousEdges:number}
function inside(p:Point,polygon:Point[]){
 let hit=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];
  if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;
 }
 return hit;
}
function distance(p:Point,a:Point,b:Point){
 const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)):0;
 return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
/** Unprojected visible edges. Only original paper edges are candidates, never
 * vertical decomposition seams. Run in the cancellable overlap worker.
 * Like Oriedita's drawer: exterior/hole edges or different visible top faces.
 * Unknown, missing thin regions and unsafe probes are reported, not guessed.
 */
export function modelRegionBoundaries(result:FlatFoldResult,regions:ModelLayerRegion[],visibleFaces?:ReadonlySet<number>,epsilonOverride?:number):ModelRegionBoundaries{
 let {vertices}=result.geometry;const {faces}=result.geometry;
 if(result.geometry.status!=='ready'||!vertices.length||!faces.length||vertices.some(p=>p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))||faces.some(f=>f.length<3||f.some(v=>!Number.isInteger(v)||v<0||v>=vertices.length)))throw new Error('局部边线模型几何无效。');
 if(regions.some(r=>r.polygon.length<3||r.polygon.some(p=>p.length!==2||p.some(n=>!Number.isFinite(n)))||(r.layers.status==='ordered'&&(!r.layers.topToBottom.length||r.layers.topToBottom.some(id=>!Number.isInteger(id)||id<0||id>=faces.length)))))throw new Error('局部边线区域无效。');
 if(visibleFaces&&[...visibleFaces].some(face=>!Number.isInteger(face)||face<0||face>=faces.length))throw new Error('局部边线可见纸面编号无效。');
 const visible=(face:number)=>visibleFaces?.has(face)??true;
 const epsilon=modelSurfaceEpsilon(vertices,epsilonOverride);
 if(visibleFaces&&!visibleFaces.size)return {edges:[],ambiguousEdges:0};
 const fullPlanar=modelPlanarArrangement(result,epsilon);
 vertices=fullPlanar.sourceVertices;
 const display:FlatFoldResult={...result,geometry:{...result.geometry,vertices,...(result.geometry.graph?{graph:{...result.geometry.graph,vertices_coords:vertices}}:{})}};
 // A fully covered face which is never on top cannot contribute a visible
 // edge. Keep all unknown regions and every face with missing coverage; those
 // remain diagnostic candidates instead of silently becoming confirmed.
 const candidates=new Set<number>(),coveredArea=new Float64Array(faces.length),areaCorrection=new Float64Array(faces.length),pieces=new Uint32Array(faces.length);
 for(const region of regions){
  if(region.layers.status==='ordered')candidates.add(region.layers.topToBottom[0]);else for(const face of region.faces)candidates.add(face);
  for(const face of region.faces){const adjusted=region.area-areaCorrection[face],next=coveredArea[face]+adjusted;areaCorrection[face]=(next-coveredArea[face])-adjusted;coveredArea[face]=next;pieces[face]++;}
 }
 faces.forEach((_,face)=>{if(!visible(face)){candidates.delete(face);return;}const rings=modelFaceRings(result,face),area=Math.abs(polygonArea(rings[0].map(v=>vertices[v])))-rings.slice(1).reduce((sum,ring)=>sum+Math.abs(polygonArea(ring.map(v=>vertices[v]))),0),tolerance=Number.EPSILON*Math.max(1,area)*Math.max(16,pieces[face]*8);if(!pieces[face]||!Number.isFinite(coveredArea[face])||Math.abs(coveredArea[face]-area)>tolerance)candidates.add(face);});
 const allVisible=visibleFaces?.size??faces.length;
 const planar=modelPlanarArrangement(result,epsilon,candidates.size<allVisible?candidates:visibleFaces);
 const segments=planar.edges_vertices.map(([a,b])=>({a:planar.vertices_coords[a],b:planar.vertices_coords[b]}));
 const segmentIndex=modelBoundsIndex(segments.map(({a,b})=>modelPolygonBounds([a,b]))),regionIndex=modelBoundsIndex(regions.map(r=>modelPolygonBounds(r.polygon))),faceIndex=modelBoundsIndex(faces.map(f=>modelPolygonBounds(f.map(v=>vertices[v]))));
 const edges:ModelRegionBoundary[]=[];let ambiguousEdges=0;
 const sameKnownTop=(hits:number[])=>{if(!hits.length)return false;const first=regions[hits[0]].layers;if(first.status!=='ordered')return false;return hits.every(i=>regions[i].layers.status==='ordered'&&regions[i].layers.topToBottom[0]===first.topToBottom[0]);};
 // null means confirmed outside; undefined means missing/unknown region.
 const regionAt=(p:Point):number|null|undefined=>{
  const hits=regionIndex.at(p).filter(i=>inside(p,regions[i].polygon));
  if(hits.length)return sameKnownTop(hits)?hits[0]:undefined;
  const paper=faceIndex.at(p).filter(f=>visible(f)&&modelFaceContains(display,f,p));
  if(!paper.length)return null;
  // A decomposition seam can miss a probe by world epsilon. Reuse a local
  // order only when all neighboring regions agree, and an identical complete
  // paper-face set is already verified. Missing thin faces, unknown layers,
  // different visible tops and wider gaps must remain ambiguous.
  const nearby=regionIndex.near(p,epsilon).filter(i=>regions[i].polygon.some((a,j)=>distance(p,a,regions[i].polygon[(j+1)%regions[i].polygon.length])<=epsilon));
  if(!sameKnownTop(nearby))return undefined;
  const paperSet=new Set(paper),matching=nearby.find(i=>regions[i].faces.length===paper.length&&regions[i].faces.every(face=>paperSet.has(face)));
  return matching;
 };
 for(let edgeId=0;edgeId<segments.length;edgeId++){
  const edge=segments[edgeId];
  const dx=edge.b[0]-edge.a[0],dy=edge.b[1]-edge.a[1],length=Math.hypot(dx,dy);if(length<=epsilon)continue;
  const midpoint:Point=[(edge.a[0]+edge.b[0])/2,(edge.a[1]+edge.b[1])/2],normal:Point=[-dy/length,dx/length];
  const clearance=segmentIndex.nearest(midpoint,length,id=>id===edgeId?Infinity:distance(midpoint,segments[id].a,segments[id].b))/4;
  if(clearance<=4*epsilon){ambiguousEdges++;continue;}
  const leftRegion=regionAt([midpoint[0]+normal[0]*clearance,midpoint[1]+normal[1]*clearance]),rightRegion=regionAt([midpoint[0]-normal[0]*clearance,midpoint[1]-normal[1]*clearance]);
  if(leftRegion===undefined||rightRegion===undefined){ambiguousEdges++;continue;}
  const top=(index:number|null)=>{if(index===null)return null;const layer=regions[index].layers;return layer.status==='ordered'?layer.topToBottom[0]:null;};
  if(top(leftRegion)===top(rightRegion))continue;
  edges.push({a:[...edge.a],b:[...edge.b],leftRegion,rightRegion});
 }
 return {edges,ambiguousEdges};
}
