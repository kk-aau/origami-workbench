import type {FlatFoldResult} from '../core/types';
import {polygonArea} from '../core/geometry';
import type {DiagramPose} from './diagramProject';
import {flatPresentation,type FlatSide} from './flatPresentation';
import {modelOverlapRegions,type ModelOverlapRegions} from './modelOverlapRegions';
import {modelRegionLayers} from './modelRegionLayers';
import {modelRegionBoundaries} from './modelRegionBoundaries';
import {modelRegionSVG,type ModelRegionSurfaceData} from './modelRegionSVG';
import type {ModelColors} from './modelColors';
import type {ModelViewState} from './modelViewState';
import {modelProjection} from './modelProjection';
import {modelRegionPaths} from './modelRegionPaths';
import type {ModelLayerRegion} from './modelRegionLayers';
import {spatialFaceMatrix,validateDiagramSpatialPose} from './diagramSpatialPose';
import {diagramSpatialFaceColor} from './diagramSpatialAppearance';

export interface DiagramLocalSurfaceClips {definitions:string;clipForFace:(face:number)=>string}
interface SurfaceEntry {data?:ModelRegionSurfaceData;error?:string;markup:Map<string,string|null>;clips:Map<string,DiagramLocalSurfaceClips>}
interface ResultEntry {overlap?:ModelOverlapRegions;error?:string;variants:Map<string,SurfaceEntry>}
// Results are immutable in the drawing state. Camera, selection and hover edits
// reuse this exact object; a new solver result starts a new analysis identity.
const cache=new WeakMap<FlatFoldResult,ResultEntry>();
const errorText=(error:unknown)=>error instanceof Error?error.message:String(error);
const variantKey=(pose:DiagramPose,side:FlatSide)=>`${side}:${[...new Set(pose.hiddenFaces??[])].sort((a,b)=>a-b).join(',')}`;

function entryFor(pose:DiagramPose,side:FlatSide):SurfaceEntry|null {
  const result=pose.result;
  if(result.geometry.status!=='ready'||result.layers.status!=='solved'||pose.paperDeformation?.nodes.length||pose.displayOrder?.length)return null;
  let state=cache.get(result);
  if(!state){state={variants:new Map()};cache.set(result,state);}
  const key=variantKey(pose,side),previous=state.variants.get(key);if(previous)return previous;
  const entry:SurfaceEntry={markup:new Map(),clips:new Map()};state.variants.set(key,entry);
  if(state.variants.size>8)state.variants.delete(state.variants.keys().next().value!);
  try{
    if(flatPresentation(result,side).hasOrder)return null;
    if(state.error)throw Error(state.error);
    if(!state.overlap){
      const {vertices,faces}=result.geometry,corners=faces.reduce((sum,face)=>sum+face.length,0);
      // This synchronous drawing path complements the full worker analysis.
      // Bound its first-frame cost instead of freezing an unusually large CP.
      if(faces.length>512||vertices.length>4096||corners>4096||(result.layers.faceOrders?.length??0)>100_000)throw Error('局部遮挡超出即时显示预算，暂保留透明预览。');
      // A real ninety-degree material face has no projected area. The spatial
      // solver retains its identity and separately certifies that condition;
      // treating it as a broken polygon makes the entire cyclic model see-through.
      const edgeOn=new Set<number>();
      if(pose.spatial){
        validateDiagramSpatialPose(pose);
        const marked=result.geometry.graph?.zhezhi_spatialEdgeOnFaces;
        if(!Array.isArray(marked)||marked.some(f=>!Number.isInteger(f)||f<0||f>=faces.length))throw Error('空间侧立纸面编号无效。');
        for(const f of marked){const m=spatialFaceMatrix(pose.spatial,f);if(Math.abs(m[0]*m[3]-m[1]*m[2])>=Number.EPSILON*64)throw Error('空间侧立纸面与实际姿态不一致。');edgeOn.add(f);}
      }else if((result.geometry.graph?.zhezhi_spatialEdgeOnFaces as number[]|undefined)?.length)throw Error('侧立纸面缺少真实空间姿态。');
      if(faces.some((face,f)=>!edgeOn.has(f)&&Math.abs(polygonArea(face.map(v=>vertices[v])))<=1e-16))throw Error('局部遮挡含退化纸面，未采用实色显示。');
      state.overlap=modelOverlapRegions(result);
      if(state.overlap.cells.length>20_000){state.error='局部遮挡分区超出即时显示预算，暂保留透明预览。';throw Error(state.error);}
    }
    const hidden=new Set(pose.hiddenFaces??[]),count=result.geometry.faces.length;
    if([...hidden].some(face=>!Number.isInteger(face)||face<0||face>=count))throw Error('局部遮挡的隐藏纸面编号无效。');
    const visible=new Set(result.geometry.faces.flatMap((_,face)=>hidden.has(face)?[]:[face]));
    const overlap={...state.overlap,cells:state.overlap.cells.flatMap(cell=>{
      const faces=cell.faces.filter(face=>visible.has(face));return faces.length?[{...cell,faces}]:[];
    })};
    const regions=modelRegionLayers(result,overlap,side);
    entry.data={regions,omittedThinRegions:overlap.omittedThinRegions,boundaries:modelRegionBoundaries(result,regions,visible)};
  }catch(error){entry.error=errorText(error);if(!state.overlap)state.error=entry.error;}
  return entry;
}

/** Exact local relationships replace an unavailable global paint order. Hidden
 * layers are removed before ordering and probing boundaries, so the next real
 * material surface is revealed. Conflicts and unknown cells stay explicit. */
export function diagramLocalSurface(pose:DiagramPose,side:FlatSide=pose.view?.side??'front'):ModelRegionSurfaceData|null {
  return entryFor(pose,side)?.data??null;
}

/** A diagnostic fallback is never upgraded to a layer certificate. */
export function diagramLocalSurfaceIssue(pose:DiagramPose,side:FlatSide=pose.view?.side??'front'):string|undefined {
  return entryFor(pose,side)?.error;
}

export function diagramWithoutFlatJoints(pose:DiagramPose,data:ModelRegionSurfaceData):ModelRegionSurfaceData {
  const graph=pose.result.geometry.graph;if(!graph||!data.boundaries)return data;
  const epsilon=Math.max(1e-8,Math.max(pose.sourceDoc.paper.width,pose.sourceDoc.paper.height)*1e-9);
  const top=(region:number|null)=>{if(region===null)return;const layers=data.regions[region].layers;return layers.status==='ordered'?layers.topToBottom[0]:undefined;};
  const edges=data.boundaries.edges.filter(edge=>{
    const left=top(edge.leftRegion),right=top(edge.rightRegion);if(left===undefined||right===undefined)return true;
    return !graph.edges_vertices.some(([u,v],index)=>{
      const flat=graph.edges_assignment[index]==='F'||pose.spatial&&typeof pose.spatial.measuredAngles[index]==='number'&&Math.abs(pose.spatial.measuredAngles[index]!)<=1e-5;
      if(!flat||!graph.edges_faces?.[index]?.includes(left)||!graph.edges_faces[index].includes(right))return false;
      const a=graph.vertices_coords[u],b=graph.vertices_coords[v],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<=epsilon)return false;
      return [edge.a,edge.b].every(p=>{const x=p[0]-a[0],y=p[1]-a[1],along=(x*dx+y*dy)/length;return Math.abs(x*dy-y*dx)<=epsilon*length&&along>=-epsilon&&along<=length+epsilon;});
    });
  });
  return {...data,boundaries:{...data.boundaries,edges}};
}

/** No global rank is invented. Keep diagramPresentation.solid unchanged for
 * existing whole-face hit/snap ordering; only paper paint uses this surface. */
export function diagramLocalSurfaceMarkup(pose:DiagramPose,view:ModelViewState,colors:ModelColors,omitFlatCreases=false):string|null {
  if(view.xray)return null;
  const entry=entryFor(pose,view.side);if(!entry?.data||entry.error)return null;
  const key=JSON.stringify([view.rotation,view.projectionCenter,colors,omitFlatCreases]),prior=entry.markup.get(key);if(prior!==undefined)return prior;
  try{
    const data=omitFlatCreases?diagramWithoutFlatJoints(pose,entry.data):entry.data;
    const shade=diagramSpatialFaceColor(pose,view),front=flatPresentation(pose.result,view.side).frontMaterial;
    let markup=modelRegionSVG(pose.result,data,view.side,view.rotation,colors,shade?{faceColors:front.map((isFront,face)=>shade(face,isFront?colors.front:colors.back)),boundaryWidth:1.35}:undefined);
    if(view.projectionCenter){
      const raw=modelProjection(pose.result.geometry.vertices,view.side==='back',view.rotation).project([0,0]);
      const anchored=modelProjection(pose.result.geometry.vertices,view.side==='back',view.rotation,view.projectionCenter).project([0,0]);
      markup=`<g transform="translate(${anchored[0]-raw[0]} ${anchored[1]-raw[1]})">${markup}</g>`;
    }
    entry.markup.set(key,markup);if(entry.markup.size>8)entry.markup.delete(entry.markup.keys().next().value!);return markup;
  }catch(error){entry.error=errorText(error);entry.data=undefined;entry.markup.clear();return null;}
}

let clipSerial=0;
/** Material-bound ink is painted after the paper. Give it the same real local
 * top-face coverage, so a buried crease cannot show through an opaque surface.
 * Keep uncertain regions available for diagnostic ink instead of inventing a
 * visible face there. SVG clipping preserves the complete stroke's dash phase. */
export function diagramLocalSurfaceClips(pose:DiagramPose,view:ModelViewState):DiagramLocalSurfaceClips|null {
  if(view.xray)return null;
  const entry=entryFor(pose,view.side);if(!entry?.data||entry.error)return null;
  const key=JSON.stringify([view.rotation,view.projectionCenter]),previous=entry.clips.get(key);if(previous)return previous;
  try{
    const byFace=new Map<number,ModelLayerRegion[]>(),projection=modelProjection(pose.result.geometry.vertices,view.side==='back',view.rotation,view?.projectionCenter);
    for(const region of entry.data.regions){
      const faces=region.layers.status==='ordered'?region.layers.topToBottom.slice(0,1):region.faces;
      for(const face of faces){const rows=byFace.get(face)??[];rows.push(region);byFace.set(face,rows);}
    }
    const prefix=`diagram-local-ink-${(++clipSerial).toString(36)}`;
    const paths=new Map([...byFace].map(([face,regions])=>[face,modelRegionPaths(regions,projection.project,()=>String(face)).map(group=>group.d).join(' ')]));
    const definitions=pose.result.geometry.faces.map((_,face)=>`<clipPath id="${prefix}-${face}" clipPathUnits="userSpaceOnUse"><path d="${paths.get(face)??''}" clip-rule="nonzero"/></clipPath>`).join('');
    const clips={definitions,clipForFace:(face:number)=>`url(#${prefix}-${face})`};entry.clips.set(key,clips);
    if(entry.clips.size>8)entry.clips.delete(entry.clips.keys().next().value!);return clips;
  }catch(error){entry.error=errorText(error);entry.data=undefined;entry.markup.clear();entry.clips.clear();return null;}
}
