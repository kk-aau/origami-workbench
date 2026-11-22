import type {FlatFoldResult,Point} from '../core/types';
import type {DiagramFoldPreviewSegment} from './diagramFoldLinkTypes';
import {diagramDepthActive} from './diagramDepth';
import type {DiagramPose} from './diagramProject';
import type {ModelViewState} from './modelViewState';
import {diagramBoundaryStrokeWidth,type DiagramLineDefaults} from './diagramLineStyles';
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
type BoundarySide={a:Point;b:Point;inward:Point};
export type DiagramBoundaryInk={markup:string;byFace:Map<number,BoundarySide[]>;visiblePaper:(face:number)=>string};
const noEdges:DiagramBoundaryInk={markup:'',byFace:new Map(),visiblePaper:()=>''};
let clipId=0;

type BoundaryFold=Pick<DiagramFoldPreviewSegment,'face'|'a'|'b'|'visibility'|'existing'|'unfolding'|'style'>&Partial<Pick<DiagramFoldPreviewSegment,'assignment'>>&{strokePattern?:string};
export interface DiagramBoundaryFoldOffset {normal:Point;paper:string}

/** Plan at the continuous straight instruction level, before painting any
 * fragment. If only its lower half lies on an outline, BOTH halves get the
 * same inset. Material splits, reversed endpoints and stroke phase cannot
 * introduce a step in the middle. Gaps and bends start a separate run. */
export function diagramBoundaryFoldOffsets(boundary:DiagramBoundaryInk|null,segments:readonly BoundaryFold[]):Map<number,DiagramBoundaryFoldOffset> {
  const result=new Map<number,DiagramBoundaryFoldOffset>();if(!boundary)return result;
  const eps=1e-7;
  type Part={index:number;lo:number;hi:number};
  type Support={a:Point;u:Point;style:string;parts:Part[]};
  const supports:Support[]=[];
  for(const [index,segment] of segments.entries()){
    if(segment.visibility!=='visible'||segment.existing&&!segment.unfolding)continue;
    const style=segment.style??({M:'mountain',V:'valley',F:'crease',U:'auxiliary'} as const)[segment.assignment??'U'];
    if(style!=='valley'&&style!=='mountain')continue;
    const dx=segment.b[0]-segment.a[0],dy=segment.b[1]-segment.a[1],length=Math.hypot(dx,dy);if(length<=eps)continue;
    let support=supports.find(s=>s.style===style&&[segment.a,segment.b].every(p=>Math.abs((p[0]-s.a[0])*s.u[1]-(p[1]-s.a[1])*s.u[0])<=eps));
    if(!support){const sign=(Math.abs(dx)>=Math.abs(dy)?dx:dy)<0?-1:1;support={a:segment.a,u:[dx/length*sign,dy/length*sign],style,parts:[]};supports.push(support);}
    const along=(p:Point)=>(p[0]-support.a[0])*support.u[0]+(p[1]-support.a[1])*support.u[1];
    const [lo,hi]=[along(segment.a),along(segment.b)].sort((a,b)=>a-b);support.parts.push({index,lo,hi});
  }
  for(const {a,u,parts} of supports){
    parts.sort((a,b)=>a.lo-b.lo);
    for(let start=0;start<parts.length;){
      let end=start+1,hi=parts[start].hi;while(end<parts.length&&parts[end].lo<=hi+eps){hi=Math.max(hi,parts[end].hi);end++;}
      const run=parts.slice(start,end);start=end;
      const normal:Point=[-u[1],u[0]],weights=[0,0];
      for(const part of run)for(const side of boundary.byFace.get(segments[part.index].face)??[]){
        if(segments[part.index].strokePattern==='solid')continue;
        if([side.a,side.b].some(p=>Math.abs((p[0]-a[0])*u[1]-(p[1]-a[1])*u[0])>eps))continue;
        const [lo,hi]=[side.a,side.b].map(p=>(p[0]-a[0])*u[0]+(p[1]-a[1])*u[1]).sort((a,b)=>a-b);
        const overlap=Math.min(part.hi,hi)-Math.max(part.lo,lo);if(overlap<=eps)continue;
        weights[side.inward[0]*normal[0]+side.inward[1]*normal[1]<0?1:0]+=overlap;
      }
      if(!weights.some(w=>w>eps))continue;
      const sign=weights[1]>weights[0]?-1:1;
      const paper=[...new Set(run.map(p=>segments[p.index].face))].map(face=>boundary.visiblePaper(face)).join('');
      const plan={normal:normal.map(v=>v*sign||0) as Point,paper};for(const part of run)result.set(part.index,plan);
    }
  }
  return result;
}

/** Replace the ink, rather than appending a second copy. Hit/snap geometry
 * remains on the real crease and dash offsets remain on the original run. */
export function boundaryFoldInk(ink:string,units:number,offset?:DiagramBoundaryFoldOffset):string {
  if(!offset)return ink;
  const id='edge-fold-'+ ++clipId,[nx,ny]=offset.normal,distance=2.6*units;
  return `<defs><clipPath id="${id}">${offset.paper}</clipPath></defs><g data-diagram-boundary-fold-hint="true" pointer-events="none" clip-path="url(#${id})"><g transform="translate(${nx*distance} ${ny*distance})">${ink}</g></g>`;
}

/** Repaint only certified visible paper edges above authored ink. The paper
 * itself remains below the ink, so a later face never erases a drawn crease. */
export function diagramBoundaryOverlay(pose:DiagramPose,view:ModelViewState,lineDefaults:DiagramLineDefaults,omitFlatCreases=false):DiagramBoundaryInk {
  if(view.xray||pose.paperDeformation?.nodes.length||diagramDepthActive({...pose,view})||pose.result.layers.status!=='solved'||pose.result.geometry.status!=='ready')return noEdges;
  const color=lineDefaults.boundary.globalFields?.includes('color')?lineDefaults.boundary.color:(view.colors??defaultModelColors()).line;
  const spatial=diagramSpatialEdgeMarkup(pose,view,color,diagramBoundaryStrokeWidth(lineDefaults,1.35));
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
  if(!data||!boundaries?.edges.length)return {...noEdges,markup:spatial};
  const project=modelProjection(pose.result.geometry.vertices,view.side==='back',view.rotation,view?.projectionCenter).project;
  const byFace=new Map<number,BoundarySide[]>(),mirror=view.side==='back'?-1:1;
  const regions=data.regions,paperClips=new Map<number,string>();
  const visiblePaper=(face:number)=>{
    let clip=paperClips.get(face);
    if(clip===undefined){
      clip=regions.filter(r=>r.layers.status==='ordered'&&r.layers.topToBottom[0]===face)
        .map(r=>`<polygon points="${r.polygon.map(p=>project(p).join(',')).join(' ')}"/>`).join('');
      paperClips.set(face,clip);
    }
    return clip;
  };
  const lines=boundaries.edges.map(edge=>{
    const a=project(edge.a),b=project(edge.b);
    const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
    if(length>0)for(const [index,sign] of [[edge.leftRegion,mirror],[edge.rightRegion,-mirror]] as const){
      if(index===null)continue;
      const region=regions[index];if(region.layers.status!=='ordered')continue;
      const owner=region.layers.topToBottom[0],sides=byFace.get(owner)??[];
      sides.push({a,b,inward:[-dy*sign/length,dx*sign/length]});byFace.set(owner,sides);
    }
    return `<line data-diagram-top-boundary="true" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${color}" stroke-width="${diagramBoundaryStrokeWidth(lineDefaults,pose.spatial?1.35:1.2)}" stroke-linecap="round" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
  }).join('');
  return {markup:`<g data-diagram-boundary-overlay="true" pointer-events="none">${lines}${spatial}</g>`,byFace,visiblePaper};
}
