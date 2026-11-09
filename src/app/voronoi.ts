import type { Point } from '../core/types';

export interface VoronoiEdge { a: Point; b: Point; sites: [number, number] }
const validPoint = (p: Point) => Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && Math.abs(n) <= 1e6);

/** Like mode 62: click near an existing seed to remove it; otherwise append. */
export function toggleVoronoiSite(sites: Point[], point: Point, tolerance: number): Point[] {
  if (!validPoint(point) || !sites.every(validPoint) || !Number.isFinite(tolerance) || tolerance < 0)
    throw new Error('请选择有效种子点，坐标须在 ±1000000 mm 内。');
  let hit = -1;
  // Upstream resolves overlapping hit regions by the last seed in document order.
  sites.forEach((p, i) => { if (Math.hypot(p[0] - point[0], p[1] - point[1]) <= tolerance) hit = i; });
  return hit < 0 ? [...sites.map(p => [...p] as Point), [...point]] : sites.filter((_, i) => i !== hit).map(p => [...p] as Point);
}

/**
 * Pairwise perpendicular bisectors clipped to all nearest-site half planes.
 * The finite initial span matches OritaCalc.bisection(a,b,1000): 500 each side.
 * Temporary construction geometry only; no paper border or crease is fabricated.
 * Coordinates are translated to the pair midpoint before arithmetic to avoid
 * subtracting squared world coordinates near the document coordinate limit.
 */
export function voronoiEdges(sites: Point[], span = 1000): VoronoiEdge[] {
  if (!sites.every(validPoint)) throw new Error('Voronoi 种子点坐标无效。');
  if (!Number.isFinite(span) || span <= 0 || span > 2e6) throw new Error('Voronoi 预览跨度须大于零且不超过 2000000 mm。');
  const epsilon = 1e-7, edges: VoronoiEdge[] = [];
  for (let i = 0; i < sites.length; i++) for (let j = i + 1; j < sites.length; j++) {
    if (Math.hypot(sites[j][0] - sites[i][0], sites[j][1] - sites[i][1]) <= epsilon)
      throw new Error('种子点重合或过于接近，请移除重复点。');
  }
  for (let i = 0; i < sites.length; i++) for (let j = i + 1; j < sites.length; j++) {
    const p = sites[i], q = sites[j], dx = q[0] - p[0], dy = q[1] - p[1], length = Math.hypot(dx, dy);
    const mid: Point = [p[0] + dx / 2, p[1] + dy / 2], direction: Point = [-dy / length, dx / length];
    let low = -span / 2, high = span / 2;
    for (let k = 0; k < sites.length && high - low > epsilon; k++) {
      if (k === i || k === j) continue;
      const nx = sites[k][0] - p[0], ny = sites[k][1] - p[1], norm = Math.hypot(nx, ny);
      const ux = nx / norm, uy = ny / norm;
      // |mid+t*d-p|² <= |mid+t*d-sites[k]|², normalized to lengths.
      const limit = norm / 2 - (dx / 2 * ux + dy / 2 * uy);
      const slope = direction[0] * ux + direction[1] * uy;
      if (Math.abs(slope) <= 1e-14) {
        if (limit < -epsilon) { high = low; break; }
      } else if (slope > 0) high = Math.min(high, limit / slope);
      else low = Math.max(low, limit / slope);
    }
    if (high - low <= epsilon) continue;
    const at = (t: number): Point => [mid[0] + t * direction[0], mid[1] + t * direction[1]];
    edges.push({ a: at(low), b: at(high), sites: [i, j] });
  }
  return edges;
}
