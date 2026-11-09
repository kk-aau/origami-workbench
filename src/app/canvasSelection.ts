import type {Doc} from '../core/types';
import type {DisplayLayers} from './displayLayers';

export interface CanvasSelection {
  segments:ReadonlySet<string>;
  circles:ReadonlySet<string>;
}

/** Keyboard operations use the same visible, editable objects as pointer
 * picking. Supplying a selection also drops stale IDs without touching data. */
export function editableCanvasSelection(doc:Doc,layers:Pick<DisplayLayers,'main'|'auxiliary'>,lockBoundary:boolean,selection?:CanvasSelection):{segments:Set<string>;circles:Set<string>} {
  return {
    segments:new Set(doc.segments.filter(segment=>(segment.assignment==='A'?layers.auxiliary:layers.main)&&(!lockBoundary||segment.assignment!=='B')&&(!selection||selection.segments.has(segment.id))).map(segment=>segment.id)),
    circles:new Set((doc.objects??[]).filter(object=>object.kind==='circle'&&layers.auxiliary&&(!selection||selection.circles.has(object.id))).map(object=>object.id)),
  };
}

/** Preserve unrelated drawing objects and metadata; editor commit validation
 * remains responsible for material topology and the shared undo transaction. */
export function deleteCanvasSelection(doc:Doc,selection:CanvasSelection):Doc {
  const segments=doc.segments.filter(segment=>!selection.segments.has(segment.id));
  const objects=doc.objects?.filter(object=>object.kind!=='circle'||!selection.circles.has(object.id));
  if(segments.length===doc.segments.length&&objects?.length===doc.objects?.length)return doc;
  return {...doc,segments,...(objects?{objects}:{})};
}
