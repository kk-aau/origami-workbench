import { validateDoc, type Doc, type Point } from '../core/types';
import { splitEditableSegmentsWithMap } from './planarize';
import { buildSnapPoints } from './snapPoints';

export interface BranchTrimResult {
  doc: Doc;
  removed: number;
  iterations: number;
}

// Coordinates are already normalized by planarization. The rounded key keeps
// the graph stable for hand-edited decimal coordinates without inventing a
// new vertex tolerance separate from the editor's snap graph.
function key(point: Point): string {
  return `${point[0].toFixed(7)},${point[1].toFixed(7)}`;
}

/**
 * Remove dangling non-boundary branches until no interior degree-one endpoint
 * remains. Boundary endpoints are anchors: a crease or auxiliary line that
 * reaches the paper boundary is retained at that end, while an isolated
 * interior chain is removed from its free end inward. The input is immutable.
 */
export function trimBranches(doc: Doc): BranchTrimResult {
  validateDoc(doc);
  const prepared = splitEditableSegmentsWithMap(doc).doc;
  let segments = prepared.segments.slice();
  let removed = 0;
  let iterations = 0;

  while (segments.length) {
    iterations++;
    const current: Doc = { ...prepared, segments };
    const points = buildSnapPoints(current);
    const degree = new Map<string, Set<string>>();
    for (const point of points) degree.set(key(point.point), new Set(point.segmentIds));
    const boundary = new Set<string>();
    for (const segment of segments) {
      if (segment.assignment === 'B') {
        boundary.add(key(segment.a));
        boundary.add(key(segment.b));
      }
    }
    const dangling = new Set<string>();
    for (const segment of segments) {
      if (segment.assignment === 'B') continue;
      const a = key(segment.a), b = key(segment.b);
      const aDangling = (degree.get(a)?.size ?? 0) <= 1 && !boundary.has(a);
      const bDangling = (degree.get(b)?.size ?? 0) <= 1 && !boundary.has(b);
      if (aDangling || bDangling) dangling.add(segment.id);
    }
    if (!dangling.size) break;
    segments = segments.filter(segment => !dangling.has(segment.id));
    removed += dangling.size;
  }

  if (!removed) return { doc, removed: 0, iterations };
  const next = { ...doc, segments };
  validateDoc(next);
  return { doc: next, removed, iterations };
}
