import { validateDoc, type Doc, type DrawingObject, type Point } from '../core/types';
import type { Bounds } from './paper';
import type { TextObject } from './textLayout';

export type TextProperties = Pick<TextObject, 'position' | 'text' | 'fontSize' | 'color'>;
export const TEXT_DEFAULTS = { color: '#2a3c34', fontSize: 5 };

function meaningfulText(text: string) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('请输入文字；删除已有文字请使用删除操作。');
}

/** Only completed drafts enter the document. Failed validation never mutates it. */
export function appendText(doc: Doc, properties: TextProperties): Doc {
  meaningfulText(properties.text);
  const used = new Set([...doc.segments, ...doc.objects ?? []].map(o => o.id));
  let id = 'text', index = 1;
  while (used.has(id)) id = `text:${++index}`;
  const object: TextObject = { ...properties, position: [...properties.position], kind: 'text', id };
  const next = { ...doc, objects: [...doc.objects ?? [], object] };
  validateDoc(next); return next;
}

export function updateText(doc: Doc, id: string, patch: Partial<TextProperties>): Doc {
  const current = doc.objects?.find((o): o is TextObject => o.id === id && o.kind === 'text');
  if (!current) throw new Error('该文字已不存在，请重新选择。');
  const object = { ...current, ...patch };
  meaningfulText(object.text);
  const next = { ...doc, objects: doc.objects!.map(o => o.id === id ? object : o) };
  validateDoc(next);
  if (object.text === current.text && object.color === current.color && object.fontSize === current.fontSize
    && object.position[0] === current.position[0] && object.position[1] === current.position[1]) return doc;
  object.position = [...object.position];
  return next;
}

/** Ignore stale selection and non-text IDs; never delete crease geometry. */
export function deleteTexts(doc: Doc, ids: ReadonlySet<string>): Doc {
  const objects = doc.objects?.filter(o => o.kind !== 'text' || !ids.has(o.id));
  if (!objects || objects.length === doc.objects?.length) return doc;
  const next = { ...doc, objects }; validateDoc(next); return next;
}

// The canvas must supply actual rendered SVG bounds (getBBox), not the
// conservative font-independent fit/export bounds from textLayout.ts.
export type TextHitBounds = ReadonlyMap<string, Bounds>;
const validBounds = (b: Bounds) => [b.x, b.y, b.width, b.height].every(Number.isFinite) && b.width >= 0 && b.height >= 0;
export function pickText(objects: DrawingObject[], point: Point, bounds: TextHitBounds, tolerance = 0): TextObject | undefined {
  if (!point.every(Number.isFinite) || !Number.isFinite(tolerance) || tolerance < 0) return;
  let nearest: TextObject | undefined, distance = Infinity;
  for (const object of objects) {
    if (object.kind !== 'text') continue;
    const b = bounds.get(object.id);
    if (!b || !validBounds(b) || point[0] < b.x - tolerance || point[0] > b.x + b.width + tolerance
      || point[1] < b.y - tolerance || point[1] > b.y + b.height + tolerance) continue;
    const d = Math.hypot(point[0] - object.position[0], point[1] - object.position[1]);
    // Match upstream: closest anchor among containing rectangles, stable document order for ties.
    if (d < distance) { nearest = object; distance = d; }
  }
  return nearest;
}

export function textIdsInBox(objects: DrawingObject[], bounds: TextHitBounds, a: Point, b: Point, rule: 'contained' | 'touching'): Set<string> {
  const ids = new Set<string>();
  if (![...a, ...b].every(Number.isFinite)) return ids;
  const left = Math.min(a[0], b[0]), right = Math.max(a[0], b[0]);
  const top = Math.min(a[1], b[1]), bottom = Math.max(a[1], b[1]);
  for (const object of objects) {
    if (object.kind !== 'text') continue;
    const r = bounds.get(object.id);
    if (!r || !validBounds(r)) continue;
    if (rule === 'contained'
      ? r.x >= left && r.y >= top && r.x + r.width <= right && r.y + r.height <= bottom
      : r.x <= right && r.x + r.width >= left && r.y <= bottom && r.y + r.height >= top) ids.add(object.id);
  }
  return ids;
}
