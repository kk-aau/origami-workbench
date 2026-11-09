import { distance, epsilonFor, pointOnSegment, segmentIntersection } from '../core/geometry';
import {overlappingSegmentPairs} from '../core/segmentPairs';
import type { Doc, Point } from '../core/types';

/** Derived editor geometry. The source segments and their IDs are never split or mutated. */
export interface SnapPoint {
  id: string;
  point: Point;
  segmentIds: string[];
  /** Non-collinear segments meet here, including T joins and shared endpoints. */
  kind: 'endpoint' | 'intersection' | 'circle' | 'circle-intersection';
}

interface MutablePoint extends Omit<SnapPoint, 'segmentIds'> { segmentIds: Set<string> }

/** Includes retained collinear subdivision points after crossing branches are deleted. */
export function editorJunctionPoints(points:readonly SnapPoint[]):SnapPoint[]{
  return points.filter(point=>point.kind==='intersection'||point.segmentIds.length>1);
}

const coordinateKey = (value: number) => String(Number(value.toFixed(9)));
const finitePoint = (point: Point) => point.every(Number.isFinite);

/**
 * Build endpoints and finite-segment intersections, including auxiliary lines.
 * Memoize this on geometry changes, not pointer motion. Bounding boxes prune pairs;
 * spatial buckets deduplicate points in O(1) average time. Worst case is O(n² + k),
 * where k is the number of actual points, without requiring a closed paper polygon.
 */
export function buildSnapPoints(doc: Doc): SnapPoint[] {
  const eps = epsilonFor(doc);
  // Stable input traversal keeps IDs and tie-breaking independent of selection/order.
  const segments = doc.segments.filter(s => finitePoint(s.a) && finitePoint(s.b))
    .slice().sort((a, b) => a.id.localeCompare(b.id));
  const points: MutablePoint[] = [];
  const buckets = new Map<string, number[]>();
  const add = (point: Point, segmentIds: string[], intersection = false) => {
    const x = Math.floor(point[0] / eps), y = Math.floor(point[1] / eps);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const index of buckets.get(`${x + dx},${y + dy}`) ?? []) {
        const existing = points[index];
        if (distance(existing.point, point) > eps) continue;
        segmentIds.forEach(id => existing.segmentIds.add(id));
        if (intersection) existing.kind = 'intersection';
        return;
      }
    }
    const index = points.length, bucket = `${x},${y}`;
    points.push({
      id: `point:${coordinateKey(point[0])},${coordinateKey(point[1])}`,
      point: [...point], segmentIds: new Set(segmentIds),
      kind: intersection ? 'intersection' : 'endpoint',
    });
    const entries = buckets.get(bucket);
    if (entries) entries.push(index); else buckets.set(bucket, [index]);
  };
  // Prefer exact existing endpoints over an arithmetically equivalent intersection.
  const endpoints = segments.flatMap(s => [{ point: s.a, id: s.id }, { point: s.b, id: s.id }]);
  endpoints.sort((a, b) => a.point[0] - b.point[0] || a.point[1] - b.point[1] || a.id.localeCompare(b.id));
  endpoints.forEach(({ point, id }) => add(point, [id]));
  for (const [i,j] of overlappingSegmentPairs(segments,eps)) {
    const a = segments[i], b = segments[j];
    const hit = segmentIntersection(a, b, eps);
    if (hit) add(hit.point, [a.id, b.id], true);
    else {
      // Parallel/overlapping or degenerate segments can only contribute their
      // finite existing endpoints. Never invent an intersection on an extension.
      for (const p of [a.a, a.b]) if (pointOnSegment(p, b, eps)) add(p, [a.id, b.id]);
      for (const p of [b.a, b.b]) if (pointOnSegment(p, a, eps)) add(p, [a.id, b.id]);
    }
  }
  return points.map(({ segmentIds, ...point }) => ({ ...point, segmentIds: [...segmentIds].sort() }))
    .sort((a, b) => a.point[0] - b.point[0] || a.point[1] - b.point[1] || a.id.localeCompare(b.id));
}

/** Radius is in document units. excludeIds contains SnapPoint IDs, not segment IDs. */
export function nearestSnapPoint(
  points: readonly SnapPoint[], position: Point, radius: number, excludeIds?: ReadonlySet<string>,
): SnapPoint | null {
  if (!finitePoint(position) || !Number.isFinite(radius) || radius < 0) return null;
  let nearest: SnapPoint | null = null, best = radius ** 2;
  for (const point of points) {
    if (excludeIds?.has(point.id)) continue;
    const square = (point.point[0] - position[0]) ** 2 + (point.point[1] - position[1]) ** 2;
    if (square > best) continue;
    if (square === best && nearest) {
      // Exact-distance ties are stable and prefer meaningful intersections.
      if (nearest.kind === 'intersection' && point.kind !== 'intersection') continue;
      if (point.kind === nearest.kind && point.id.localeCompare(nearest.id) >= 0) continue;
    }
    nearest = point; best = square;
  }
  return nearest;
}
