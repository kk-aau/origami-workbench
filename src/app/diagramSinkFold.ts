import {
  collinearOverlap, distance, epsilonFor, interpolate, parameter, pointOnSegment,
  polygonArea, segmentIntersection, splitIntersections,
} from '../core/geometry';
import {materialPointInside} from '../core/materialTraceGeometry';
import {pointBounds} from '../core/pointBounds';
import type {Doc, Point, Segment} from '../core/types';
import {swapGeneratedLines} from './drawingSwap';

/** After splitting crossings and merging matching overlaps, a simple contour
 * is one connected cycle. Never guess missing edges from the selected faces. */
function orderedRing(edges: Segment[], eps: number): Point[] {
  const neighbors = new Map<string, Point[]>();
  for (const {a, b} of edges) {
    for (const [point, other] of [[a, b], [b, a]]) {
      const key = point.join(',');
      const adjacent = neighbors.get(key);
      if (adjacent) adjacent.push(other);
      else neighbors.set(key, [other]);
    }
  }
  if (edges.length < 3 || [...neighbors.values()].some(row => row.length !== 2)) {
    throw new Error('沉折线必须在所选纸面上围成一个闭合轮廓，请调整选面范围或线的端点。');
  }
  const ring = [edges[0].a];
  const start = ring[0].join(',');
  let last = start;
  let current = edges[0].b;
  while (current.join(',') !== start) {
    ring.push(current);
    const key = current.join(',');
    const [a, b] = neighbors.get(key)!;
    current = a.join(',') === last ? b : a;
    last = key;
  }
  if (ring.length !== edges.length || Math.abs(polygonArea(ring)) <= eps * eps) {
    throw new Error('沉折映射应围成一个有面积的闭合区域，请检查是否选中了多个轮廓。');
  }
  return ring;
}

function insidePieces(crease: Segment, edges: Segment[], ring: Point[], eps: number): Segment[] {
  const length = distance(crease.a, crease.b);
  if (length <= eps) return [];
  const cuts = [0, 1];
  for (const edge of edges) {
    const hit = segmentIntersection(crease, edge, eps);
    if (hit) cuts.push(Math.max(0, Math.min(1, hit.t)));
    else if (collinearOverlap(crease, edge, eps)) {
      for (const p of [edge.a, edge.b]) {
        const t = parameter(p, crease);
        if (t > 0 && t < 1) cuts.push(t);
      }
    }
  }
  cuts.sort((a, b) => a - b);
  const result: Segment[] = [];
  let lo = 0;
  for (const hi of cuts) {
    if ((hi - lo) * length <= eps) continue;
    const middle = interpolate(crease.a, crease.b, (lo + hi) / 2);
    // A rim-coincident interval takes the pen's mapped assignment. This also
    // covers sub-epsilon differences left by inverse projection on two faces.
    if (!edges.some(edge => pointOnSegment(middle, edge, eps)) && materialPointInside(middle, ring)) {
      result.push(lo === 0 && hi === 1 ? crease : {
        ...crease, id: `${crease.id}~sink-${result.length}`,
        a: interpolate(crease.a, crease.b, lo), b: interpolate(crease.a, crease.b, hi),
      });
    }
    lo = hi;
  }
  return result;
}

/** Produce only the strokes to overlay on the baseline CP. Input rim pieces
 * carry the main stroke's assignment already converted to each material side. */
export function buildDiagramSinkSegments(baseline: Doc, mappedRim: readonly Segment[]): Segment[] {
  if (mappedRim.some(s => s.assignment !== 'M' && s.assignment !== 'V')) {
    throw new Error('沉折边界请使用谷线或峰线。');
  }
  const eps = epsilonFor(baseline);
  // Multiple material-face clips can describe the same source stroke. Give
  // each clip its own input identity; planarization compares the actual CP
  // coverage, signed angle and assignment before collapsing duplicates.
  const clips = mappedRim.map((s, i) => ({...s, id: `sink:${i}:${s.id}`}));
  const {segments: edges} = splitIntersections({name: '沉折边界', paper: baseline.paper, segments: clips});
  const ring = orderedRing(edges, eps);
  const bounds = pointBounds(ring);
  const inside: Segment[] = [];
  for (const crease of baseline.segments) {
    if (crease.assignment !== 'M' && crease.assignment !== 'V' && crease.assignment !== 'B') continue;
    if (Math.max(crease.a[0], crease.b[0]) < bounds.minX - eps ||
        Math.min(crease.a[0], crease.b[0]) > bounds.maxX + eps ||
        Math.max(crease.a[1], crease.b[1]) < bounds.minY - eps ||
        Math.min(crease.a[1], crease.b[1]) > bounds.maxY + eps) continue;
    if (crease.assignment === 'B') {
      if (edges.some(edge => collinearOverlap(crease, edge, eps))) {
        throw new Error('沉折的闭合边界与纸边重合，请调整主图上的折线。');
      }
    } else {
      for (const part of insidePieces(crease, edges, ring, eps)) inside.push(part);
    }
  }
  return [...edges, ...swapGeneratedLines(inside, true)];
}
