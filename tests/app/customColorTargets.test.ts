import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customColorTargets } from '../../src/app/customColorTargets';
import type { Doc, Point } from '../../src/core/types';
const doc: Doc = { name: '颜色命中', paper: { width: 200, height: 200 }, segments: [{ id: 'aux', a: [0, 0], b: [100, 0], assignment: 'A', angle: 0 }], objects: [{ id: 'circle', kind: 'circle', center: [50, 50], radius: 25, color: '#123456' }] };
const point = (p: Point, tolerance = 4, d = doc) => customColorTargets(d, { kind: 'point', point: p, tolerance });
test('point coloring picks auxiliary lines, circumference or circle center', () => {
  assert.deepEqual([...point([30, 1]).segmentIds], ['aux']);
  assert.deepEqual([...point([75, 50]).circleIds], ['circle']);
  assert.deepEqual([...point([50, 50]).circleIds], ['circle']);
});
test('nearest ineligible crease blocks auxiliary lines or circles behind it', () => {
  const d: Doc = { ...doc, segments: [...doc.segments, { id: 'mountain', a: [0, 1], b: [100, 1], assignment: 'M', angle: -60 }] };
  assert.equal(point([30, 1], 4, d).segmentIds.size, 0);
  const overCircle: Doc = { ...doc, segments: [{ ...d.segments[1], a: [40, 50], b: [60, 50] }] };
  assert.equal(point([50, 50], 4, overCircle).circleIds.size, 0);
});
test('equal line distances prefer later objects; line beats circle ties', () => {
  const d: Doc = { ...doc, segments: [...doc.segments, { ...doc.segments[0], id: 'last' }] };
  assert.deepEqual([...point([50, 0], 4, d).segmentIds], ['last']);
  const c = doc.objects![0];assert.equal(c.kind, 'circle');
  const tied: Doc = { ...doc, objects: c.kind === 'circle' ? [{ ...c, center: [50, 25] }] : [] };
  assert.deepEqual([...point([50, 0], 4, tied).segmentIds], ['aux']);
  assert.equal(point([50, 0], 4, tied).circleIds.size, 0);
});
test('strict tolerance and invalid picking inputs cannot accidentally select objects', () => {
  assert.equal(point([50, 4], 4).segmentIds.size, 0);
  for (const tolerance of [0, -1, NaN, Infinity]) assert.equal(point([50, 0], tolerance).segmentIds.size, 0);
  assert.equal(point([NaN, 0]).segmentIds.size, 0);
});
test('box coloring touches auxiliary segments regardless of drag direction', () => {
  for (const [a, b] of [[[20, -5], [40, 5]], [[40, 5], [20, -5]]] as [Point, Point][]) {
    assert.deepEqual([...customColorTargets(doc, { kind: 'box', a, b }).segmentIds], ['aux']);
  }
  const d: Doc = { ...doc, segments: [{ ...doc.segments[0], assignment: 'M', angle: -180 }] };
  assert.equal(customColorTargets(d, { kind: 'box', a: [20, -5], b: [40, 5] }).segmentIds.size, 0);
});
test('circle boxes accept center or circumference but not an off-center box entirely inside disk', () => {
  const box = (a: Point, b: Point) => customColorTargets(doc, { kind: 'box', a, b }).circleIds.size;
  assert.equal(box([49, 49], [51, 51]), 1);
  assert.equal(box([74, 49], [76, 51]), 1);
  assert.equal(box([75, 49], [80, 51]), 1);
  assert.equal(box([55, 55], [60, 60]), 0);
  assert.equal(box([80, 80], [90, 90]), 0);
  assert.equal(box([20, 20], [80, 80]), 1);
});
test('color picking is read only and ignores text and mark objects', () => {
  const copy = structuredClone(doc);
  const result = customColorTargets(doc, { kind: 'box', a: [-100, -100], b: [200, 200] });
  assert.deepEqual(doc, copy); assert.equal(result.segmentIds.size, 1); assert.equal(result.circleIds.size, 1);
  const annotations: Doc = { ...doc, segments: [], objects: [{ id: 'text', kind: 'text', color: '#123456', position: [0, 0], text: '注释', fontSize: 5 }] };
  assert.equal(point([0, 0], 4, annotations).circleIds.size, 0);
});
