import { validateDoc, type Doc, type Point, type Segment } from '../core/types';
import { distance, segmentIntersection, pointOnSegment, collinearOverlap, cross, sub } from '../core/geometry';

export interface LoopCrossing { segmentId: string; edge: number; point: Point }
export interface RegionFoldCheck {
  status: 'consistent' | 'inconsistent' | 'invalid';
  message: string; crossings: LoopCrossing[]; residual: number | null;
}
const eps = 1e-4;
const edge = (a: Point, b: Point): Segment => ({ id: 'contour', a, b, assignment: 'A', angle: 0 });
const contact = (a: Segment, b: Segment) => !!segmentIntersection(a, b, eps)
  || [a.a, a.b].some(p => pointOnSegment(p, b, eps)) || [b.a, b.b].some(p => pointOnSegment(p, a, eps));
/** Mode 63 closed-loop reflection test, NOT a global flat-foldability proof. */
export function checkRegionFold(doc: Doc, points: readonly Point[]): RegionFoldCheck {
  validateDoc(doc);
  const crossings: LoopCrossing[] = [];
  const invalid = (message: string): RegionFoldCheck => ({ status: 'invalid', message, crossings, residual: null });
  if (points.some(p => !Array.isArray(p) || p.length !== 2 || p.some(n => !Number.isFinite(n) || Math.abs(n) > 1e6))) return invalid('检查轮廓坐标无效。');
  const clean = points.map(p => [...p] as Point);
  if (clean.length > 1 && distance(clean[0], clean.at(-1)!) <= eps) clean.pop();
  if (clean.length < 3) return invalid('检查轮廓至少需要三个不共线的点。');
  const edges = clean.map((p, i) => edge(p, clean[(i + 1) % clean.length]));
  if (edges.some(e => distance(e.a, e.b) <= eps)) return invalid('检查轮廓含重复或过近的相邻点。');
  if (edges.some((e, i) => collinearOverlap(e, edges[(i + 1) % edges.length], eps))) return invalid('检查轮廓含折返重叠边，请重新选择。');
  if (!clean.slice(2).some(p => Math.abs(cross(sub(clean[1], clean[0]), sub(p, clean[0]))) > eps * distance(clean[0], clean[1]))) return invalid('检查轮廓不能共线。');
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    if (j === i + 1 || i === 0 && j === edges.length - 1) continue;
    if (contact(edges[i], edges[j])) return invalid('检查轮廓自交或自接触，请重新选择简单闭合轮廓。');
  }
  const ordered: Segment[] = [];
  for (let i = 0; i < edges.length; i++) {
    const contour = edges[i], length = distance(contour.a, contour.b);
    const local: { s: Segment; t: number; point: Point }[] = [];
    for (const s of doc.segments) {
      const hit = segmentIntersection(contour, s, eps), otherLength = distance(s.a, s.b);
      if (!hit) { if (contact(contour, s)) return invalid('轮廓与线段重合或接触，请避开端点和重合线。'); continue; }
      if (hit.t <= eps / length || hit.t >= 1 - eps / length || hit.u <= eps / otherLength || hit.u >= 1 - eps / otherLength)
        return invalid('轮廓必须横穿线段内部，请避开折线端点和轮廓顶点。');
      if (s.assignment === 'U') return invalid('轮廓穿过未指派折线，请先确定其类型。');
      if (s.assignment === 'A' || s.assignment === 'F') continue;
      local.push({ s, t: hit.t, point: hit.point });
    }
    local.sort((a, b) => a.t - b.t);
    for (let j = 0; j < local.length; j++) {
      if (j && distance(local[j - 1].point, local[j].point) <= eps) return invalid('轮廓同时穿过重叠折线或交点，请调整轮廓。');
      ordered.push(local[j].s); crossings.push({ segmentId: local[j].s.id, edge: i, point: local[j].point });
    }
  }
  if (ordered.length % 2) return { status: 'inconsistent', message: '穿过折线次数为奇数，闭环几何不一致。', crossings, residual: null };
  if (!ordered.length) return { status: 'consistent', message: '轮廓未横穿折线；仅闭环检查通过，不证明区域可平折。', crossings, residual: 0 };
  // Reflect the first segment across subsequent supporting lines, as upstream.
  let a = [...ordered[0].a] as Point, b = [...ordered[0].b] as Point;
  for (const axis of ordered.slice(1)) {
    const n = distance(axis.a, axis.b), ux = (axis.b[0] - axis.a[0]) / n, uy = (axis.b[1] - axis.a[1]) / n;
    const reflect = (p: Point): Point => { const x = p[0] - axis.a[0], y = p[1] - axis.a[1], projection = x * ux + y * uy; return [axis.a[0] + 2 * projection * ux - x, axis.a[1] + 2 * projection * uy - y]; };
    a = reflect(a); b = reflect(b);
  }
  const residual = Math.max(distance(a, ordered[0].a), distance(b, ordered[0].b));
  if (!Number.isFinite(residual)) return invalid('镜像计算超出数值范围，未给出可折结论。');
  return { status: residual <= eps ? 'consistent' : 'inconsistent', message: residual <= eps
    ? '闭环几何一致；尚未检查山谷赋型、层序或全局可平折性。'
    : '连续镜像后未回到原位，闭环几何不一致。', crossings, residual };
}
