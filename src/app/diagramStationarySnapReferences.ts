import type {DiagramSnapReference} from './diagramSnapReferences';
import type {DiagramAnnotation,DiagramLineAnnotation} from './diagramAnnotations';
import {isDiagramCPLine} from './diagramAnnotations';

function containsPart(source:DiagramLineAnnotation,part:Pick<DiagramLineAnnotation,'a'|'b'|'style'>,epsilon:number):boolean{
  const dx=source.b[0]-source.a[0],dy=source.b[1]-source.a[1],size=Math.hypot(dx,dy);
  if(size<=epsilon||part.style!==source.style)return false;
  return [part.a,part.b].every(point=>{
    const x=point[0]-source.a[0],y=point[1]-source.a[1],along=(x*dx+y*dy)/size;
    return Math.abs(dx*y-dy*x)/size<=epsilon&&along>=-epsilon&&along<=size+epsilon;
  });
}

/** Query the raw rendered piece, before deduplication can replace its ID with a
 * coincident paper edge. During a drag, pass the original annotations. */
export function diagramPreviewSourceIds(part:Pick<DiagramLineAnnotation,'a'|'b'|'style'>&{face:number},annotations:readonly DiagramAnnotation[],epsilon=1e-7):string[]{
  return annotations.filter((source):source is DiagramLineAnnotation=>source.kind==='line'&&!source.id.startsWith('bg:')&&(isDiagramCPLine(source)||['valley','mountain'].includes(source.style)&&source.foldFaces?.length!==0)&&(!source.foldFaces||source.foldFaces.includes(part.face))&&containsPart(source,part,epsilon)).map(source=>source.id);
}

export function diagramBackgroundSourceIds(part:DiagramLineAnnotation,annotations:readonly DiagramAnnotation[],epsilon=1e-7):string[]{
  return annotations.filter((source):source is DiagramLineAnnotation=>source.kind==='line'&&(source.id===part.id||!isDiagramCPLine(source)&&!source.id.startsWith('bg:')&&['valley','mountain'].includes(source.style)&&source.foldFaces?.length!==0&&containsPart(source,part,epsilon))).map(source=>source.id);
}

/** Unknown ownership and any stationary contributor keep a route visible. */
export function diagramSourcesOnlyMoving(sourceIds:readonly string[],movingIds:readonly string[]):boolean{
  return sourceIds.length>0&&sourceIds.every(id=>movingIds.includes(id));
}

/** Moving an instruction must also remove its projected and background pieces.
 * Coincident paper edges and pieces contributed by another object stay usable. */
export function stationaryDiagramSnapReferences<T extends DiagramSnapReference>(references:readonly T[],selectedIds:readonly string[]):T[]{
  return references.filter(reference=>reference.snapSourceIds
    ?!diagramSourcesOnlyMoving(reference.snapSourceIds,selectedIds)
    :!selectedIds.some(id=>reference.id===id||reference.id.startsWith(id+':visible:')));
}
