import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toggleVoronoiSite, voronoiEdges } from '../../src/app/voronoi';
import type { Point } from '../../src/core/types';
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
test('zero or one seed produces no fabricated paper edges', () => {
  assert.deepEqual(voronoiEdges([]), []); assert.deepEqual(voronoiEdges([[0, 0]]), []);
});
test('two seeds produce a 1000-unit perpendicular bisector centered on midpoint', () => {
  assert.deepEqual(voronoiEdges([[0, 0], [100, 0]]), [{ a: [50, -500], b: [50, 500], sites: [0, 1] }]);
});
test('collinear sites have only adjacent separators, not every pair bisector', () => {
  const edges = voronoiEdges([[0, 0], [100, 0], [200, 0]]);
  assert.deepEqual(edges.map(e => e.sites), [[0, 1], [1, 2]]);
  assert.deepEqual(edges.map(e => e.a[0]), [50, 150]);
});
test('three noncollinear seeds meet at their circumcenter', () => {
  const edges = voronoiEdges([[0, 0], [100, 0], [0, 100]]);
  assert.equal(edges.length, 3);
  for (const e of edges) assert.ok(Math.min(distance(e.a, [50, 50]), distance(e.b, [50, 50])) < 1e-7);
});
test('cocircular square produces four rays without zero-length diagonals', () => {
  const edges = voronoiEdges([[0, 0], [100, 0], [100, 100], [0, 100]]);
  assert.equal(edges.length, 4);
  for (const e of edges) { assert.ok(distance(e.a, e.b) > 1); assert.ok(Math.min(distance(e.a, [50, 50]), distance(e.b, [50, 50])) < 1e-7); }
});
test('translation near coordinate limit preserves geometry', () => {
  const sites: Point[] = [[0, 0], [10, 0], [2, 12], [7, 5]], delta: Point = [999000, -999000];
  const original = voronoiEdges(sites), moved = voronoiEdges(sites.map(p => [p[0] + delta[0], p[1] + delta[1]]));
  assert.equal(moved.length, original.length);
  moved.forEach((e, i) => { for (const key of ['a', 'b'] as const) assert.ok(distance([e[key][0] - delta[0], e[key][1] - delta[1]], original[i][key]) < 1e-7); });
});
test('every sampled edge point is equidistant to its pair and not nearer to another seed', () => {
  let seed = 1729; const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let trial = 0; trial < 20; trial++) {
    const sites: Point[] = Array.from({ length: 12 }, () => [random() * 200, random() * 200]);
    const copy = structuredClone(sites), edges = voronoiEdges(sites);
    assert.ok(edges.length > 0);
    for (const edge of edges) for (const t of [0, .25, .5, .75, 1]) {
      const p: Point = [edge.a[0] + t * (edge.b[0] - edge.a[0]), edge.a[1] + t * (edge.b[1] - edge.a[1])];
      const d = distance(p, sites[edge.sites[0]]);
      assert.ok(Math.abs(d - distance(p, sites[edge.sites[1]])) < 1e-7);
      assert.ok(sites.every(s => distance(p, s) >= d - 1e-7));
    }
    assert.deepEqual(sites, copy);
  }
});
test('click toggles the last nearby seed and does not alias input coordinates', () => {
  const sites: Point[] = [[0, 0], [10, 0]], point: Point = [20, 0];
  const added = toggleVoronoiSite(sites, point, 2); point[0] = 90;
  assert.deepEqual(added, [[0, 0], [10, 0], [20, 0]]);
  assert.deepEqual(toggleVoronoiSite(sites, [5, 0], 5), [[0, 0]]);
  assert.deepEqual(toggleVoronoiSite(added, [20, 0], 0), sites);
});
test('invalid and near-duplicate sites reject clearly instead of producing NaN', () => {
  for (const sites of [[[0, 0], [0, 0]], [[0, 0], [1e-8, 0]], [[NaN, 1]], [[1e6 + 1, 0]]] as Point[][]) assert.throws(() => voronoiEdges(sites));
  for (const span of [0, -1, NaN, Infinity, 2e6 + 1]) assert.throws(() => voronoiEdges([[0, 0]], span));
  assert.throws(() => toggleVoronoiSite([], [0, 0], -1));
});
