import type {Doc} from '../core/types';
import type {DisplayLayers} from './displayLayers';

/** A pointer-query view only. Commit proposals and construction/snap topology
 * must continue to use the complete source document. */
export function canvasInteractionDocument(doc:Doc,layers:Pick<DisplayLayers,'main'|'auxiliary'>):Doc {
  return {...doc,segments:doc.segments.filter(segment=>segment.assignment==='A'?layers.auxiliary:layers.main)};
}

/** A shared junction can refer to hidden incident lines. Select only its
 * displayed, editable occurrences without changing the original junction. */
export function canvasSelectableIncidentIds(doc:Doc,incidentIds:readonly string[],lockBoundary:boolean):Set<string> {
  const incident=new Set(incidentIds);
  return new Set(doc.segments.filter(segment=>incident.has(segment.id)&&(!lockBoundary||segment.assignment!=='B')).map(segment=>segment.id));
}
