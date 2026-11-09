import { splitEditableSegments } from './planarize';
import { validateDoc, type Doc, type Segment } from '../core/types';

export interface DiagnosticRepairResult {
  doc: Doc;
  changed: boolean;
  split: number;
  removed: number;
}

function endpointKey(point: readonly number[]): string {
  // The planarizer canonicalizes shared points. A fixed decimal key keeps the
  // repair deterministic even when a document came from a text interchange format.
  return point.map(value => Number(value.toFixed(9))).join(',');
}

function geometryKey(segment: Segment): string {
  const a = endpointKey(segment.a), b = endpointKey(segment.b);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Turn crossings/T joins into independent editor segments without changing
 * assignments. This is the explicit repair behind Oriedita's T-junction fix.
 */
export function repairTJunctions(doc: Doc): DiagnosticRepairResult {
  validateDoc(doc);
  const planar = splitEditableSegments(doc);
  const split = Math.max(0, planar.segments.length - doc.segments.length);
  return { doc: split ? planar : doc, changed: split > 0, split, removed: 0 };
}

/**
 * Remove duplicate pieces after planarization. The later segment wins on
 * conflicting main-line overlaps. Main lines always win over auxiliary lines;
 * protected boundaries win over other main lines regardless of insertion order.
 */
export function repairOverlappingSegments(doc: Doc, lockBoundary=false): DiagnosticRepairResult {
  validateDoc(doc);
  const planar = splitEditableSegments(doc);
  const kept = new Map<string,Segment>();
  let removed = 0;
  for (const segment of planar.segments) {
    const key = geometryKey(segment);
    const previous=kept.get(key);
    if(previous){
      removed++;
      if(previous.assignment==='A'||segment.assignment!=='A'&&(!lockBoundary||previous.assignment!=='B'))kept.set(key,segment);
    }else kept.set(key,segment);
  }
  const changed = removed > 0 || planar.segments.length !== doc.segments.length;
  if (!changed) return { doc, changed: false, split: 0, removed: 0 };
  return { doc: { ...doc, segments: [...kept.values()] }, changed: true, split: Math.max(0, planar.segments.length - doc.segments.length), removed };
}
