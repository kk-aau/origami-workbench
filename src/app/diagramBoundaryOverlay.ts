import type {FlatFoldResult} from '../core/types';
import type {DiagramPose} from './diagramProject';
import type {ModelViewState} from './modelViewState';
import type {DiagramLineDefaults} from './diagramLineStyles';
import {defaultModelColors} from './modelColors';
import {flatPresentation} from './flatPresentation';
import {diagramLocalSurface,diagramWithoutFlatJoints} from './diagramLocalSurface';
import {modelOverlapRegions} from './modelOverlapRegions';
import {modelRegionLayers} from './modelRegionLayers';
import {modelRegionBoundaries} from './modelRegionBoundaries';
import {modelProjection} from './modelProjection';
import {diagramSpatialEdgeMarkup} from './diagramSpatialEdges';
import type {ModelRegionSurfaceData} from './modelRegionSVG';

const cache=new WeakMap<FlatFoldResult,Map<string,ModelRegionSurfaceData|null>>();

/** Repaint only certified visible paper edges above authored ink. The paper
 * itself remains below the ink, so a later face never erases a drawn crease. */
export function diagramBoundaryOverlay(pose:DiagramPose,view:ModelViewState,lineDefaults:DiagramLineDefaults,omitFlatCreases=false):string {
  if(view.xray||pose.paperDeformation?.nodes.length||pose.result.layers.status!=='solved'||pose.result.geometry.status!=='ready')return '';
  const color=lineDefaults.boundary.globalFields?.includes('color')?lineDefaults.boundary.color:(view.colors??defaultModelColors()).line;
  const spatial=diagramSpatialEdgeMarkup(pose,view,color);
  let data=diagramLocalSurface(pose,view.side);
  if(!data&&flatPresentation(pose.result,view.side).hasOrder){
    const result=pose.result,{vertices,faces}=result.geometry;
    // The overlap pass is synchronous. Keep the same first-frame budget as the
    // local-surface renderer, and cache by immutable solver result and hidden set.
    const key=`${view.side}:${[...new Set(pose.hiddenFaces??[])].sort((a,b)=>a-b).join(',')}`;
    let variants=cache.get(result);if(!variants){variants=new Map();cache.set(result,variants);}
    if(!variants.has(key)){
      let computed:ModelRegionSurfaceData|null=null;
      if(faces.length<=512&&vertices.length<=4096&&faces.reduce((sum,face)=>sum+face.length,0)<=4096&&(result.layers.faceOrders?.length??0)<=100_000){
        try{
          const overlap=modelOverlapRegions(result),hidden=new Set(pose.hiddenFaces??[]);
          if(overlap.cells.length<=20_000&&[...hidden].every(face=>Number.isInteger(face)&&face>=0&&face<faces.length)){
            const visible=new Set(faces.flatMap((_,face)=>hidden.has(face)?[]:[face]));
            const filtered={...overlap,cells:overlap.cells.flatMap(cell=>{const ids=cell.faces.filter(face=>visible.has(face));return ids.length?[{...cell,faces:ids}]:[];})};
            const regions=modelRegionLayers(result,filtered,view.side);
            computed={regions,omittedThinRegions:overlap.omittedThinRegions,boundaries:modelRegionBoundaries(result,regions,visible)};
          }
        }catch{/* A failed certificate must not invent a visible edge. */}
      }
      variants.set(key,computed);if(variants.size>8)variants.delete(variants.keys().next().value!);
    }
    data=variants.get(key)??null;
  }
  const boundaries=data&&(omitFlatCreases?diagramWithoutFlatJoints(pose,data):data).boundaries;
  if(!boundaries?.edges.length)return spatial;
  const project=modelProjection(pose.result.geometry.vertices,view.side==='back',view.rotation,view?.projectionCenter).project;
  const lines=boundaries.edges.map(edge=>{
    const a=project(edge.a),b=project(edge.b);
    return `<line data-diagram-top-boundary="true" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${color}" stroke-width="${pose.spatial?1.35:1.2}" stroke-linecap="round" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
  }).join('');
  return `<g data-diagram-boundary-overlay="true" pointer-events="none">${lines}${spatial}</g>`;
}
