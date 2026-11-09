import test from 'node:test';
import assert from 'node:assert/strict';
import { OrigamiModel } from '../src/model';
import { prepareFoldModel } from '../src/prepare';
import { ReferenceSolver } from '../src/referenceSolver';

function makeSolver(options: { integrationType?: 'euler' | 'verlet' } = {}) {
  const prepared = prepareFoldModel({
    vertices_coords: [[0, 0], [1, 0], [2, 0], [2, 1], [1, 1], [0, 1]],
    edges_vertices: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 4]],
    edges_assignment: ['B', 'B', 'B', 'B', 'B', 'B', 'M'],
    edges_foldAngle: [null, null, null, null, null, null, -180],
    faces_vertices: [[0, 1, 4, 5], [1, 2, 3, 4]],
  });
  const model = new OrigamiModel(prepared);
  return { model, solver: new ReferenceSolver(model, { foldPercent: 50, ...options }) };
}

function vertex(solver: ReferenceSolver, index: number): [number, number, number] {
  const positions = new Float32Array(solver.model.positions.length);
  solver.readPositions(positions);
  return [positions[index * 3]!, positions[index * 3 + 1]!, positions[index * 3 + 2]!];
}

test('Euler vertex constraint holds and moves the real mesh vertex; release keeps current position', () => {
  const { model, solver } = makeSolver();
  try {
    solver.step(100);
    const before = vertex(solver, 0);
    const target: [number, number, number] = [before[0] + 0.1, before[1] + 0.05, before[2]];
    solver.setVertexConstraint(0, target);
    assert.deepEqual(vertex(solver, 0), target.map(Math.fround));
    solver.step(200);
    assert.deepEqual(vertex(solver, 0), target.map(Math.fround));

    const moved: [number, number, number] = [target[0], target[1] + 0.04, target[2]];
    solver.setVertexConstraint(0, moved);
    solver.step(30);
    assert.deepEqual(vertex(solver, 0), moved.map(Math.fround));
    solver.setVertexConstraint(0, null);
    const atRelease = vertex(solver, 0);
    solver.step(1);
    const afterRelease = vertex(solver, 0);
    assert.ok(Math.hypot(...afterRelease.map((value, axis) => value - atRelease[axis]!)) < 0.01);
    assert.ok(Number.isFinite(solver.maxVelocity()));

    solver.setVertexConstraint(0, moved);
    solver.reset();
    assert.deepEqual(vertex(solver, 0), Array.from(model.originalPositions.subarray(0, 3)));
    solver.step(1);
    assert.notDeepEqual(vertex(solver, 0), moved.map(Math.fround));
  } finally { solver.dispose(); }
});

test('vertex constraints reject bad indices, nonfinite targets, and unsupported Verlet integration', () => {
  const { solver } = makeSolver();
  try {
    assert.throws(() => solver.setVertexConstraint(-1, [0, 0, 0]), /索引/);
    assert.throws(() => solver.setVertexConstraint(999, [0, 0, 0]), /索引/);
    assert.throws(() => solver.setVertexConstraint(0, [0, Number.NaN, 0]), /有限/);
    solver.setVertexConstraint(0, vertex(solver, 0));
    assert.throws(() => solver.setMaterial({ integrationType: 'verlet' }), /Verlet/);
    assert.equal(solver.options.integrationType, 'euler');
  } finally { solver.dispose(); }

  const verlet = makeSolver({ integrationType: 'verlet' }).solver;
  try {
    assert.throws(() => verlet.setVertexConstraint(0, vertex(verlet, 0)), /Verlet/);
    assert.doesNotThrow(() => verlet.setVertexConstraint(0, null));
  } finally { verlet.dispose(); }
});
