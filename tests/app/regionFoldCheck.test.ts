import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRegionFold } from '../../src/app/regionFoldCheck';
import type { Doc, Point, Segment } from '../../src/core/types';
const contour: Point[] = [[-10, -10], [10, -10], [10, 10], [-10, 10]];
const s = (id: string, a: Point, b: Point, assignment: Segment['assignment'] = 'M'): Segment => ({ id, a, b, assignment, angle: assignment === 'M' ? -180 : assignment === 'V' ? 180 : 0 });
const doc = (...segments: Segment[]): Doc => ({ name: '闭环检查', paper: { width: 200, height: 200 }, segments });
test('empty region is consistent but explicitly not a foldability proof', () => {
  const r = checkRegionFold(doc(), contour); assert.equal(r.status, 'consistent'); assert.match(r.message, /不证明/); assert.equal(r.crossings.length, 0);
});
test('one through crease is crossed twice and has zero reflection residual', () => {
  const r = checkRegionFold(doc(s('line', [-20, 0], [20, 0])), contour);
  assert.equal(r.status, 'consistent'); assert.equal(r.crossings.length, 2); assert.equal(r.residual, 0);
});
test('one ray yields odd parity while an angled pair yields nonzero closure error', () => {
  assert.equal(checkRegionFold(doc(s('ray', [0, 0], [20, 0])), contour).status, 'inconsistent');
  const r = checkRegionFold(doc(s('a', [0, 0], [20, 0]), s('b', [0, 0], [5, 20])), contour);
  assert.equal(r.crossings.length, 2); assert.equal(r.status, 'inconsistent'); assert.ok(r.residual! > 1);
});
test('four orthogonal rays pass geometric closure independently of mountain assignment', () => {
  const d = doc(s('r', [0, 0], [20, 0]), s('l', [0, 0], [-20, 0]), s('t', [0, 0], [0, -20]), s('b', [0, 0], [0, 20]));
  const r = checkRegionFold(d, contour); assert.equal(r.status, 'consistent'); assert.match(r.message, /尚未检查山谷/);
  assert.equal(checkRegionFold(d, [...contour].reverse()).status, r.status);
});
test('endpoint touch, overlap and contour vertex crossing are invalid, including auxiliary contact', () => {
  for (const line of [s('end', [10, 0], [20, 0]), s('overlap', [-5, -10], [5, -10]), s('corner', [0, 0], [20, 20]), s('aux', [10, 0], [20, 0], 'A')]) assert.equal(checkRegionFold(doc(line), contour).status, 'invalid');
});
test('auxiliary crossings do not reflect, while unknown assignments are not silently accepted', () => {
  assert.equal(checkRegionFold(doc(s('aux', [0, 0], [20, 0], 'A')), contour).crossings.length, 0);
  assert.equal(checkRegionFold(doc(s('unknown', [0, 0], [20, 0], 'U')), contour).status, 'invalid');
});
test('malformed contours and simultaneous overlapping crossings reject without mutating input', () => {
  assert.equal(checkRegionFold(doc(), [[0, 0], [10, 0], [5, 0], [5, 10]]).status, 'invalid');
  for (const points of [[], [[0, 0], [1, 0], [2, 0]], [[-10, -10], [10, 10], [-10, 10], [10, -10]], [[NaN, 0], [1, 0], [0, 1]]] as Point[][]) assert.equal(checkRegionFold(doc(), points).status, 'invalid');
  const d = doc(s('a', [-20, 0], [20, 0]), s('b', [-20, 0], [20, 0])), copy = structuredClone(d);
  assert.equal(checkRegionFold(d, contour).status, 'invalid'); assert.deepEqual(d, copy);
});
