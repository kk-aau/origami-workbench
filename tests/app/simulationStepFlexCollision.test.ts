import assert from 'node:assert/strict';
import test from 'node:test';
import {certifySimulationStepFlexPath, type SimulationStepFlexCollisionMesh} from '../../src/engine/simStepFlexCollision';
import {inspectSimulationStepCollisions} from '../../src/engine/simStepCollision';

const mesh: SimulationStepFlexCollisionMesh = {indices: [0, 1, 2, 3, 4, 5], triangleSourceFaces: [7, 7]};
const horizontal = [-2, -2, 0, 2, -2, 0, 0, 2, 0];
const vertical = (z: number, height = .8) => [0, -.5, z - height, 0, .5, z - height, 0, 0, z + height];
const keyframes = (first: number[], last = first) => [{progress: 0, positions: first}, {progress: 1, positions: last}];

test('flexible triangles of the same source face still report self penetration', () => {
  const result = certifySimulationStepFlexPath(mesh, keyframes([...horizontal, ...vertical(0)]));
  assert.equal(result.status, 'collision');
  assert.deepEqual(result.pairs[0].faces, [7, 7]);
  assert.deepEqual(new Set(result.pairs[0].triangles), new Set([0, 1]));
});

test('a genuine material edge permits a continuous flexible bend', () => {
  const first = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, -1, 0];
  const last = [...first]; last[10] = -.4; last[11] = .7;
  const source = [...first], finish = [...last];
  const result = certifySimulationStepFlexPath({indices: [0, 1, 2, 1, 0, 3], triangleSourceFaces: [1, 1]}, keyframes(first, last));
  assert.equal(result.status, 'clear');
  assert.ok(result.certifiedIntervals > 0);
  assert.deepEqual(first, source);
  assert.deepEqual(last, finish);
});

test('shared edge contact cannot excuse a flattened overlap beyond that edge', () => {
  const first = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, -1, 0];
  const middle = [...first]; middle[10] = 0; middle[11] = 1;
  const last = [...first]; last[10] = 1;
  const result = certifySimulationStepFlexPath({indices: [0, 1, 2, 1, 0, 3]}, [
    {progress: 0, positions: first}, {progress: .5, positions: middle}, {progress: 1, positions: last},
  ], {maxDepth: 6});
  assert.equal(result.status, 'inconclusive');
  assert.match(result.reason!, /接触|分离/);
});

test('a shared flexible edge may bend beyond ninety degrees when a cubic separation proof remains valid', () => {
  const first = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, -1, 0];
  const middle = [...first]; middle[10] = 0; middle[11] = 1;
  const last = [...first]; last[10] = Math.cos(Math.PI / 18); last[11] = Math.sin(Math.PI / 18);
  const result = certifySimulationStepFlexPath({indices: [0, 1, 2, 1, 0, 3]}, [
    {progress: 0, positions: first}, {progress: .5, positions: middle}, {progress: 1, positions: last},
  ]);
  assert.equal(result.status, 'clear');
});

test('sharing only a material vertex does not conceal a crossing farther away', () => {
  const positions = [0, 0, 0, 2, 0, 0, 0, 2, 0, 1, 1, 1, 1, 1, -1];
  const result = certifySimulationStepFlexPath({indices: [0, 1, 2, 0, 3, 4], triangleSourceFaces: [4, 4]}, keyframes(positions));
  assert.equal(result.status, 'collision');
  assert.deepEqual(result.pairs[0].sharedVertices, [0]);
});

test('a shared-vertex flat fan remains legal when its sectors have a separating material boundary', () => {
  const first = [0, 0, 0, 1, 0, 0, 0, 1, 0, -1, 0, 0, 0, -1, 0];
  const last = [...first]; last[11] = .2; last[14] = .3;
  const result = certifySimulationStepFlexPath({indices: [0, 1, 2, 0, 3, 4]}, keyframes(first, last));
  assert.equal(result.status, 'clear');
});

test('tiny in-plane drift of a fan boundary still uses a full-interval separating plane', () => {
  const first = [-1, 0, -2.5, -1, 0, 0, 0, 0, 0, -1, 0, 1, 0, 0, 1];
  const last = [-1.000004, .0023, -2.49998, -1.000002, .0027, .000017, -.0000016, .00297, .0000158, -.999999, -.0024, 1.000004, -.0000056, .00107, 1.000014];
  const result = certifySimulationStepFlexPath({indices: [0, 1, 2, 3, 4, 2], triangleSourceFaces: [0, 0]}, keyframes(first, last));
  assert.equal(result.status, 'clear');
});

test('interval proof catches an interior crossing missed by nine sampled poses', () => {
  const first = [...horizontal, ...vertical(.13, .001)], last = [...horizontal, ...vertical(-.87, .001)];
  const evaluate = (t: number) => first.map((v, i) => v + (last[i] - v) * t);
  for (let i = 0; i <= 8; i++) assert.equal(inspectSimulationStepCollisions(mesh, evaluate(i / 8)).status, 'clear');
  const result = certifySimulationStepFlexPath(mesh, keyframes(first, last));
  assert.equal(result.status, 'collision');
  assert.ok(result.checkedPairs > 1);
});

test('unproved departure from an initially overlapping paper stack blocks the flexible path', () => {
  const first = [...horizontal, ...horizontal], last = [...horizontal, ...horizontal.map((v, i) => i % 3 === 2 ? v + 1 : v)];
  const result = certifySimulationStepFlexPath(mesh, keyframes(first, last), {maxDepth: 5});
  assert.equal(result.status, 'inconclusive');
  assert.match(result.reason!, /全区间|离层/);
});

test('sharing a vertex does not supply the missing initial stack order', () => {
  const first = [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0];
  const last = [...first]; last[11] = .5; last[14] = .5;
  const result = certifySimulationStepFlexPath({indices: [0, 1, 2, 0, 3, 4]}, keyframes(first, last), {maxDepth: 5});
  assert.equal(result.status, 'inconclusive');
});

test('parallel paper layers cannot exchange sides through coplanar contact', () => {
  const first = [...horizontal, ...horizontal.map((v, i) => i % 3 === 2 ? 1 : v)];
  const last = [...horizontal, ...horizontal.map((v, i) => i % 3 === 2 ? -1 : v)];
  const result = certifySimulationStepFlexPath(mesh, keyframes(first, last), {maxDepth: 5});
  assert.notEqual(result.status, 'clear');
});

test('linear interpolation which collapses a triangle is rejected even without another face', () => {
  const first = [0, 0, 0, 1, 0, 0, 0, 1, 0], last = [...first]; last[7] = -1;
  const result = certifySimulationStepFlexPath({indices: [0, 1, 2]}, keyframes(first, last), {maxDepth: 5});
  assert.equal(result.status, 'inconclusive');
  assert.match(result.reason!, /退化/);
});

test('budget exhaustion and malformed keyframes cannot claim a safe flexible trajectory', () => {
  const positions = [...horizontal, ...vertical(2)];
  assert.equal(certifySimulationStepFlexPath(mesh, keyframes(positions), {maxTimeMs: 0}).status, 'inconclusive');
  assert.equal(certifySimulationStepFlexPath(mesh, keyframes([...horizontal, ...vertical(0)]), {maxPairs: 0}).status, 'inconclusive');
  assert.equal(certifySimulationStepFlexPath(mesh, [{progress: 0, positions}, {progress: 0, positions}]).status, 'inconclusive');
  assert.equal(certifySimulationStepFlexPath(mesh, keyframes([...positions.slice(0, -1), Number.NaN])).status, 'inconclusive');
});

test('nonfinite tolerances and budgets cannot bypass the projection orientation condition', () => {
  // A simple square boundary with its fan center outside. Its signed triangle
  // areas disagree, so it cannot use the degree-one embedding certificate.
  const positions = [2, 2, 0, -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0];
  const folded = {indices: [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1]};
  for (const tolerance of [Number.NaN, Infinity, -Infinity, -1]) assert.equal(certifySimulationStepFlexPath(folded, keyframes(positions), {tolerance}).status, 'inconclusive');
  assert.equal(certifySimulationStepFlexPath(folded, keyframes(positions), {maxTimeMs: Number.NaN}).status, 'inconclusive');
  assert.equal(certifySimulationStepFlexPath(folded, keyframes(positions), {maxPairs: Number.NaN}).status, 'inconclusive');
});

test('all linear segments, including the return to flat, receive the certificate', () => {
  const first = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, -1, 0], middle = [...first]; middle[10] = -.5; middle[11] = .8;
  const result = certifySimulationStepFlexPath({indices: [0, 1, 2, 1, 0, 3]}, [
    {progress: 0, positions: first}, {progress: .5, positions: middle}, {progress: 1, positions: first},
  ]);
  assert.equal(result.status, 'clear');
  assert.equal(result.certifiedIntervals, 2);
});

test('a connected curved material patch certifies every refined triangle without source-face exclusions', () => {
  const positions: number[] = [], indices: number[] = [], divisions = 4;
  for (let y = 0; y <= divisions; y++) for (let x = 0; x <= divisions; x++) positions.push(x, y, 0);
  for (let y = 0; y < divisions; y++) for (let x = 0; x < divisions; x++) {
    const a = y * (divisions + 1) + x, b = a + 1, c = a + divisions + 1, d = c + 1;
    indices.push(a, b, c, b, d, c);
  }
  const lifted = positions.map((value, i) => i % 3 === 2 ? .3 * Math.sin(positions[i - 2]) * Math.sin(positions[i - 1]) : value);
  const result = certifySimulationStepFlexPath({indices, triangleSourceFaces: Array(indices.length / 3).fill(8)}, [
    {progress: 0, positions}, {progress: .3, positions: lifted}, {progress: .5, positions: lifted.map((value, i) => i % 3 === 2 ? value * 2 : value)}, {progress: 1, positions},
  ]);
  assert.equal(result.status, 'clear');
  assert.ok(result.checkedPairs > indices.length / 3);
});

test('a dense oriented disk uses its continuous embedding proof within a boundary-pair budget', () => {
  const first: number[] = [], indices: number[] = [], divisions = 12;
  for (let y = 0; y <= divisions; y++) for (let x = 0; x <= divisions; x++) first.push(x, y, 0);
  for (let y = 0; y < divisions; y++) for (let x = 0; x < divisions; x++) {
    const a = y * (divisions + 1) + x, b = a + 1, c = a + divisions + 1, d = c + 1;
    indices.push(a, b, c, b, d, c);
  }
  const last = first.map((value, i) => i % 3 === 2 ? .1 * Math.sin(first[i - 2] / 3) * Math.sin(first[i - 1] / 3) : value);
  const result = certifySimulationStepFlexPath({indices, triangleSourceFaces: Array(indices.length / 3).fill(0)}, keyframes(first, last), {maxPairs: 1200});
  assert.equal(result.status, 'clear');
  assert.equal(result.certifiedIntervals, 1);
  assert.ok(result.checkedPairs <= 1200);
});

test('positive triangle orientation alone cannot certify a disk with a nonsimple projected boundary', () => {
  // A combinatorial disk that covers a triangle twice. Every projected face
  // has positive area, but nonadjacent boundary vertices/edges coincide.
  const positions = [0, 0, 0], indices: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI * 2 / 3;
    positions.push(Math.cos(angle), Math.sin(angle), 0);
    indices.push(0, i + 1, (i + 1) % 6 + 1);
  }
  const result = certifySimulationStepFlexPath({indices}, keyframes(positions), {maxDepth: 4});
  assert.notEqual(result.status, 'clear');
});

test('adjacent projected boundary edges cannot fold back onto the same ray between keyframes', () => {
  const first = [0, 0, 0, 2, 0, 0, 0, 2, 0, -2, 0, 0];
  const middle = [...first]; middle[10] = 1; middle[11] = .3;
  const last = [...first]; last[9] = 1; last[10] = 0;
  const result = certifySimulationStepFlexPath({indices: [0, 1, 2, 0, 2, 3]}, [
    {progress: 0, positions: first}, {progress: .4, positions: middle}, {progress: 1, positions: last},
  ], {maxDepth: 5});
  assert.notEqual(result.status, 'clear');
});
