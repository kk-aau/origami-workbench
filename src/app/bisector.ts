import type { Point, Segment } from '../core/types';

export interface AngleBisector { origin: Point; direction: Point }

const ANGULAR_EPSILON = 1e-8;
const PARALLEL_EPSILON = 1e-10;
const subtract = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];

function validatePoints(...points: Point[]): void {
  if (!points.every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite))) {
    throw new Error('作图坐标或方向必须是有限数值。');
  }
}

// Absolute millimetre tolerance plus a small allowance for floating-point loss
// when subtracting translated coordinates. This is not a screen/snap tolerance.
function positionEpsilon(...points: Point[]): number {
  return Math.max(1e-9, 16 * Number.EPSILON * Math.max(1, ...points.flat().map(Math.abs)));
}

function normalized(vector: Point, epsilon: number, message: string): Point {
  const length = Math.hypot(...vector);
  if (!Number.isFinite(length)) throw new Error('作图坐标跨度过大，无法可靠计算角平分线。');
  if (length <= epsilon) throw new Error(message);
  return [vector[0] / length, vector[1] / length];
}

/** A → vertex → B: the second point is always the ray origin. */
export function getAngleBisector(a: Point, vertex: Point, b: Point): AngleBisector {
  validatePoints(a, vertex, b);
  const epsilon = positionEpsilon(a, vertex, b);
  const armA = normalized(subtract(a, vertex), epsilon, '角边长度为零或过短，请重新选择与顶点不同的点。');
  const armB = normalized(subtract(b, vertex), epsilon, '角边长度为零或过短，请重新选择与顶点不同的点。');
  if (Math.abs(cross(armA, armB)) <= ANGULAR_EPSILON) {
    if (dot(armA, armB) >= 0) throw new Error('三点形成零角或接近零角，请重新选择角的两边。');
    throw new Error('三点形成平角或接近平角，无法唯一确定内角平分方向。');
  }
  const direction = normalized([armA[0] + armB[0], armA[1] + armB[1]], ANGULAR_EPSILON, '无法确定角平分方向。');
  return { origin: [...vertex], direction };
}

/**
 * Intersect the forward ray with the selected finite segment, including its
 * endpoints. Neither an extension of the target nor the reverse ray is valid.
 * Collinear targets do not define a unique cutoff and must be selected again.
 */
export function intersectBisectorTarget(bisector: AngleBisector, target: Pick<Segment, 'a' | 'b'>): Point {
  validatePoints(bisector.origin, bisector.direction, target.a, target.b);
  const epsilon = positionEpsilon(bisector.origin, target.a, target.b);
  const ray = normalized(bisector.direction, 1e-12, '角平分方向为零，请重新选择角的三个点。');
  const edge = subtract(target.b, target.a), edgeLength = Math.hypot(...edge);
  const edgeUnit = normalized(edge, epsilon, '截止线段长度为零或过短，请选择其他线段或边界。');
  const delta = subtract(target.a, bisector.origin);
  if (!delta.every(Number.isFinite)) throw new Error('作图坐标跨度过大，无法可靠计算角平分线。');
  const denominator = cross(ray, edgeUnit);
  if (Math.abs(denominator) <= PARALLEL_EPSILON) {
    if (Math.abs(cross(delta, ray)) <= epsilon) throw new Error('截止线段与角平分线共线，无法确定唯一截止点，请选择其他线段。');
    throw new Error('截止线段与角平分线平行或近似平行，请选择其他线段。');
  }
  const forward = cross(delta, edgeUnit) / denominator;
  const along = cross(delta, ray) / denominator;
  if (!Number.isFinite(forward) || !Number.isFinite(along)) throw new Error('交点数值超出可计算范围，请选择其他截止线段。');
  if (forward < -epsilon) throw new Error('交点位于角平分线的反方向，请选择角内方向上的线段或边界。');
  if (forward <= epsilon) throw new Error('截止点与角顶点重合或过近，不能生成零长度角平分线。');
  if (along < -epsilon || along > edgeLength + epsilon) throw new Error('角平分线未与所选线段相交；线段延长线上的交点不能作为截止点。');
  // Keep a true endpoint's exact coordinates, without moving the source target.
  if (Math.abs(along) <= epsilon) return [...target.a];
  if (Math.abs(along - edgeLength) <= epsilon) return [...target.b];
  const result: Point = [target.a[0] + edgeUnit[0] * along, target.a[1] + edgeUnit[1] * along];
  if (!result.every(Number.isFinite)) throw new Error('交点数值超出可计算范围，请选择其他截止线段。');
  return result;
}
