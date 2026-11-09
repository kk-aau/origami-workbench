import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFold, splitIntersections } from '../../src/core/geometry';
import { diagnose } from '../../src/core/diagnostics';
import { computeFlatFold } from '../../src/core/flatFold';
import { type Doc, type Segment, type Assignment, defaultAngle } from '../../src/core/types';

function segment(id: string, a: [number, number], b: [number, number], assignment: Assignment): Segment { return { id, a, b, assignment, angle: defaultAngle(assignment) }; }
const boundary = [segment('b0', [0, 0], [100, 0], 'B'), segment('b1', [100, 0], [100, 100], 'B'), segment('b2', [100, 100], [0, 100], 'B'), segment('b3', [0, 100], [0, 0], 'B')];
function doc(...segments: Segment[]): Doc { return { name: '测试', paper: { width: 100, height: 100 }, segments: structuredClone([...boundary, ...segments]) }; }

test('square boundary builds one face', () => {
  const graph = buildFold(doc()).graph;
  assert.equal(graph.vertices_coords.length, 4); assert.equal(graph.faces_vertices?.length, 1);
  assert.equal(diagnose(doc()).summary.errors, 0);
});

test('layer solver accepts 225 flat faces without a face-count cutoff', () => {
  const d = doc(...Array.from({ length: 224 }, (_, i) =>
    segment(`crease${i}`, [(i + 1) * 100 / 225, 0], [(i + 1) * 100 / 225, 100], 'F')));
  // Match the editor/import path, which commits actual split endpoints before analysis.
  d.segments = splitIntersections(d).segments;
  const before = structuredClone(d);
  assert.equal(buildFold(d).graph.faces_vertices?.length, 225);
  const progress: string[] = [];
  const result = computeFlatFold(d, r => progress.push(r.geometry.status));
  assert.equal(result.geometry.status, 'ready', result.geometry.message);
  assert.equal(result.geometry.faces.length, 225);
  assert.ok(result.geometry.vertices.flat().every(Number.isFinite));
  assert.deepEqual(progress, ['ready']);
  assert.equal(result.layers.status, 'solved', result.layers.message);
  assert.equal(result.layers.faceOrder?.length, 225);
  assert.deepEqual(d, before);
});
test('225-face accordion publishes finite geometry before entering expensive layer search', () => {
  const d = doc(...Array.from({ length: 224 }, (_, i) =>
    segment(`crease${i}`, [(i + 1) * 100 / 225, 0], [(i + 1) * 100 / 225, 100], i % 2 ? 'V' : 'M')));
  d.segments = splitIntersections(d).segments;
  const before = structuredClone(d);
  let published: Parameters<NonNullable<Parameters<typeof computeFlatFold>[1]>>[0] | undefined;
  // Deliberately stop at the progress boundary: this test covers geometry, not layer feasibility.
  computeFlatFold(d, result => { published = result; throw new Error('geometry-only-test'); });
  assert.equal(published?.geometry.status, 'ready');
  assert.equal(published?.geometry.faces.length, 225);
  assert.ok(published?.geometry.vertices.flat().every(Number.isFinite));
  assert.equal(published?.layers.status, 'unknown');
  assert.deepEqual(d, before);
});
test('proper crossings and T joins become vertices, source untouched', () => {
  const d = doc(segment('h', [0, 50], [100, 50], 'M'), segment('v', [50, 0], [50, 100], 'V'));
  const before = JSON.stringify(d), { graph } = buildFold(d);
  assert.equal(graph.vertices_coords.length, 9); assert.equal(graph.edges_vertices.length, 12); assert.equal(graph.faces_vertices?.length, 4); assert.equal(JSON.stringify(d), before);
  assert.ok(diagnose(d).issues.some(i => i.code === 'intersection'));
});
test('auxiliary lines never split computational faces', () => {
  const d = doc(segment('a', [0, 50], [100, 50], 'A'));
  assert.equal(buildFold(d).graph.faces_vertices?.length, 1);
});
test('partial overlap is split and merged, conflicts rejected', () => {
  const d = doc(segment('m', [0, 50], [100, 50], 'M'), segment('m2', [25, 50], [75, 50], 'M'));
  assert.equal(splitIntersections(d).segments.filter(s => s.assignment === 'M').length, 3);
  d.segments.at(-1)!.assignment = 'V'; d.segments.at(-1)!.angle = 180;
  assert.throws(() => buildFold(d), /冲突/); assert.ok(diagnose(d).issues.some(i => i.code === 'overlap-conflict'));
});
test('open boundaries and zero-length lines are errors', () => {
  const d = doc(); d.segments.pop(); assert.ok(diagnose(d).issues.some(i => i.severity === 'error'));
  assert.ok(diagnose(doc(segment('z', [50, 50], [50, 50], 'M'))).issues.some(i => i.code === 'zero-length'));
});
test('Maekawa checks only interior vertices, unknown assignments are skipped', () => {
  const d = doc(segment('a', [50, 50], [0, 50], 'M'), segment('b', [50, 50], [100, 50], 'M'), segment('c', [50, 50], [50, 0], 'M'), segment('d', [50, 50], [50, 100], 'V'));
  assert.equal(diagnose(d).summary.errors, 0);
  d.segments.at(-1)!.assignment = 'M'; d.segments.at(-1)!.angle = -180;
  assert.ok(diagnose(d).issues.some(i => i.code === 'maekawa'));
  d.segments.at(-1)!.assignment = 'U'; d.segments.at(-1)!.angle = null;
  assert.ok(diagnose(d).issues.some(i => i.code === 'unassigned'));
  assert.ok(!diagnose(d).issues.some(i => i.code === 'maekawa'));
});
test('single fold produces independent geometry and a real layer solution', () => {
  const d = doc(segment('fold', [0, 50], [100, 50], 'V'));
  const before = JSON.stringify(d), progress: string[] = [];
  const result = computeFlatFold(d, r => progress.push(r.geometry.status));
  assert.equal(result.geometry.status, 'ready', result.geometry.message);
  assert.equal(result.layers.status, 'solved', result.layers.message);
  assert.equal(result.geometry.faces.length, 2); assert.equal(result.layers.faceOrders?.length, 1); assert.equal(result.layers.faceOrder?.length, 2);
  assert.deepEqual(progress, ['ready']); assert.equal(JSON.stringify(d), before);
});
test('geometry can succeed while Maekawa disproves layer solution', () => {
  const d = doc(segment('h', [0, 50], [100, 50], 'V'), segment('v', [50, 0], [50, 100], 'V'));
  const result = computeFlatFold(d);
  assert.equal(result.geometry.status, 'ready', result.geometry.message);
  assert.equal(result.layers.status, 'no-solution');
});
test('unknown mountain/valley is never guessed as solved', () => {
  const result = computeFlatFold(doc(segment('u', [0, 50], [100, 50], 'U')));
  assert.equal(result.geometry.status, 'ready', result.geometry.message); assert.equal(result.layers.status, 'unknown');
});
test('non-flat target angles preserved while flat candidate uses full fold', () => {
  const d = doc(segment('v', [0, 50], [100, 50], 'V')); d.segments.at(-1)!.angle = 45;
  const result = computeFlatFold(d); assert.equal(result.geometry.status, 'ready'); assert.equal(d.segments.at(-1)!.angle, 45); assert.ok(result.warnings.some(w => w.includes('180')));
});
test('analytic bird base builds fourteen faces and a layer solution', () => {
  const k = (2 - Math.sqrt(2)) * 100;
  const d: Doc = { name: '鸟基', paper: { width: 200, height: 200 }, segments: [] };
  const corners: [number, number][] = [[-100, -100], [100, -100], [100, 100], [-100, 100]];
  corners.forEach((p, i) => {
    d.segments.push(segment(`b${i}`, p, corners[(i + 1) % 4], 'B'));
    d.segments.push(segment(`c${i}x`, p, [Math.sign(p[0]) * k, 0], 'M'));
    d.segments.push(segment(`c${i}y`, p, [0, Math.sign(p[1]) * k], 'M'));
  });
  ([[k, 0], [0, k], [-k, 0], [0, -k]] as [number, number][]).forEach((p, i) => {
    d.segments.push(segment(`inner${i}`, [0, 0], p, 'M'));
    d.segments.push(segment(`outer${i}`, p, [Math.sign(p[0]) * 100, Math.sign(p[1]) * 100], 'V'));
  });
  d.segments.push(segment('diagonal', [100, -100], [-100, 100], 'V'));
  const r = computeFlatFold(d); assert.equal(r.geometry.status, 'ready', r.geometry.message); assert.equal(r.geometry.faces.length, 14); assert.equal(r.layers.status, 'solved', r.layers.message); assert.equal(r.layers.solutionCount, 1);
});
test('paper-exterior closed flap is not accepted as additional paper', () => {
  const d = doc(segment('outside1', [0, 0], [-50, 50], 'M'), segment('outside2', [-50, 50], [0, 100], 'M'));
  assert.ok(diagnose(d).issues.some(i => i.code === 'boundary-interior'));
  assert.equal(computeFlatFold(d).geometry.status, 'invalid');
});

test('computational intersection splitting retains every piece beyond the former 48000-edge limit',()=>{
  const count=160,segments:Segment[]=[];
  for(let i=1;i<=count;i++){
    const p=100*i/(count+1);
    segments.push(segment(`h${i}`,[0,p],[100,p],'M'),segment(`v${i}`,[p,0],[p,100],'V'));
  }
  const source:Doc={name:'large crossing grid',paper:{width:100,height:100},segments};
  const before=structuredClone(source),result=splitIntersections(source);
  assert.equal(result.segments.length,2*count*(count+1));
  assert.equal(result.sourceIds.length,result.segments.length);
  const piecesPerSource=new Map<string,number>();
  result.sourceIds.forEach(ids=>{assert.equal(ids.length,1);piecesPerSource.set(ids[0],(piecesPerSource.get(ids[0])??0)+1);});
  for(const original of segments)assert.equal(piecesPerSource.get(original.id),count+1);
  assert.deepEqual(source,before);
});
