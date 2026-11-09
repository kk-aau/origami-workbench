import type { Point, Segment } from '../core/types';
import { distance, cross, sub } from '../core/geometry';
import { reflectPoint } from './mirror';
import { lineTarget } from './segmentTools';

/** Supporting-line intersection; choose the source endpoint furthest from it.
 * Equal distances use coordinate order, independent of stored endpoint order. */
export function lineReflectionPoints(source: Segment, axis: Segment, eps = 1e-6): [Point, Point, Point] {
  const points = [source.a, source.b, axis.a, axis.b];
  if (points.some(p => !Array.isArray(p) || p.length !== 2 || p.some(n => !Number.isFinite(n) || Math.abs(n) > 1e6)))
    throw new Error('参考线坐标无效或超出范围。');
  const a = sub(source.b, source.a), b = sub(axis.b, axis.a), la = Math.hypot(...a), lb = Math.hypot(...b);
  if (la <= eps || lb <= eps) throw new Error('参考线长度为零或过短，请选择其他线段。');
  const u: Point = [a[0] / la, a[1] / la], v: Point = [b[0] / lb, b[1] / lb];
  const denominator = cross(u, v);
  if (Math.abs(denominator) <= 1e-10) throw new Error('两条参考线平行、重合或近似平行，不能确定反射起点。');
  const t = cross(sub(axis.a, source.a), v) / denominator;
  const origin: Point = [source.a[0] + t * u[0], source.a[1] + t * u[1]];
  const furthest = (s: Segment): Point => {
    const da = distance(origin, s.a), db = distance(origin, s.b);
    if (Math.abs(da - db) > eps) return da > db ? s.a : s.b;
    return s.a[0] < s.b[0] || (s.a[0] === s.b[0] && s.a[1] < s.b[1]) ? s.a : s.b;
  };
  const result: [Point, Point, Point] = [[...furthest(source)], origin, [...furthest(axis)]];
  reflectionRay(...result, eps); // Also reject overflow/degenerate intersections before preview.
  return result;
}

/** A is reflected about the axis V–B. The new ray starts at V (the second click). */
export function reflectionRay(a: Point, vertex: Point, axisPoint: Point, eps = 1e-6) {
  const reflected = reflectPoint(a, vertex, axisPoint, eps);
  const length = distance(a, vertex), axisLength = distance(vertex, axisPoint);
  if (length <= eps) throw new Error('被反射点不能与第二点（起点）重合或过近。');
  if (Math.abs(cross(sub(a, vertex), sub(axisPoint, vertex))) / axisLength <= eps)
    throw new Error('被反射点位于镜面轴上，反射方向与原方向重合，请换一个点。');
  return { origin: [...vertex] as Point, direction: [(reflected[0] - vertex[0]) / length, (reflected[1] - vertex[1]) / length] as Point };
}

export function reflectionEnd(ray: ReturnType<typeof reflectionRay>, target: Segment, eps = 1e-6): Point {
  const end = lineTarget(ray.origin, ray.direction, target, eps);
  const delta = sub(end, ray.origin);
  if (delta[0] * ray.direction[0] + delta[1] * ray.direction[1] <= eps)
    throw new Error('截止线应在紫色反射方向上，不能在起点或反方向。');
  return end;
}
