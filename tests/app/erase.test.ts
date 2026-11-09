import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eraseBoxMode, pickEraseSegment, segmentsInEraseBox } from '../../src/app/erase';
import type { Assignment, Doc, Point, Segment } from '../../src/core/types';

const line = (id: string, a: Point, b: Point, assignment: Assignment = 'M'): Segment => ({ id, a, b, assignment, angle: null });
const doc = (...segments: Segment[]): Doc => ({ name: 'erase', paper: { width: 100, height: 100 }, segments });

test('single erase chooses nearest finite segment within an inclusive hit radius', () => {
  const d = doc(line('far', [0, 5], [10, 5]), line('near', [0, 0], [10, 0]));
  assert.equal(pickEraseSegment(d, [5, 1], 1, false), 'near');
  assert.equal(pickEraseSegment(d, [5, 1], 0.99, false), undefined);
  assert.equal(pickEraseSegment(d, [5, 0], 0, false), 'near');
});

test('single erase never hits only the infinite extension of a segment', () => {
  const d = doc(line('short', [0, 0], [10, 0]));
  assert.equal(pickEraseSegment(d, [20, 0], 2, false), undefined);
  assert.equal(pickEraseSegment(d, [11, 0], 1, false), 'short');
});

test('single erase ties are stable by ID regardless of document order', () => {
  const first = line('a', [0, 0], [10, 0]), second = line('z', [0, 2], [10, 2]);
  assert.equal(pickEraseSegment(doc(first, second), [5, 1], 2, false), 'a');
  assert.equal(pickEraseSegment(doc(second, first), [5, 1], 2, false), 'a');
});

test('boundary protection filters hits before choosing the nearest candidate', () => {
  const d = doc(line('boundary', [0, 0], [10, 0], 'B'), line('crease', [0, 1], [10, 1]));
  assert.equal(pickEraseSegment(d, [5, 0], 2, false), 'boundary');
  assert.equal(pickEraseSegment(d, [5, 0], 2, true), 'crease');
  assert.equal(pickEraseSegment(d, [5, 0], 0.5, true), undefined);
});

test('invalid radii or cursor coordinates return no hit', () => {
  const d = doc(line('crease', [0, 0], [10, 0]));
  for (const radius of [-1, NaN, Infinity, -Infinity]) assert.equal(pickEraseSegment(d, [5, 0], radius, false), undefined);
  for (const invalid of [NaN, Infinity, -Infinity]) assert.equal(pickEraseSegment(d, [invalid, 0], 1, false), undefined);
});

test('zero-length segments can be picked at their actual location', () => {
  const d = doc(line('point', [3, 4], [3, 4]));
  assert.equal(pickEraseSegment(d, [3, 4], 0, false), 'point');
  assert.equal(pickEraseSegment(d, [0, 0], 4, false), undefined);
});

test('box includes both endpoints on its boundaries but excludes crossing or partial segments', () => {
  const d = doc(
    line('inside', [2, 2], [8, 8]), line('edge', [0, 0], [10, 0]),
    line('crossing', [-1, 5], [11, 5]), line('partial', [5, 5], [11, 5]),
    line('outside', [11, 11], [12, 12]),
  );
  assert.deepEqual(segmentsInEraseBox(d, [0, 0], [10, 10], false), new Set(['inside', 'edge']));
});

test('fully contained and fully outside segments agree in both directions', () => {
  const d = doc(line('diagonal', [0, 0], [10, 10]), line('outside', [11, 0], [11, 10]));
  const expected = new Set(['diagonal']);
  for (const [a, b] of [
    [[0, 0], [10, 10]], [[10, 10], [0, 0]], [[10, 0], [0, 10]], [[0, 10], [10, 0]],
  ] as [Point, Point][]) assert.deepEqual(segmentsInEraseBox(d, a, b, false), expected);
});

test('horizontal direction determines mode, with vertical-only defaulting to containment', () => {
  assert.equal(eraseBoxMode([0, 10], [10, 0]), 'contained');
  assert.equal(eraseBoxMode([10, 0], [0, 10]), 'touching');
  assert.equal(eraseBoxMode([0, 10], [0, 0]), 'contained');
});

test('leftward box includes crossings, partial lines, edge and corner contact but not extensions', () => {
  const d = doc(line('inside', [2, 2], [8, 8]), line('cross', [-2, 5], [12, 5]),
    line('partial', [5, 5], [12, 6]), line('edge', [-2, 0], [12, 0]),
    line('corner', [-2, 2], [2, -2]), line('outside', [-2, 9], [1, 12]),
    line('extension', [11, 5], [12, 5]));
  assert.deepEqual(segmentsInEraseBox(d, [0, 0], [10, 10], false), new Set(['inside']));
  assert.deepEqual(segmentsInEraseBox(d, [10, 10], [0, 0], false), new Set(['inside', 'cross', 'partial', 'edge', 'corner']));
});

test('touching deletion preserves locked boundaries but includes auxiliary lines', () => {
  const d = doc(line('boundary', [-2, 5], [12, 5], 'B'), line('aux', [-2, 6], [12, 6], 'A'));
  assert.deepEqual(segmentsInEraseBox(d, [10, 10], [0, 0], true), new Set(['aux']));
  assert.deepEqual(segmentsInEraseBox(d, [10, 10], [0, 0], false), new Set(['boundary', 'aux']));
});

test('zero-height crossing box handles reversed and zero-length segments', () => {
  const d = doc(line('cross', [5, 9], [5, 1]), line('point', [3, 5], [3, 5]), line('outside', [1, 6], [9, 6]));
  assert.deepEqual(segmentsInEraseBox(d, [10, 5], [0, 5], false), new Set(['cross', 'point']));
});

test('box boundary protection affects only B assignments', () => {
  const assignments: Assignment[] = ['B', 'M', 'V', 'U', 'A', 'F'];
  const d = doc(...assignments.map((assignment, i) => line(assignment, [1, i + 1], [9, i + 1], assignment)));
  assert.deepEqual(segmentsInEraseBox(d, [0, 0], [10, 10], false), new Set(assignments));
  assert.deepEqual(segmentsInEraseBox(d, [0, 0], [10, 10], true), new Set(assignments.filter(a => a !== 'B')));
});

test('invalid box coordinates produce an empty selection', () => {
  const d = doc(line('inside', [2, 2], [8, 8]));
  for (const invalid of [NaN, Infinity, -Infinity]) {
    assert.deepEqual(segmentsInEraseBox(d, [invalid, 0], [10, 10], false), new Set());
    assert.deepEqual(segmentsInEraseBox(d, [0, 0], [10, invalid], false), new Set());
  }
});

test('malformed segment coordinates are skipped by both erase operations', () => {
  const d = doc(line('invalid', [NaN, 0], [10, 0]), line('valid', [0, 0], [10, 0]));
  assert.equal(pickEraseSegment(d, [5, 0], 1, false), 'valid');
  assert.deepEqual(segmentsInEraseBox(d, [0, 0], [10, 10], false), new Set(['valid']));
});

test('erase queries do not mutate the document or input points', () => {
  const d = doc(line('crease', [0, 0], [10, 10])), a: Point = [0, 0], b: Point = [10, 10];
  const before = JSON.stringify({ d, a, b });
  pickEraseSegment(d, a, 5, false);
  const result = segmentsInEraseBox(d, a, b, false);
  result.clear();
  assert.equal(JSON.stringify({ d, a, b }), before);
});
