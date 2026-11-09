import type { Doc, Point } from '../core/types';
import { distanceToSegment } from './state';

const finitePoint = (point: Point): boolean => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);

/** Pick the nearest editable finite segment; ties use IDs, not document order. */
export function pickEraseSegment(doc: Doc, point: Point, radius: number, lockBoundary: boolean): string | undefined {
  if (!finitePoint(point) || !Number.isFinite(radius) || radius < 0) return undefined;
  let closest: string | undefined;
  let closestDistance = radius;
  for (const segment of doc.segments) {
    if ((lockBoundary && segment.assignment === 'B') || !finitePoint(segment.a) || !finitePoint(segment.b)) continue;
    const distance = distanceToSegment(point, segment);
    if (!Number.isFinite(distance) || distance > closestDistance) continue;
    if (distance === closestDistance && closest !== undefined && segment.id >= closest) continue;
    closest = segment.id;
    closestDistance = distance;
  }
  return closest;
}

export const eraseBoxMode = (a: Point, b: Point): 'contained' | 'touching' => b[0] < a[0] ? 'touching' : 'contained';

/** Rightward boxes contain whole segments; leftward boxes include any contact. */
export function segmentsInBox(doc: Doc, a: Point, b: Point, lockBoundary: boolean, mode: 'contained' | 'touching' = eraseBoxMode(a,b)): Set<string> {
  const selected = new Set<string>();
  if (!finitePoint(a) || !finitePoint(b)) return selected;
  const minX = Math.min(a[0], b[0]), maxX = Math.max(a[0], b[0]);
  const minY = Math.min(a[1], b[1]), maxY = Math.max(a[1], b[1]);
  const inside = (point: Point) => finitePoint(point)
    && point[0] >= minX && point[0] <= maxX && point[1] >= minY && point[1] <= maxY;
  const touches = (start: Point, end: Point): boolean => {
    let enter = 0, leave = 1;
    const lower = [minX, minY], upper = [maxX, maxY];
    for (const axis of [0, 1]) {
      const delta = end[axis] - start[axis];
      if (delta === 0) {
        if (start[axis] < lower[axis] || start[axis] > upper[axis]) return false;
      } else {
        const first = (lower[axis] - start[axis]) / delta;
        const last = (upper[axis] - start[axis]) / delta;
        enter = Math.max(enter, Math.min(first, last));
        leave = Math.min(leave, Math.max(first, last));
        if (enter > leave) return false;
      }
    }
    return true;
  };
  for (const segment of doc.segments) {
    if (lockBoundary && segment.assignment === 'B') continue;
    if (!finitePoint(segment.a) || !finitePoint(segment.b)) continue;
    if (mode === 'touching' ? touches(segment.a, segment.b) : inside(segment.a) && inside(segment.b)) selected.add(segment.id);
  }
  return selected;
}

export const segmentsInEraseBox = segmentsInBox;
