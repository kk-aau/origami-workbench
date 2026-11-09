import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCamv } from '../../src/app/camv';
import { type Assignment, type Doc, type Segment, defaultAngle } from '../../src/core/types';

const s = (id: string, a: [number, number], b: [number, number], assignment: Assignment): Segment => ({ id, a, b, assignment, angle: defaultAngle(assignment) });
const boundary = (): Segment[] => [s('b0', [0, 0], [100, 0], 'B'), s('b1', [100, 0], [100, 100], 'B'), s('b2', [100, 100], [0, 100], 'B'), s('b3', [0, 100], [0, 0], 'B')];
const doc = (...segments: Segment[]): Doc => ({ name: 'cAMV', paper: { width: 100, height: 100 }, segments: [...boundary(), ...segments] });

test('cAMV exposes local Maekawa failure without unrelated intersection notices', () => {
  const result = checkCamv(doc(s('a', [50, 50], [0, 50], 'M'), s('b', [50, 50], [100, 50], 'M'), s('c', [50, 50], [50, 0], 'M'), s('d', [50, 50], [50, 100], 'M')));
  assert.ok(result.issues.some(issue => issue.code === 'maekawa'));
  assert.ok(!result.issues.some(issue => issue.code === 'intersection'));
  assert.equal(result.summary.errors, 1);
});

test('cAMV retains unknown-assignment warnings and does not mutate the document', () => {
  const value = doc(s('a', [50, 50], [0, 50], 'M'), s('b', [50, 50], [100, 50], 'V'), s('c', [50, 50], [50, 0], 'U'), s('d', [50, 50], [50, 100], 'M'));
  const before = structuredClone(value), result = checkCamv(value);
  assert.ok(result.issues.some(issue => issue.code === 'unassigned'));
  assert.deepEqual(value, before);
});
