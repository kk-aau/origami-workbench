import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCPPaths, cpPathMetrics, optimizeCPPaths, CPPathOptimizationError, type CPPathOptimization, type CPPathOptimizerOptions } from '../../src/core/cpPathOptimizer';
import { type Assignment, type Doc, type Point, type Segment } from '../../src/core/types';

const segment = (a: Point, b: Point, assignment: Assignment = 'V', id = ''): Segment => ({ id, a, b, assignment, angle: assignment === 'V' ? 180 : assignment === 'M' ? -180 : assignment === 'U' ? null : 0 });
const document = (segments: Segment[]): Doc => ({ name: '加工测试', paper: { width: 200, height: 200 }, segments: segments.map((s, i) => ({ ...s, id: s.id || `s${i}` })) });
const approx = (a: number, b: number) => assert.ok(Math.abs(a - b) <= Math.max(1, Math.abs(a), Math.abs(b)) * 1e-12, `${a} != ${b}`);
function checkCoverage(doc: Doc, plan: CPPathOptimization): void {
  const included = new Map(plan.analysis.included.map(s => [s.id, s])), counts = new Map<string, number>();
  for (const path of plan.paths) {
    assert.equal(path.points.length, path.sourceSegmentIds.length + 1);
    assert.equal(path.assignments.length, path.sourceSegmentIds.length);
    for (let i = 0; i < path.sourceSegmentIds.length; i++) {
      const source = included.get(path.sourceSegmentIds[i]); assert.ok(source);
      const edge = [path.points[i], path.points[i + 1]];
      assert.ok(JSON.stringify(edge) === JSON.stringify([source.a, source.b]) || JSON.stringify(edge) === JSON.stringify([source.b, source.a]), 'no new connectors, partial segments, shifts or snapping');
      assert.equal(path.assignments[i], source.assignment);
      counts.set(source.id, (counts.get(source.id) ?? 0) + 1);
    }
  }
  for (const s of doc.segments) {
    const profile = plan.options.profiles[s.assignment];
    const expected = profile.enabled && JSON.stringify(s.a) !== JSON.stringify(s.b) ? profile.passes : 0;
    assert.equal(counts.get(s.id) ?? 0, expected, `source ${s.id} processing count`);
  }
  assert.ok(plan.after.pathCount <= plan.before.pathCount);
  assert.ok(plan.after.travelDistance <= plan.before.travelDistance);
  approx(plan.after.drawLength, plan.before.drawLength);
  assert.deepEqual(plan.before, cpPathMetrics(plan.baselinePaths, plan.options.origin));
  assert.deepEqual(plan.after, cpPathMetrics(plan.paths, plan.options.origin));
}

// Adapted reference cases and the seeded random graph regression from
// CP_Path_Optimizer_v1/tests/optimizer.test.mjs (MIT), with exact, unsplit
// project edges and explicit repeated passes as the integration contract.
test('reference straight chain becomes one path with every source edge exactly once', () => {
  const doc = document([segment([0, 0], [1, 0]), segment([2, 0], [1, 0]), segment([2, 0], [3, 0])]);
  const plan = optimizeCPPaths(doc);
  assert.equal(plan.paths.length, 1); assert.equal(plan.theoreticalMinimumPaths, 1); assert.equal(plan.atTheoreticalMinimum, true);
  assert.equal(plan.after.drawLength, 3); checkCoverage(doc, plan);
});
test('reference closed square keeps closing edge exactly once', () => {
  const doc = document([segment([0, 0], [1, 0]), segment([1, 0], [1, 1]), segment([1, 1], [0, 1]), segment([0, 1], [0, 0])]);
  const plan = optimizeCPPaths(doc);
  assert.equal(plan.paths.length, 1); assert.deepEqual(plan.paths[0].points[0], plan.paths[0].points.at(-1));
  assert.equal(plan.paths[0].sourceSegmentIds.length, 4); checkCoverage(doc, plan);
});
test('reference disconnected components have pen-up moves but no drawn connectors', () => {
  const doc = document([segment([0, 0], [1, 0]), segment([5, 5], [6, 5])]);
  const plan = optimizeCPPaths(doc);
  assert.equal(plan.paths.length, 2); assert.equal(plan.theoreticalMinimumPaths, 2); assert.equal(plan.after.drawLength, 2); checkCoverage(doc, plan);
});
test('unsplit X crossings remain two original whole segments', () => {
  const doc = document([segment([0, 0], [2, 2]), segment([0, 2], [2, 0])]);
  const plan = optimizeCPPaths(doc);
  assert.equal(plan.paths.length, 2); assert.equal(plan.analysis.included.length, 2);
  assert.ok(plan.paths.every(p => p.sourceSegmentIds.length === 1)); checkCoverage(doc, plan);
});
test('explicitly split X is one component with four odd endpoints and two trails', () => {
  const doc = document([segment([-1, -1], [0, 0]), segment([0, 0], [1, 1]), segment([-1, 1], [0, 0]), segment([0, 0], [1, -1])]);
  const plan = optimizeCPPaths(doc);
  assert.equal(plan.theoreticalMinimumPaths, 2); assert.equal(plan.paths.length, 2); checkCoverage(doc, plan);
});
test('an unsplit T does not silently attach the branch endpoint to the original edge interior', () => {
  const doc = document([segment([0, 0], [2, 0]), segment([1, 0], [1, 1])]);
  const plan = optimizeCPPaths(doc);
  assert.equal(plan.paths.length, 2); assert.equal(plan.paths.flatMap(p => p.sourceSegmentIds).length, 2); checkCoverage(doc, plan);
});
test('near endpoints and near-parallel lines keep all original coordinates', () => {
  const doc = document([segment([0, 0], [1, 0]), segment([1 + 1e-12, 0], [2, 0]), segment([0, 1e-14], [1, 1e-14])]);
  const plan = optimizeCPPaths(doc);
  assert.equal(plan.paths.length, 3); assert.equal(plan.analysis.overlaps.length, 0); checkCoverage(doc, plan);
});
test('a tiny closed-seam gap stays open and is never bridged', () => {
  const doc = document([segment([0, 0], [1, 0]), segment([1, 0], [1, 1]), segment([1, 1], [0, 1]), segment([0, 1], [0, 1e-12])]);
  const plan = optimizeCPPaths(doc); assert.equal(plan.paths.length, 1);
  assert.notDeepEqual(plan.paths[0].points[0], plan.paths[0].points.at(-1)); checkCoverage(doc, plan);
});
test('different assignments remain separate even with identical settings unless merging is explicit', () => {
  const doc = document([segment([0, 0], [1, 0], 'M'), segment([1, 0], [2, 0], 'V')]);
  const profiles = { M: { settingsKey: 'crease:tool1' }, V: { settingsKey: 'crease:tool1' } };
  const separate = optimizeCPPaths(doc, { profiles }); assert.equal(separate.groups.length, 2); assert.equal(separate.paths.length, 2); checkCoverage(doc, separate);
  const merged = optimizeCPPaths(doc, { profiles, mergeSameSettings: true }); assert.equal(merged.groups.length, 1); assert.equal(merged.paths.length, 1); checkCoverage(doc, merged);
});
test('different settings or passes never merge despite explicit same-setting merge', () => {
  const doc = document([segment([0, 0], [1, 0], 'M'), segment([1, 0], [2, 0], 'V')]);
  for (const profiles of [ { M: { settingsKey: 'cut' }, V: { settingsKey: 'crease' } }, { M: { settingsKey: 'same', passes: 2 }, V: { settingsKey: 'same', passes: 1 } } ]) {
    const plan = optimizeCPPaths(doc, { profiles, mergeSameSettings: true }); assert.equal(plan.groups.length, 2); checkCoverage(doc, plan);
  }
});
test('a shared custom groupId does not authorize cross-assignment merging', () => {
  const doc = document([segment([0, 0], [1, 0], 'M'), segment([1, 0], [2, 0], 'V')]);
  const plan = optimizeCPPaths(doc, { profiles: { M: { groupId: 'same', settingsKey: 'same' }, V: { groupId: 'same', settingsKey: 'same' } } });
  assert.equal(plan.groups.length, 2); checkCoverage(doc, plan);
});
test('boundary is kept in source group order and is not forced to be processed last', () => {
  const doc = document([segment([0, 0], [1, 0], 'B'), segment([2, 0], [3, 0], 'V')]);
  const plan = optimizeCPPaths(doc); assert.deepEqual(plan.groups[0].assignments, ['B']); assert.deepEqual(plan.paths[0].assignments, ['B']); checkCoverage(doc, plan);
});
test('explicit exclusions are counted, do not alter CP, and are not processed', () => {
  const doc = document([segment([0, 0], [1, 0], 'V'), segment([1, 0], [2, 0], 'A')]);
  const before = structuredClone(doc), plan = optimizeCPPaths(doc, { profiles: { A: { enabled: false } } });
  assert.equal(plan.analysis.excluded.length, 1); assert.deepEqual(doc, before); checkCoverage(doc, plan);
});
test('passes expand each source segment to the exact requested machining count', () => {
  const doc = document([segment([0, 0], [1, 0]), segment([1, 0], [2, 0])]);
  for (const passes of [1, 2, 3, 10]) {
    const plan = optimizeCPPaths(doc, { profiles: { V: { passes } } });
    assert.equal(plan.paths.flatMap(p => p.sourceSegmentIds).length, 2 * passes); assert.equal(plan.after.drawLength, 2 * passes); checkCoverage(doc, plan);
  }
});
test('reversed exact duplicates are reported before optimization and never silently deleted', () => {
  const doc = document([segment([0, 0], [1, 0]), segment([1, 0], [0, 0])]);
  const analysis = analyzeCPPaths(doc); assert.equal(analysis.overlaps.length, 1); assert.equal(analysis.overlaps[0].kind, 'duplicate');
  assert.throws(() => optimizeCPPaths(doc), e => e instanceof CPPathOptimizationError && e.analysis.overlaps.length === 1);
  const retained = optimizeCPPaths(doc, { overlapPolicy: 'retain' }); assert.equal(retained.after.drawLength, 2); checkCoverage(doc, retained);
});
test('horizontal, vertical and diagonal partial overlaps all require acknowledgment', () => {
  for (const [a, b, c, d] of [ [[0, 0], [3, 0], [4, 0], [1, 0]], [[0, 0], [0, 3], [0, 4], [0, 1]], [[-0.25, -0.5], [0.75, 1.5], [1, 2], [0, 0]] ] as [Point, Point, Point, Point][]) {
    const doc = document([segment(a, b), segment(c, d)]), analysis = analyzeCPPaths(doc);
    assert.equal(analysis.overlaps.length, 1); assert.equal(analysis.overlaps[0].kind, 'overlap');
    assert.throws(() => optimizeCPPaths(doc), /重叠/); checkCoverage(doc, optimizeCPPaths(doc, { overlapPolicy: 'retain' }));
  }
});
test('different-setting overlaps can only remain as explicitly repeated source geometry', () => {
  const doc = document([segment([0, 0], [1, 0], 'M'), segment([0, 0], [1, 0], 'V')]);
  assert.equal(analyzeCPPaths(doc).overlaps[0].sameSettings, false); assert.throws(() => optimizeCPPaths(doc), /重叠/);
  const plan = optimizeCPPaths(doc, { overlapPolicy: 'retain', mergeSameSettings: true }); assert.equal(plan.groups.length, 2); checkCoverage(doc, plan);
});
test('overlap report has a bounded sample with an explicit truncated flag', () => {
  const doc = document(Array.from({ length: 30 }, () => segment([0, 0], [1, 0]))), analysis = analyzeCPPaths(doc);
  assert.equal(analysis.overlaps.length, 200); assert.equal(analysis.overlapsTruncated, true); assert.match(analysis.issues[0].message, /至少/);
  assert.throws(() => optimizeCPPaths(doc), /重叠/); checkCoverage(doc, optimizeCPPaths(doc, { overlapPolicy: 'retain' }));
});
test('zero-length edges are explicitly diagnosed while true short edges remain valid', () => {
  const doc = document([segment([0, 0], [0, 0]), segment([0, 0], [Number.MIN_VALUE, 0])]);
  const plan = optimizeCPPaths(doc); assert.equal(plan.analysis.zeroLength.length, 1); assert.equal(plan.analysis.included.length, 1);
  assert.equal(plan.after.drawLength, Number.MIN_VALUE); assert.equal(plan.analysis.issues[0].code, 'zero-length'); checkCoverage(doc, plan);
});
test('nonfinite, malformed, out-of-range and duplicate-ID documents are rejected', () => {
  for (const value of [NaN, Infinity, -Infinity, 1_000_001]) {
    const doc = document([segment([value, 0], [1, 0])]); assert.throws(() => optimizeCPPaths(doc), /坐标/);
  }
  assert.throws(() => optimizeCPPaths(null as unknown as Doc), /格式/);
  assert.throws(() => optimizeCPPaths(document([segment([0, 0], [1, 0], 'V', 'id'), segment([1, 0], [2, 0], 'V', 'id')])), /标识/);
  const doc = document([segment([0, 0], [1, 0])]); doc.segments[0].a = [0] as unknown as Point; assert.throws(() => optimizeCPPaths(doc), /坐标/);
});
test('invalid profiles, origins, flags and unsupported overlap policies fail clearly', () => {
  const doc = document([segment([0, 0], [1, 0])]);
  const bad: unknown[] = [null, [], { origin: [NaN, 0] }, { origin: [0] }, { mergeSameSettings: 'yes' }, { overlapPolicy: 'remove' }, { profiles: { Z: {} } }, { profiles: { V: null } }, { profiles: { V: { enabled: 'yes' } } }, { profiles: { V: { settingsKey: '' } } }];
  for (const options of bad) assert.throws(() => optimizeCPPaths(doc, options as CPPathOptimizerOptions));
  for (const passes of [0, -1, 1.5, NaN, Infinity, 101]) assert.throws(() => optimizeCPPaths(doc, { profiles: { V: { passes } } }), /次数/);
});
test('empty, all-disabled and all-zero designs cannot produce empty machining exports', () => {
  assert.throws(() => optimizeCPPaths(document([])), /没有/);
  assert.throws(() => optimizeCPPaths(document([segment([0, 0], [0, 0])])), /没有/);
  assert.throws(() => optimizeCPPaths(document([segment([0, 0], [1, 0])]), { profiles: { V: { enabled: false } } }), /没有/);
});
test('source and repeated machining paths can exceed the former edge caps without losing coverage', () => {
  const large = document(Array.from({ length: 12001 }, (_, i) => segment([i, 0], [i, 1])));
  const plan=optimizeCPPaths(large,{optimizeTravel:false});checkCoverage(large,plan);
  const repeated = document(Array.from({ length: 481 }, (_, i) => segment([i, 0], [i, 1])));
  const expanded=optimizeCPPaths(repeated,{optimizeTravel:false,profiles:{V:{passes:100}}});checkCoverage(repeated,expanded);
  assert.equal(expanded.paths.reduce((n,p)=>n+p.sourceSegmentIds.length,0),48100);
});

test('coordinate position, scale, negative values and high precision are untouched', () => {
  const doc = document([segment([-1.234567890123456, -20], [2.99999999999999, 30.1]), segment([2.99999999999999, 30.1], [40, -1])]);
  const plan = optimizeCPPaths(doc, { origin: [-123.456, 78.9] }); checkCoverage(doc, plan);
  assert.deepEqual(plan.options.origin, [-123.456, 78.9]);
});
test('input documents and option coordinates are not mutated or referenced by output points', () => {
  const doc = document([segment([0, 0], [1, 0]), segment([1, 0], [2, 0])]), before = structuredClone(doc), origin: Point = [1, 2];
  const plan = optimizeCPPaths(doc, { origin }); assert.deepEqual(doc, before);
  plan.paths[0].points[0][0] = 99; plan.options.origin[0] = 99; plan.analysis.included[0].a[0] = 99;
  assert.deepEqual(doc, before); assert.deepEqual(origin, [1, 2]);
});
test('closed paths can rotate to a nearer existing vertex without changing seam coverage', () => {
  const doc = document([segment([10, 0], [20, 0]), segment([20, 0], [20, 10]), segment([20, 10], [10, 10]), segment([10, 10], [10, 0])]);
  const plan = optimizeCPPaths(doc, { origin: [20, 10] }); assert.equal(plan.after.travelDistance, 0); assert.deepEqual(plan.paths[0].points[0], [20, 10]); checkCoverage(doc, plan);
});
test('statistics include initial empty travel but no unspecified return home', () => {
  const doc = document([segment([10, 0], [20, 0])]), plan = optimizeCPPaths(doc);
  assert.deepEqual(plan.after, { pathCount: 1, drawLength: 10, travelDistance: 10 });
  assert.equal(optimizeCPPaths(doc, { origin: [30, 0] }).after.travelDistance, 10);
});
test('identical inputs and options produce deterministic output', () => {
  const doc = document([segment([0, 0], [1, 1]), segment([0, 1], [1, 0]), segment([1, 0], [2, 0])]);
  assert.deepEqual(optimizeCPPaths(doc), optimizeCPPaths(doc));
});
test('reference seeded random graph cases preserve each source edge and parity lower bound or explicit fallback', () => {
  let state = 1234567; const rand = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let repeat = 0; repeat < 100; repeat++) {
    const points = Array.from({ length: 10 }, (_, i) => [Math.cos(i) * 100 + i * 0.01, Math.sin(i) * 100] as Point), segments: Segment[] = [];
    for (let i = 0; i < 10; i++) for (let j = i + 1; j < 10; j++) if (rand() < 0.17) segments.push(segment(points[i], points[j]));
    if (!segments.length) continue;
    const doc = document(segments), plan = optimizeCPPaths(doc); checkCoverage(doc, plan);
    if (plan.atTheoreticalMinimum) assert.equal(plan.paths.length, plan.theoreticalMinimumPaths);
    else assert.ok(plan.analysis.issues.some(issue => issue.code === 'route-fallback'));
  }
});
test('seeded mixed-assignment multi-pass graphs preserve explicit grouping and machining counts', () => {
  let state = 20261003; const rand = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let repeat = 0; repeat < 30; repeat++) {
    const segments = Array.from({ length: 20 }, (_, i) => segment([i * 2, i % 3], [i * 2 + 1, i % 4], rand() < 0.5 ? 'M' : 'V'));
    const doc = document(segments), plan = optimizeCPPaths(doc, { profiles: { M: { passes: 2, settingsKey: 'same' }, V: { passes: 2, settingsKey: 'same' } }, mergeSameSettings: repeat % 2 === 0 });
    checkCoverage(doc, plan); assert.equal(plan.groups.length, repeat % 2 === 0 ? 1 : 2);
  }
});
test('large disconnected input uses bounded routing without geometry loss or worse empty travel', () => {
  const doc = document(Array.from({ length: 1800 }, (_, i) => segment([i * 2, i % 11], [i * 2 + 0.5, i % 11]))), plan = optimizeCPPaths(doc);
  assert.equal(plan.paths.length, 1800); assert.equal(plan.theoreticalMinimumPaths, 1800); checkCoverage(doc, plan);
});
