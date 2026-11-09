import type { Doc, Point } from '../core/types';
import { distanceToSegment } from './state';
import { segmentsInBox } from './erase';

export interface ColorTargets { segmentIds: Set<string>; circleIds: Set<string> }
export type ColorArea = { kind: 'point'; point: Point; tolerance: number } | { kind: 'box'; a: Point; b: Point };
const finite = (p: Point) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
/** Mode 59 hit rules, independent of the chosen display color and M/V semantics. */
export function customColorTargets(doc: Doc, area: ColorArea): ColorTargets {
  const result: ColorTargets = { segmentIds: new Set(), circleIds: new Set() };
  const circles = (doc.objects ?? []).filter(o => o.kind === 'circle');
  if (area.kind === 'point') {
    if (!finite(area.point) || !Number.isFinite(area.tolerance) || area.tolerance <= 0) return result;
    let segment: Doc['segments'][number] | undefined, circle: typeof circles[number] | undefined;
    let lineDistance = Infinity, circleDistance = Infinity;
    for (const candidate of doc.segments) {
      const d = distanceToSegment(area.point, candidate);
      if (d <= lineDistance) { lineDistance = d; segment = candidate; }
    }
    for (const candidate of circles) {
      const center = Math.hypot(area.point[0] - candidate.center[0], area.point[1] - candidate.center[1]);
      const d = Math.min(center, Math.abs(center - candidate.radius));
      if (d <= circleDistance) { circleDistance = d; circle = candidate; }
    }
    // Line wins equal distances, even when it is ineligible; never click through.
    if (lineDistance <= circleDistance) {
      if (segment?.assignment === 'A' && lineDistance < area.tolerance) result.segmentIds.add(segment.id);
    } else if (circle && circleDistance < area.tolerance) result.circleIds.add(circle.id);
    return result;
  }
  if (!finite(area.a) || !finite(area.b)) return result;
  const hits = segmentsInBox(doc, area.a, area.b, false, 'touching');
  doc.segments.forEach(s => { if (s.assignment === 'A' && hits.has(s.id)) result.segmentIds.add(s.id); });
  const left = Math.min(area.a[0], area.b[0]), right = Math.max(area.a[0], area.b[0]);
  const top = Math.min(area.a[1], area.b[1]), bottom = Math.max(area.a[1], area.b[1]);
  for (const circle of circles) {
    const [x, y] = circle.center;
    const centerInside = x >= left && x <= right && y >= top && y <= bottom;
    const nearest = Math.hypot(Math.max(left - x, 0, x - right), Math.max(top - y, 0, y - bottom));
    const farthest = Math.hypot(Math.max(Math.abs(x - left), Math.abs(x - right)), Math.max(Math.abs(y - top), Math.abs(y - bottom)));
    if (centerInside || nearest <= circle.radius && farthest >= circle.radius) result.circleIds.add(circle.id);
  }
  return result;
}
