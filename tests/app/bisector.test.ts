import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAngleBisector, intersectBisectorTarget } from '../../src/app/bisector';
import type { AngleBisector } from '../../src/app/bisector';
import type { Point } from '../../src/core/types';

const nearPoint = (actual: Point, expected: Point, epsilon = 1e-9) => {
  assert.ok(Math.hypot(actual[0] - expected[0], actual[1] - expected[1]) <= epsilon, `${actual} ≠ ${expected}`);
};
const ray: AngleBisector = { origin: [10, 20], direction: [1, 0] };

test('bisector uses the second point as origin and returns the normalized inner direction', () => {
  const result = getAngleBisector([30, 20], [10, 20], [10, 70]);
  assert.deepEqual(result.origin, [10, 20]);
  nearPoint(result.direction, [Math.SQRT1_2, Math.SQRT1_2]);
  nearPoint(intersectBisectorTarget(result, { a: [35, 0], b: [35, 90] }), [35, 45]);
});

test('arm lengths do not bias the bisector, and reversing first/third points preserves it', () => {
  const a: Point = [40, 5], v: Point = [5, 5], b: Point = [5, 6];
  assert.deepEqual(getAngleBisector(a, v, b), getAngleBisector(b, v, a));
  nearPoint(getAngleBisector(a, v, b).direction, [Math.SQRT1_2, Math.SQRT1_2]);
});

test('changing the second point changes the vertex and selected angle', () => {
  const result = getAngleBisector([0, 0], [10, 0], [10, 10]);
  assert.deepEqual(result.origin, [10, 0]);
  nearPoint(result.direction, [-Math.SQRT1_2, Math.SQRT1_2]);
});

test('obtuse angle uses its interior bisector rather than the external perpendicular', () => {
  const result = getAngleBisector([100, 0], [0, 0], [-5, 5 * Math.sqrt(3)]);
  nearPoint(result.direction, [0.5, Math.sqrt(3) / 2]);
});

test('angles spanning the negative x axis retain the correct forward direction', () => {
  const result = getAngleBisector([-5, 1], [0, 0], [-10, -2]);
  nearPoint(result.direction, [-1, 0]);
  nearPoint(intersectBisectorTarget(result, { a: [-20, -3], b: [-20, 3] }), [-20, 0]);
});

test('finite target determines cutoff, not paper dimensions or target click position', () => {
  assert.deepEqual(intersectBisectorTarget(ray, { a: [25, 10], b: [25, 30] }), [25, 20]);
});

test('target endpoint intersections are valid and preserve exact endpoint coordinates', () => {
  assert.deepEqual(intersectBisectorTarget(ray, { a: [25, 20], b: [30, 30] }), [25, 20]);
  assert.deepEqual(intersectBisectorTarget(ray, { a: [30, 30], b: [25, 20] }), [25, 20]);
});

test('target direction and positive ray scaling cannot change the intersection', () => {
  const target = { a: [25, 0] as Point, b: [25, 50] as Point };
  const expected = intersectBisectorTarget(ray, target);
  assert.deepEqual(intersectBisectorTarget(ray, { a: target.b, b: target.a }), expected);
  assert.deepEqual(intersectBisectorTarget({ ...ray, direction: [100, 0] }, target), expected);
});

test('an intersection only on the extension of the selected segment is rejected', () => {
  assert.throws(() => intersectBisectorTarget(ray, { a: [25, 21], b: [25, 50] }), /延长线/);
  assert.throws(() => intersectBisectorTarget(ray, { a: [25, -10], b: [25, 19] }), /延长线/);
});

test('backwards intersections are rejected instead of reversing the chosen bisector', () => {
  assert.throws(() => intersectBisectorTarget(ray, { a: [5, 0], b: [5, 40] }), /反方向/);
});

test('a target through the vertex cannot create a zero-length crease', () => {
  assert.throws(() => intersectBisectorTarget(ray, { a: [10, 0], b: [10, 40] }), /零长度/);
});

test('parallel and collinear targets report distinct useful errors', () => {
  assert.throws(() => intersectBisectorTarget(ray, { a: [20, 21], b: [30, 21] }), /平行/);
  assert.throws(() => intersectBisectorTarget(ray, { a: [20, 20], b: [30, 20] }), /共线/);
  assert.throws(() => intersectBisectorTarget(ray, { a: [0, 20], b: [5, 20] }), /共线/);
});

test('zero-length and near-zero angle arms are rejected', () => {
  assert.throws(() => getAngleBisector([10, 20], [10, 20], [30, 40]), /角边长度/);
  assert.throws(() => getAngleBisector([30, 40], [10, 20], [10, 20]), /角边长度/);
  assert.throws(() => getAngleBisector([1e-12, 0], [0, 0], [0, 10]), /角边长度/);
});

test('zero angles and nearly coincident rays do not define a useful angle construction', () => {
  assert.throws(() => getAngleBisector([1, 0], [0, 0], [100, 0]), /零角/);
  assert.throws(() => getAngleBisector([1, 0], [0, 0], [100, 1e-8]), /零角/);
});

test('straight and near-straight angles are rejected before normalization instability', () => {
  assert.throws(() => getAngleBisector([1, 0], [0, 0], [-100, 0]), /平角/);
  assert.throws(() => getAngleBisector([1, 0], [0, 0], [-100, 1e-8]), /平角/);
});

test('small but nondegenerate angles remain supported', () => {
  const result = getAngleBisector([1, 0], [0, 0], [1, 1e-5]);
  assert.ok(result.direction[1] > 0);
  assert.ok(Math.abs(Math.hypot(...result.direction) - 1) < 1e-12);
});

test('degenerate targets, zero ray directions and near-parallel targets are rejected', () => {
  assert.throws(() => intersectBisectorTarget(ray, { a: [25, 20], b: [25, 20] }), /截止线段长度/);
  assert.throws(() => intersectBisectorTarget({ ...ray, direction: [0, 0] }, { a: [25, 0], b: [25, 40] }), /方向为零/);
  assert.throws(() => intersectBisectorTarget(ray, { a: [20, 21], b: [30, 21 + 1e-12] }), /平行/);
});

test('all geometric input positions reject NaN and infinities', () => {
  for (const invalid of [NaN, Infinity, -Infinity]) {
    assert.throws(() => getAngleBisector([invalid, 0], [0, 0], [0, 1]), /有限数值/);
    assert.throws(() => getAngleBisector([1, 0], [invalid, 0], [0, 1]), /有限数值/);
    assert.throws(() => getAngleBisector([1, 0], [0, 0], [0, invalid]), /有限数值/);
    assert.throws(() => intersectBisectorTarget({ origin: [invalid, 0], direction: [1, 0] }, { a: [1, -1], b: [1, 1] }), /有限数值/);
    assert.throws(() => intersectBisectorTarget({ origin: [0, 0], direction: [invalid, 0] }, { a: [1, -1], b: [1, 1] }), /有限数值/);
    assert.throws(() => intersectBisectorTarget(ray, { a: [invalid, 0], b: [25, 50] }), /有限数值/);
    assert.throws(() => intersectBisectorTarget(ray, { a: [25, 0], b: [25, invalid] }), /有限数值/);
  }
});

test('arithmetic overflow is reported instead of returning a NaN intersection', () => {
  assert.throws(() => getAngleBisector([1e308, 0], [-1e308, 0], [0, 1]), /跨度过大/);
  assert.throws(() => intersectBisectorTarget(ray, { a: [-1e308, 0], b: [1e308, 0] }), /跨度过大/);
});

test('translated and small geometries retain valid intersections', () => {
  const result = getAngleBisector([1e6 + 10, 1e6], [1e6, 1e6], [1e6, 1e6 + 20]);
  nearPoint(intersectBisectorTarget(result, { a: [1e6 + 5, 1e6], b: [1e6 + 5, 1e6 + 10] }), [1e6 + 5, 1e6 + 5]);
  const tiny = getAngleBisector([1e-4, 0], [0, 0], [0, 2e-4]);
  nearPoint(intersectBisectorTarget(tiny, { a: [5e-5, 0], b: [5e-5, 1e-4] }), [5e-5, 5e-5], 1e-12);
});

test('functions never mutate or return aliases of source points or target endpoints', () => {
  const a: Point = [10, 0], v: Point = [0, 0], b: Point = [0, 10];
  const before = JSON.stringify([a, v, b]);
  const result = getAngleBisector(a, v, b);
  const target = { a: [5, 5] as Point, b: [5, 10] as Point };
  const endpoint = intersectBisectorTarget(result, target);
  assert.equal(JSON.stringify([a, v, b]), before);
  assert.deepEqual(target, { a: [5, 5], b: [5, 10] });
  assert.notEqual(result.origin, v);
  assert.notEqual(endpoint, target.a);
  result.origin[0] = 999;
  endpoint[0] = 999;
  assert.deepEqual(v, [0, 0]);
  assert.deepEqual(target.a, [5, 5]);
});
