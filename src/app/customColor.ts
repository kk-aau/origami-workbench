import { validateDoc, type Doc, type Segment } from '../core/types';
import { COLORS } from './state';
import type { ColorTargets } from './customColorTargets';

/** Assignments remain visually authoritative for all folding and boundary edges. */
export function segmentDisplayColor(segment: Segment): string {
  return segment.assignment === 'A' && segment.displayColor !== undefined ? segment.displayColor : COLORS[segment.assignment];
}

/** One immutable document edit for all targeted circles and auxiliary segments. */
export function applyCustomColor(doc: Doc, targets: ColorTargets, color: string): Doc {
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('请选择六位十六进制颜色。');
  color = color.toLowerCase();
  let changed = false;
  const segments = doc.segments.map(segment => {
    if (segment.assignment !== 'A' || !targets.segmentIds.has(segment.id) || segment.displayColor?.toLowerCase() === color) return segment;
    changed = true; return { ...segment, displayColor: color };
  });
  const objects = doc.objects?.map(object => {
    if (object.kind !== 'circle' || !targets.circleIds.has(object.id) || object.color.toLowerCase() === color) return object;
    changed = true; return { ...object, color };
  });
  if (!changed) return doc;
  const next = { ...doc, segments, ...(objects ? { objects } : {}) };
  validateDoc(next); return next;
}
