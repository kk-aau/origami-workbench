import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitEditableSegments, splitEditableSegmentsWithMap } from '../../src/app/planarize';
import { buildFold, distance, epsilonFor } from '../../src/core/geometry';
import { defaultAngle, validateDoc, type Assignment, type Doc, type Point, type Segment } from '../../src/core/types';

const line = (id: string, a: Point, b: Point, assignment: Assignment = 'M', angle = defaultAngle(assignment)): Segment => ({ id, a, b, assignment, angle });
const doc = (...segments: Segment[]): Doc => ({ name: 'editable planarization', paper: { width: 100, height: 100 }, segments });
const endpoints = (segments: Segment[]) => segments.map(segment => [segment.a, segment.b]);

test('intersection fragment IDs also avoid existing drawing object IDs',()=>{
  const source=doc(line('horizontal',[0,50],[100,50]),line('vertical',[50,0],[50,100],'V'));
  source.objects=[{id:'horizontal::split:2',kind:'text',position:[10,10],text:'保留注释',fontSize:5,color:'#000000'}];
  validateDoc(source);const before=structuredClone(source),result=splitEditableSegmentsWithMap(source);
  assert.doesNotThrow(()=>validateDoc(result.doc));assert.equal(result.doc.segments.length,4);
  assert.deepEqual(result.doc.objects,source.objects);assert.deepEqual(source,before);
  assert.ok(result.descendants.get('horizontal')!.every(id=>id!=='horizontal::split:2'));
});

test('X crossing becomes four independently identified editable pieces', () => {
  const result = splitEditableSegmentsWithMap(doc(line('horizontal', [0, 50], [100, 50]), line('vertical', [50, 0], [50, 100], 'V')));
  assert.equal(result.doc.segments.length, 4);
  assert.equal(new Set(result.doc.segments.map(s => s.id)).size, 4);
  assert.deepEqual(endpoints(result.doc.segments), [
    [[0, 50], [50, 50]], [[50, 50], [100, 50]], [[50, 0], [50, 50]], [[50, 50], [50, 100]],
  ]);
  assert.equal(result.descendants.get('horizontal')![0], 'horizontal');
  assert.equal(result.descendants.get('horizontal')!.length, 2);
  assert.equal(result.descendants.get('vertical')!.length, 2);
  validateDoc(result.doc);
});

test('T junction splits only the passing segment, preserving terminating line reference', () => {
  const terminating = line('terminating', [30, 50], [30, 80], 'V');
  const result = splitEditableSegments(doc(line('passing', [0, 50], [100, 50]), terminating));
  assert.equal(result.segments.length, 3);
  assert.equal(result.segments[2], terminating);
  assert.deepEqual(result.segments[0].b, terminating.a);
});

test('boundary segments are split and retain B assignment and zero angle', () => {
  const result = splitEditableSegments(doc(line('boundary', [0, 0], [100, 0], 'B'), line('crease', [30, 0], [30, 80])));
  assert.equal(result.segments.filter(s => s.assignment === 'B').length, 2);
  assert.ok(result.segments.filter(s => s.assignment === 'B').every(s => s.angle === 0));
  assert.deepEqual(result.segments[0].b, [30, 0]);
});

test('auxiliary line intersections split both editor lines without becoming computational creases', () => {
  const square = [line('b0', [0, 0], [100, 0], 'B'), line('b1', [100, 0], [100, 100], 'B'), line('b2', [100, 100], [0, 100], 'B'), line('b3', [0, 100], [0, 0], 'B')];
  const result = splitEditableSegments(doc(...square, line('aux', [0, 50], [100, 50], 'A'), line('valley', [50, 0], [50, 100], 'V')));
  assert.equal(result.segments.filter(s => s.assignment === 'A').length, 2);
  assert.equal(result.segments.filter(s => s.assignment === 'V').length, 2);
  const graph = buildFold(result).graph;
  assert.ok(!graph.edges_assignment.includes('A'));
  assert.equal(graph.faces_vertices?.length, 2);
});

test('multiple crossings are ordered along source orientation, not pair traversal', () => {
  const result = splitEditableSegmentsWithMap(doc(
    line('horizontal', [100, 50], [0, 50]), line('left', [20, 0], [20, 100]), line('right', [80, 0], [80, 100]), line('middle', [50, 0], [50, 100]),
  ));
  const children = new Set(result.descendants.get('horizontal'));
  assert.deepEqual(endpoints(result.doc.segments.filter(s => children.has(s.id))), [
    [[100, 50], [80, 50]], [[80, 50], [50, 50]], [[50, 50], [20, 50]], [[20, 50], [0, 50]],
  ]);
});

test('collinear overlaps split at endpoints but never merge different assignments or angles', () => {
  const inner = line('valley', [75, 50], [25, 50], 'V', 45);
  const result = splitEditableSegments(doc(line('mountain', [0, 50], [100, 50], 'M', -90), inner));
  assert.equal(result.segments.length, 4);
  assert.deepEqual(endpoints(result.segments.slice(0, 3)), [
    [[0, 50], [25, 50]], [[25, 50], [75, 50]], [[75, 50], [100, 50]],
  ]);
  assert.ok(result.segments.slice(0, 3).every(s => s.assignment === 'M' && s.angle === -90));
  assert.equal(result.segments[3], inner);
});

test('fully duplicate segments remain distinct, with their original identities', () => {
  const d = doc(line('mountain', [0, 0], [100, 0]), line('valley', [100, 0], [0, 0], 'V'));
  assert.equal(splitEditableSegments(d), d);
});

test('intersections of infinite extensions do not split finite source segments', () => {
  const d = doc(line('short', [0, 0], [10, 0]), line('above', [5, 1], [5, 10]), line('beyond', [20, -10], [20, 10]));
  assert.equal(splitEditableSegments(d), d);
});

test('shared endpoints do not create redundant pieces', () => {
  const d = doc(line('a', [0, 0], [10, 10]), line('b', [10, 10], [20, 0]), line('c', [10, 10], [10, 30]));
  assert.equal(splitEditableSegments(d), d);
});

test('an unchanged document is returned by reference with complete identity mappings', () => {
  const d = doc(line('a', [0, 0], [10, 0]), line('b', [0, 20], [10, 20]));
  const result = splitEditableSegmentsWithMap(d);
  assert.equal(result.doc, d);
  assert.deepEqual(result.descendants, new Map([['a', ['a']], ['b', ['b']]]));
});

test('split output is idempotent by reference and stable across identical invocations', () => {
  const d = doc(line('h', [0, 50], [100, 50]), line('v', [50, 0], [50, 100]), line('overlap', [25, 50], [75, 50], 'A'));
  const first = splitEditableSegments(d), second = splitEditableSegments(first);
  assert.equal(second, first);
  assert.deepEqual(splitEditableSegments(d), first);
  const mapping = splitEditableSegmentsWithMap(first).descendants;
  assert.ok(first.segments.every(segment => mapping.get(segment.id)?.[0] === segment.id && mapping.get(segment.id)?.length === 1));
});

test('derived IDs cannot overwrite imported IDs that resemble a generated suffix', () => {
  const original = line('h::split:2', [0, 90], [10, 90]);
  const result = splitEditableSegments(doc(line('h', [0, 50], [100, 50]), line('v', [50, 0], [50, 100]), original));
  assert.equal(new Set(result.segments.map(s => s.id)).size, result.segments.length);
  assert.equal(result.segments.find(s => s.id === original.id), original);
});

test('unknown, explicit zero, non-flat and null fold angles survive splitting exactly', () => {
  const lines = [line('unknown', [0, 10], [100, 10], 'U'), line('zero', [0, 20], [100, 20], 'V', 0), line('nonflat', [0, 30], [100, 30], 'M', -37), line('null', [0, 40], [100, 40], 'V', null)];
  const result = splitEditableSegmentsWithMap(doc(...lines, line('cut', [50, 0], [50, 50], 'A')));
  for (const original of lines) {
    const ids = new Set(result.descendants.get(original.id));
    const children = result.doc.segments.filter(segment => ids.has(segment.id));
    assert.equal(children.length, 2);
    assert.ok(children.every(segment => segment.angle === original.angle && segment.assignment === original.assignment));
  }
});

test('near-endpoint and coincident cuts cannot produce zero or sub-tolerance fragments', () => {
  const d = doc(line('h', [0, 50], [100, 50]), line('near-start', [1e-8, 0], [1e-8, 100]), line('v1', [50, 0], [50, 100]), line('v2', [50 + 1e-8, 0], [50 + 1e-8, 100]));
  const result = splitEditableSegments(d);
  assert.ok(result.segments.every(segment => distance(segment.a, segment.b) > epsilonFor(d)));
  assert.equal(splitEditableSegments(result), result);
});

test('all pair intersections at one common point create only one cut per segment', () => {
  const result = splitEditableSegments(doc(line('h', [0, 50], [100, 50]), line('v', [50, 0], [50, 100]), line('d', [0, 0], [100, 100])));
  assert.equal(result.segments.length, 6);
  assert.equal(splitEditableSegments(result), result);
});

test('source data remains untouched and unchanged segment references are retained', () => {
  const untouched = line('isolated', [0, 80], [10, 80]);
  const d = doc(line('h', [0, 50], [100, 50]), line('v', [50, 0], [50, 100]), untouched);
  d.metadata = { custom: 'kept' };
  const before = JSON.stringify(d), result = splitEditableSegments(d);
  assert.equal(JSON.stringify(d), before);
  assert.equal(result.metadata, d.metadata);
  assert.equal(result.paper, d.paper);
  assert.equal(result.segments.find(s => s.id === 'isolated'), untouched);
  assert.notEqual(result.segments[0], d.segments[0]);
  assert.notEqual(result.segments[0].a, d.segments[0].a);
});

test('new crossing on an already split piece preserves all old IDs and creates only local descendants', () => {
  const first = splitEditableSegments(doc(line('h', [0, 50], [100, 50]), line('v', [50, 0], [50, 100])));
  const originalIds = first.segments.map(s => s.id);
  const result = splitEditableSegmentsWithMap({ ...first, segments: [...first.segments, line('new', [75, 0], [75, 100])] });
  assert.ok(originalIds.every(id => result.doc.segments.some(s => s.id === id)));
  assert.deepEqual(result.descendants.get('h'), ['h']);
  assert.equal(result.descendants.get('h::split:2')!.length, 2);
  assert.equal(splitEditableSegments(result.doc), result.doc);
});

test('all pieces of a crossing grid remain editable beyond the former 12000-segment limit', () => {
  const count = 80;
  const d = doc(...Array.from({ length: count }, (_, i) => line(`h${i}`, [0, i + 1], [100, i + 1])), ...Array.from({ length: count }, (_, i) => line(`v${i}`, [i + 1, 0], [i + 1, 100])));
  const result = splitEditableSegments(d);
  assert.equal(result.segments.length, 2 * count * (count + 1));
  assert.ok(result.segments.length > 12000);
  assert.doesNotThrow(() => validateDoc(result));
});

test('deterministic randomized crossings remain idempotent despite floating-point coordinates', () => {
  let seed = 234567;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let example = 0; example < 30; example++) {
    const d = doc(...Array.from({ length: 15 }, (_, i) => line(String(i), [random() * 100, random() * 100], [random() * 100, random() * 100])));
    const split = splitEditableSegments(d);
    assert.equal(splitEditableSegments(split), split, `random example ${example}`);
    assert.equal(new Set(split.segments.map(s => s.id)).size, split.segments.length);
  }
});
