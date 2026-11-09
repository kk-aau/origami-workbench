import type {Point} from '../core/types';
import type {DiagramAnnotation} from './diagramAnnotations';
import {diagramAnnotationsInBox,diagramEraseHits} from './diagramDrawingTools';
import {diagramViewportAnnotations,rotateDiagramViewportPoint} from './diagramViewport';
import {prepareDiagramZoomRegionContains,prepareDiagramZoomVisibleSegments,type DiagramZoomRegion} from './diagramZoomGeometry';

/** Paper lines use temporary visible pieces. Symbols are instructions placed
 * around the paper and keep their full native ink and handles outside the crop.
 * The caller resolves IDs to the original objects before changing stored data. */
export function prepareDiagramZoomInteraction(region:DiagramZoomRegion,_precision=.05){
  const contains=prepareDiagramZoomRegionContains(region),clip=prepareDiagramZoomVisibleSegments(region);
  const clipped=(annotations:readonly DiagramAnnotation[]):DiagramAnnotation[]=>annotations.flatMap<DiagramAnnotation>(a=>a.kind==='line'?clip(a.a,a.b).map(part=>({...a,...part})):[a]);
  function boxIds(annotations:readonly DiagramAnnotation[],a:Point,b:Point,rotation=0,center:Point=[0,0]):string[]{
    const projected=diagramViewportAnnotations(clipped(annotations),center,rotation),start=rotateDiagramViewportPoint(a,center,rotation),end=rotateDiagramViewportPoint(b,center,rotation);
    const ids=new Set(diagramAnnotationsInBox(projected,start,end));
    return annotations.filter(a=>ids.has(a.id)).map(a=>a.id);
  }
  function eraseIds(annotations:readonly DiagramAnnotation[],a:Point,b:Point,tolerance:number):string[]{
    const sweeps=clip(a,b),points=contains(a)&&Math.hypot(a[0]-b[0],a[1]-b[1])<1e-9?[{a,b}]:sweeps;
    const lineIds=new Set(points.flatMap(sweep=>diagramEraseHits(clipped(annotations.filter(a=>a.kind==='line')),sweep.a,sweep.b,tolerance)));
    const symbolIds=new Set(diagramEraseHits(annotations.filter(a=>a.kind==='symbol'),a,b,tolerance));
    return annotations.filter(item=>item.kind==='line'?lineIds.has(item.id):symbolIds.has(item.id)).map(a=>a.id);
  }
  return {contains,clip,clipped,boxIds,eraseIds};
}
