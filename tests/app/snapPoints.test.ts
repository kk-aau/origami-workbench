import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapPoints, editorJunctionPoints, nearestSnapPoint } from '../../src/app/snapPoints';
import type { Doc, Point, Segment, Assignment } from '../../src/core/types';

const segment = (id: string, a: Point, b: Point, assignment: Assignment = 'M'): Segment => ({ id, a, b, assignment, angle: assignment === 'M' ? -180 : assignment === 'V' ? 180 : 0 });
const document = (...segments: Segment[]): Doc => ({ name: '吸附测试', paper: { width: 200, height: 200 }, segments });
const at = (doc: Doc, point: Point) => nearestSnapPoint(buildSnapPoints(doc), point, 1e-5);

test('retained split point stays visible selectable and snappable after crossing segments are deleted',()=>{
 const remaining=document(segment('left',[0,5],[5,5]),segment('right',[5,5],[10,5]));
 const crossed=document(...remaining.segments,segment('up',[5,0],[5,5],'V'),segment('down',[5,5],[5,10],'V'));
 const before=structuredClone(remaining),cross=at(crossed,[5,5])!,points=buildSnapPoints(remaining),junctions=editorJunctionPoints(points);
 assert.equal(cross.kind,'intersection');assert.equal(junctions.length,1);assert.equal(junctions[0].id,cross.id);assert.equal(junctions[0].kind,'endpoint');assert.deepEqual(junctions[0].segmentIds,['left','right']);
 assert.equal(nearestSnapPoint(junctions,[5.1,5],.2)?.id,cross.id);assert.equal(nearestSnapPoint(points,[5.1,5],.2)?.id,cross.id);assert.deepEqual(remaining,before);
 assert.equal(editorJunctionPoints(buildSnapPoints(document(segment('merged',[0,5],[10,5])))).length,0);
});

test('crossed finite lines generate a selectable intersection with both source IDs', () => {
  const doc = document(segment('mountain', [0, 0], [10, 10]), segment('valley', [0, 10], [10, 0], 'V'));
  const points = buildSnapPoints(doc);
  assert.equal(points.length, 5);
  assert.deepEqual(at(doc, [5, 5]), { id: 'point:5,5', point: [5, 5], segmentIds: ['mountain', 'valley'], kind: 'intersection' });
});

test('non-grid intersections retain exact computed geometry rather than grid rounding', () => {
  const doc = document(segment('a', [0, 0], [3, 1]), segment('b', [0, 1], [4, 0]));
  const point = at(doc, [12 / 7, 4 / 7]);
  assert.ok(point);
  assert.ok(Math.abs(point.point[0] - 12 / 7) < 1e-12);
  assert.equal(point.kind, 'intersection');
});

test('T junctions and shared non-collinear endpoints stay intersections after splitting', () => {
  const unsplit = document(segment('h', [0, 0], [10, 0]), segment('v', [5, 0], [5, 10]));
  const split = document(segment('h1', [0, 0], [5, 0]), segment('h2', [5, 0], [10, 0]), segment('v', [5, 0], [5, 10]));
  assert.equal(at(unsplit, [5, 0])?.kind, 'intersection');
  assert.equal(at(split, [5, 0])?.kind, 'intersection');
  assert.deepEqual(at(split, [5, 0])?.segmentIds, ['h1', 'h2', 'v']);
  assert.equal(at(unsplit, [5, 0])?.id, at(split, [5, 0])?.id);
});

test('all line types including auxiliary and boundary contribute snap geometry', () => {
  const kinds: Assignment[] = ['M', 'V', 'B', 'U', 'A', 'F'];
  const doc = document(...kinds.map((kind, i) => segment(kind, [-10, i - 2], [10, 2 - i], kind)));
  const origin = at(doc, [0, 0]);
  assert.equal(origin?.kind, 'intersection');
  assert.deepEqual(origin?.segmentIds, [...kinds].sort());
  assert.equal(buildSnapPoints(doc).filter(p => p.kind === 'intersection').length, 1);
});

test('collinear overlap exposes only finite existing endpoints, not pseudo-intersections', () => {
  const doc = document(segment('a', [0, 0], [10, 0]), segment('b', [3, 0], [7, 0]));
  const points = buildSnapPoints(doc);
  assert.deepEqual(points.map(p => p.point), [[0, 0], [3, 0], [7, 0], [10, 0]]);
  assert.ok(points.every(p => p.kind === 'endpoint'));
  assert.deepEqual(at(doc, [3, 0])?.segmentIds, ['a', 'b']);
  assert.deepEqual(at(doc, [10, 0])?.segmentIds, ['a']);
});

test('duplicates and reversed lines deduplicate without assignment conflicts', () => {
  const doc = document(segment('a', [0, 0], [10, 0]), segment('b', [10, 0], [0, 0], 'V'));
  const points = buildSnapPoints(doc);
  assert.equal(points.length, 2);
  assert.ok(points.every(p => p.kind === 'endpoint'));
  assert.ok(points.every(p => p.segmentIds.join(',') === 'a,b'));
});

test('parallel lines and crossing extensions do not produce intersections', () => {
  const doc = document(segment('a', [0, 0], [2, 0]), segment('b', [0, 2], [2, 2]), segment('c', [3, -1], [3, 1]));
  assert.equal(buildSnapPoints(doc).length, 6);
  assert.ok(buildSnapPoints(doc).every(p => p.kind === 'endpoint'));
  assert.equal(at(doc, [3, 0]), null);
});

test('near-coincident endpoints are deduplicated across spatial bucket boundaries', () => {
  const doc = document(segment('a', [-10, 0], [1.9999999, 0]), segment('b', [2.0000001, 0], [2, 10]));
  const points = buildSnapPoints(doc);
  assert.equal(points.length, 3);
  assert.deepEqual(at(doc, [2, 0])?.segmentIds, ['a', 'b']);
});

test('zero-length segments remain a finite endpoint without NaN or fake intersections', () => {
  const doc = document(segment('zero', [2, 0], [2, 0]), segment('line', [0, 0], [4, 0]));
  const points = buildSnapPoints(doc);
  assert.equal(points.length, 3);
  assert.deepEqual(at(doc, [2, 0])?.segmentIds, ['line', 'zero']);
  assert.equal(at(doc, [2, 0])?.kind, 'endpoint');
  assert.ok(points.every(p => p.point.every(Number.isFinite)));
});

test('negative coordinates are preserved and non-finite corrupt segments are safely ignored', () => {
  const doc = document(segment('a', [-9, -9], [-1, -1]), segment('b', [-9, -1], [-1, -9]), segment('bad', [NaN, 1], [3, 4]));
  assert.deepEqual(at(doc, [-5, -5])?.point, [-5, -5]);
  assert.equal(buildSnapPoints(doc).length, 5);
});

test('derivation is immutable, deterministic across order, and recomputes after edit/undo', () => {
  const doc = document(segment('a', [0, 0], [10, 10]), segment('b', [0, 10], [10, 0]));
  const before = structuredClone(doc), points = buildSnapPoints(doc);
  assert.deepEqual(doc, before);
  assert.deepEqual(buildSnapPoints(doc), points);
  assert.deepEqual(buildSnapPoints({ ...doc, segments: [...doc.segments].reverse() }), points);
  const changed = { ...doc, segments: [doc.segments[0], { ...doc.segments[1], a: [0, 8] as Point, b: [8, 0] as Point }] };
  assert.equal(at(changed, [5, 5]), null);
  assert.equal(at(changed, [4, 4])?.kind, 'intersection');
  assert.deepEqual(buildSnapPoints(before), points);
});

test('nearest point enforces radius, deterministic ties, and excluded point IDs', () => {
  const points = buildSnapPoints(document(segment('a', [0, 0], [10, 0]), segment('b', [5, -5], [5, 5])));
  const hit = nearestSnapPoint(points, [5.1, .1], .2);
  assert.equal(hit?.id, 'point:5,0');
  assert.equal(nearestSnapPoint(points, [5.1, .1], .1), null);
  assert.equal(nearestSnapPoint(points, [5.1, .1], .2, new Set([hit!.id])), null);
  assert.equal(nearestSnapPoint(points, [5, 0], 0)?.id, 'point:5,0');
  assert.equal(nearestSnapPoint(points, [2.5, 0], 2.5)?.kind, 'intersection');
  assert.equal(nearestSnapPoint(points, [0, 0], -1), null);
  assert.equal(nearestSnapPoint(points, [NaN, 0], 10), null);
  assert.equal(nearestSnapPoint(points, [0, 0], Infinity), null);
  assert.deepEqual(buildSnapPoints(document()), []);
});

test('dense crossing grid deduplicates all interior crossings and joins', () => {
  const lines: Segment[] = [];
  for (let i = 0; i < 30; i++) {
    lines.push(segment(`h${i}`, [0, i], [29, i]));
    lines.push(segment(`v${i}`, [i, 0], [i, 29]));
  }
  const points = buildSnapPoints(document(...lines));
  assert.equal(points.length, 900);
  assert.ok(points.every(p => p.kind === 'intersection' && p.segmentIds.length === 2));
});
