import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareFoldModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/prepare';
import type {FoldDocument} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {simulationFoldSnapshot} from '../../src/engine/simDisplay';
import {triangulateSimulationWeak} from '../../src/engine/simWeak';
import {holesMaterial, mergeHoleRing} from '../fixtures/materialHoles';
import {materialSlitFixture} from '../fixtures/materialModel';

const splitSheet = (): FoldDocument => ({
  vertices_coords: [[0, 0], [1, 0], [2, 0], [2, 1], [1, 1], [0, 1]],
  edges_vertices: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 4]],
  edges_assignment: ['B', 'B', 'B', 'B', 'B', 'B', 'M'],
  edges_foldAngle: [0, 0, 0, 0, 0, 0, -180],
  faces_vertices: [[0, 1, 4, 5], [1, 2, 3, 4]],
});

test('triangles retain their original CP face IDs rather than their generated mesh indices', () => {
  const source = splitSheet(), before = structuredClone(source), prepared = prepareSimulationDocument(source).prepared;
  assert.deepEqual(prepared.triangleSourceFaces, [0, 0, 1, 1]);
  assert.equal(prepared.sourceFaceCount, 2);
  prepared.facesVertices.forEach((triangle, face) => {
    const original = source.faces_vertices[prepared.triangleSourceFaces![face]];
    assert.ok(triangle.every(vertex => original.includes(vertex)));
  });
  assert.deepEqual(source, before);
});

test('earcut and Delaunay triangulation preserve a non-triangle parent without changing the source', () => {
  const source: FoldDocument = {
    vertices_coords: [[0, 0], [3, 0], [3, 1], [2, 2], [0, 1]],
    edges_vertices: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]],
    edges_assignment: ['B', 'B', 'B', 'B', 'B'],
    faces_vertices: [[0, 1, 2, 3, 4]],
  };
  const before = structuredClone(source), prepared = prepareFoldModel(source);
  assert.equal(prepared.faceCount, 3);
  assert.deepEqual(prepared.triangleSourceFaces, [0, 0, 0]);
  assert.equal(prepared.sourceFaceCount, 1);
  assert.deepEqual(source, before);
});

test('dropping an early degenerate triangle does not renumber surviving source faces', () => {
  const source: FoldDocument = {
    vertices_coords: [[0, 0], [1, 0], [2, 0], [0, 2], [1, 2], [0, 3]],
    edges_vertices: [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 3]],
    edges_assignment: ['B', 'B', 'B', 'B', 'B', 'B'],
    faces_vertices: [[0, 1, 2], [3, 4, 5]],
  };
  const prepared = prepareFoldModel(source);
  assert.deepEqual(prepared.facesVertices, [[3, 4, 5]]);
  assert.deepEqual(prepared.triangleSourceFaces, [1]);
  assert.equal(prepared.sourceFaceCount, 2);
});

test('redundant crease vertex cleanup carries face IDs through an earlier collapsed face', () => {
  const source = splitSheet();
  source.vertices_coords.push([1, .5]);
  source.edges_vertices.splice(6, 1, [1, 6], [6, 4]);
  source.edges_assignment!.splice(6, 1, 'M', 'M');
  source.edges_foldAngle!.splice(6, 1, -180, -180);
  source.faces_vertices = [[1, 6, 4], [0, 1, 6, 4, 5], [1, 2, 3, 4, 6]];
  const before = structuredClone(source), prepared = prepareFoldModel(source);
  assert.equal(prepared.vertexCount, 6);
  assert.deepEqual(prepared.triangleSourceFaces, [1, 1, 2, 2]);
  assert.equal(prepared.sourceFaceCount, 3);
  assert.deepEqual(source, before);
});

test('hole triangulation and FOLD round trip retain the exact original face provenance', () => {
  const source = holesMaterial(mergeHoleRing().result.doc).graph;
  const before = structuredClone(source), prepared = prepareSimulationDocument(source).prepared;
  assert.equal(prepared.faceCount, 16);
  assert.equal(prepared.sourceFaceCount, source.faces_vertices!.length);
  assert.deepEqual(prepared.triangleSourceFaces, Array(16).fill(0));
  const marker = prepared.fold.zhezhi_simulation_mesh as {sourceFaceCount: number; triangleSourceFaces: number[]};
  assert.equal(marker.sourceFaceCount, 1);
  assert.deepEqual(marker.triangleSourceFaces, prepared.triangleSourceFaces);
  const snapshot = simulationFoldSnapshot(prepared, prepared.positions, 0, 0);
  const reloaded = prepareSimulationDocument(JSON.parse(JSON.stringify(snapshot))).prepared;
  assert.deepEqual(reloaded.triangleSourceFaces, prepared.triangleSourceFaces);
  assert.equal(reloaded.sourceFaceCount, 1);
  assert.deepEqual(source, before);
});

test('weak slit banks retain actual original owners through explicit v2 mesh preparation', () => {
  const source = holesMaterial(materialSlitFixture().source).graph;
  const originalMesh = triangulateSimulationWeak(source as unknown as FoldDocument);
  const before = structuredClone(originalMesh), prepared = prepareSimulationDocument(originalMesh).prepared;
  const marker = originalMesh.zhezhi_simulation_mesh as {sourceFaceCount: number; triangleSourceFaces: number[]};
  assert.equal(prepared.sourceFaceCount, source.faces_vertices!.length);
  assert.deepEqual(prepared.triangleSourceFaces, marker.triangleSourceFaces);
  assert.ok(prepared.triangleSourceFaces!.some(parent => parent !== 0));
  prepared.facesVertices.forEach((triangle, t) => {
    const ring = source.faces_vertices![prepared.triangleSourceFaces![t]];
    assert.ok(triangle.every(vertex => ring.includes(vertex)));
  });
  assert.deepEqual(originalMesh, before);
});

test('legacy v1 explicit parent labels are retained without mutating the original marker', () => {
  const source = prepareFoldModel(splitSheet()).fold;
  source.zhezhi_simulation_mesh = {schema: 'zhezhi-simulation-mesh-v1', triangleSourceFaces: [5, 5, 2, 2]};
  const before = structuredClone(source), prepared = prepareFoldModel(source);
  assert.deepEqual(prepared.triangleSourceFaces, [5, 5, 2, 2]);
  assert.equal(prepared.sourceFaceCount, 6);
  assert.deepEqual(source, before);
  prepared.triangleSourceFaces![0] = 0;
  assert.deepEqual((source.zhezhi_simulation_mesh as {triangleSourceFaces: number[]}).triangleSourceFaces, [5, 5, 2, 2]);
});

test('missing, sparse, invalid and out-of-range explicit parent mappings reject atomically', () => {
  const source = prepareFoldModel(splitSheet()).fold;
  const malformed: Record<string, unknown>[] = [
    {}, {triangleSourceFaces: [0]}, {triangleSourceFaces: [0, 0, 1, -1]},
    {triangleSourceFaces: [0, .5, 1, 1]}, {triangleSourceFaces: new Array(4)},
    {triangleSourceFaces: [0, 0, 1, 2], sourceFaceCount: 2},
    {triangleSourceFaces: [0, 0, 1, 1], sourceFaceCount: 0},
    {triangleSourceFaces: [0, 0, 1, 1]},
  ];
  for (const data of malformed) {
    const bad = structuredClone(source);
    bad.zhezhi_simulation_mesh = {schema: 'zhezhi-simulation-mesh-v2', ...data};
    const before = structuredClone(bad);
    assert.throws(() => prepareFoldModel(bad), /原纸面/);
    assert.deepEqual(bad, before);
  }
});
