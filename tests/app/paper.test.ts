import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPaperBounds, getDrawingBounds, paperPath, rasterSize } from '../../src/app/paper';
import type { Doc, Point, Segment } from '../../src/core/types';

const empty = (): Doc => ({ name: 'paper', paper: { width: 210, height: 297 }, segments: [] });
const polygon = (points: Point[], prefix = 'b'): Segment[] => points.map((a, i) => ({ id: `${prefix}${i}`, a, b: points[(i + 1) % points.length], assignment: 'B', angle: 0 }));
test('negative paper origin is preserved and auxiliary extents affect only drawing bounds', () => {
  const d = empty(); d.segments = polygon([[-200, -100], [-50, -100], [-50, -20], [-200, -20]]);
  d.segments.push({ id: 'a', a: [-300, -200], b: [400, 500], assignment: 'A', angle: 0 });
  assert.deepEqual(getPaperBounds(d), { x: -200, y: -100, width: 150, height: 80 });
  assert.deepEqual(getDrawingBounds(d), { x: -300, y: -200, width: 700, height: 700 });
});
test('empty and non-boundary drawings have safe positive bounds', () => {
  const d = empty(); assert.deepEqual(getPaperBounds(d), { x: 0, y: 0, width: 210, height: 297 }); assert.equal(paperPath(d), '');
  d.segments = [{ id: 'm', a: [-7, 9], b: [-7, 9], assignment: 'M', angle: -180 }];
  assert.deepEqual(getPaperBounds(d), { x: -7, y: 9, width: 1, height: 1 });
  d.segments.push({ id: 'bad', a: [Infinity, NaN], b: [-Infinity, 3], assignment: 'A', angle: 0 });
  assert.deepEqual(getDrawingBounds(d), { x: -7, y: 9, width: 1, height: 1 });
});
test('unordered reversed rectangle boundary builds a closed SVG path', () => {
  const d = empty(), edges = polygon([[-20, -30], [80, -30], [80, 70], [-20, 70]]);
  d.segments = [edges[2], { ...edges[0], a: edges[0].b, b: edges[0].a }, edges[3], edges[1]];
  const path = paperPath(d); assert.equal((path.match(/M/g) ?? []).length, 1); assert.equal((path.match(/L/g) ?? []).length, 3); assert.ok(path.endsWith('Z')); assert.ok(path.includes('-20,-30'));
});
test('six-sided paper uses its real boundary, not its bounding rectangle', () => {
  const d = empty(); d.segments = polygon([[10, 0], [20, 0], [30, 10], [20, 20], [10, 20], [0, 10]]);
  const path = paperPath(d); assert.equal((path.match(/L/g) ?? []).length, 5); assert.ok(path.includes('30,10')); assert.ok(!path.includes('30,20'));
});
test('multiple closed loops yield subpaths suitable for evenodd holes', () => {
  const d = empty(); d.segments = [...polygon([[0, 0], [100, 0], [100, 100], [0, 100]]), ...polygon([[30, 30], [70, 30], [70, 70], [30, 70]], 'hole')];
  assert.equal((paperPath(d).match(/Z/g) ?? []).length, 2);
});
test('open, branched, degenerate and crossing boundaries never manufacture paper', () => {
  const d = empty(); d.segments = polygon([[0, 0], [100, 0], [100, 100], [0, 100]]); d.segments.pop(); assert.equal(paperPath(d), '');
  d.segments = polygon([[0, 0], [100, 0], [100, 100], [0, 100]]); d.segments.push({ id: 'branch', a: [0, 0], b: [50, 50], assignment: 'B', angle: 0 }); assert.equal(paperPath(d), '');
  d.segments = polygon([[0, 0], [50, 0], [100, 0]]); assert.equal(paperPath(d), '');
  d.segments = polygon([[0, 0], [100, 100], [0, 100], [100, 0]]); assert.equal(paperPath(d), '');
});
test('raster output bounds preserve extreme aspect ratios without zero pixels', () => {
  assert.deepEqual(rasterSize(100, 50), { width: 2000, height: 1000 });
  assert.deepEqual(rasterSize(1e300, 1e-300), { width: 2000, height: 1 });
  assert.deepEqual(rasterSize(1e-300, 1e300), { width: 1, height: 2000 });
  assert.deepEqual(rasterSize(200, 200, 1000), { width: 1000, height: 1000 });
  for (const args of [[Infinity, NaN], [0, -3], [1e308, 1e308], [100, 50, 9000], [1, 1, 0]]) {
    const size = rasterSize(args[0], args[1], args[2]); assert.ok(Number.isInteger(size.width) && Number.isInteger(size.height)); assert.ok(size.width >= 1 && size.height >= 1); assert.ok(Math.max(size.width, size.height) <= 2000); assert.ok(size.width * size.height <= 4_000_000);
  }
});
