import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cpPathMetrics, optimizeCPPaths, type CPPathOptimization, type CPPathOptimizerOptions} from '../../src/core/cpPathOptimizer';
import {exportCPProcessingSVG, exportCPProcessingDXF, exportCPProcessingDXFLines, verifyCPProcessingExport, type CPProcessingExportFormat} from '../../src/core/cpProcessingExport';
import {exportDXF} from '../../src/core/dxf';
import {exportDocument} from '../../src/core/formats';
import {defaultAngle, type Assignment, type Doc, type Point, type Segment} from '../../src/core/types';
// Reuse the supplied ZIP's original independent DXF parser as a second implementation.
import {parseDxf} from '../../vendor/cp-path-optimizer/src/dxf.mjs';

const segment = (id: string, a: Point, b: Point, assignment: Assignment = 'M'): Segment => ({id, a, b, assignment, angle: defaultAngle(assignment)});
const document = (segments: Segment[]): Doc => ({name: '加工核验', paper: {width: 210, height: 297}, segments});
const chain = (): Doc => document([segment('a', [10, 20], [20, 20]), segment('b', [30, 20], [20, 20]), segment('c', [30, 20], [40, 25])]);
const writer = (format: CPProcessingExportFormat) => format === 'svg' ? exportCPProcessingSVG : format === 'dxf' ? exportCPProcessingDXF : exportCPProcessingDXFLines;
const edgeKey = (a: Point, b: Point): string => [JSON.stringify(a), JSON.stringify(b)].sort().join('|');
const sourceGeometry = (doc: Doc): string[] => doc.segments.map(s => edgeKey(s.a, s.b)).sort();
type TestPair = {code: number; value: string};
const readPairs = (text: string): TestPair[] => {
  const lines = text.trimEnd().split('\r\n');
  assert.equal(lines.length % 2, 0);
  return Array.from({length: lines.length / 2}, (_, i) => ({code: Number(lines[i * 2]), value: lines[i * 2 + 1]}));
};
const writePairs = (pairs: TestPair[]): string => pairs.map(p => p.code + '\r\n' + p.value + '\r\n').join('');
const entityRange = (pairs: TestPair[]): [number, number] => {
  const start = pairs.findIndex((p, i) => p.code === 2 && p.value === 'ENTITIES' && pairs[i - 1]?.value === 'SECTION') + 1;
  const end = pairs.findIndex((p, i) => i >= start && p.code === 0 && p.value === 'ENDSEC');
  assert.ok(start > 0 && end >= start);
  return [start, end];
};
const mutateEntities = (text: string, update: (pairs: TestPair[]) => TestPair[]): string => {
  const pairs = readPairs(text), [start, end] = entityRange(pairs);
  return writePairs([...pairs.slice(0, start), ...update(pairs.slice(start, end)), ...pairs.slice(end)]);
};
const entityRecords = (pairs: TestPair[]): TestPair[][] => {
  const records: TestPair[][] = [];
  for (const pair of pairs) { if (pair.code === 0) records.push([]); records.at(-1)!.push(pair); }
  return records;
};
const alterFirstDXFVertex = (text: string, change: (value: string, code: number) => string): string => mutateEntities(text, pairs => {
  for (const code of [10, 20]) { const point = pairs.find(p => p.code === code)!; point.value = change(point.value, code); }
  return pairs;
});

for (const format of ['svg', 'dxf', 'dxf-lines'] as const) {
  test(`${format}: continuous chain and serialized readback retain exact geometry and original document`, () => {
    const doc = chain(), before = structuredClone(doc), oldDXF = exportDXF(doc), oldCP = exportDocument(doc, 'cp');
    const plan = optimizeCPPaths(doc), text = writer(format)(doc, plan).text, report = verifyCPProcessingExport(text, format, doc, plan);
    assert.equal(report.verified, true); assert.equal(report.pathCount, format === 'dxf-lines' ? 3 : 1); assert.equal(report.processedEdgeCount, 3);
    assert.equal(report.continuousPathsPreserved, format !== 'dxf-lines'); assert.equal(report.entityCount, report.pathCount);
    assert.equal(report.downLength, plan.after.drawLength); assert.equal(report.travelLength, plan.after.travelDistance);
    assert.deepEqual(report.sourcePasses, {a: 1, b: 1, c: 1}); assert.equal(report.units, 'mm'); assert.match(report.checksum, /^fnv1a32:[a-f0-9]{8}$/);
    assert.equal(report.physicalImportVerified, false); assert.equal(report.machineTrialVerified, false);
    assert.deepEqual(doc, before); assert.deepEqual(exportDXF(doc), oldDXF); assert.deepEqual(exportDocument(doc, 'cp'), oldCP);
  });
  test(`${format}: off-origin rectangular boundary closes with four real edges and no implicit additional edge`, () => {
    const doc = document([segment('a', [-50, -80], [150, -80], 'B'), segment('b', [150, -80], [150, 20], 'B'), segment('c', [150, 20], [-50, 20], 'B'), segment('d', [-50, 20], [-50, -80], 'B')]);
    const plan = optimizeCPPaths(doc), text = writer(format)(doc, plan).text, report = verifyCPProcessingExport(text, format, doc, plan);
    assert.equal(report.pathCount, format === 'dxf-lines' ? 4 : 1); assert.equal(report.processedEdgeCount, 4); assert.equal(report.downLength, 600); assert.deepEqual(report.bounds, {x: -50, y: -80, width: 200, height: 100});
    if (format === 'svg') { assert.match(text, /width="200mm" height="100mm" viewBox="-50 -80 200 100"/); assert.doesNotMatch(text, /\bZ\b|stroke-dasharray/); }
    else { assert.equal(parseDxf(text).segments.length, 4); assert.equal(parseDxf(text).units, format === 'dxf-lines' ? null : 4); }
  });
  test(`${format}: disconnected and crossing lines never get extra connectors or moved endpoints`, () => {
    const doc = document([segment('a', [-1, -1], [1, 1]), segment('b', [-1, 1], [1, -1]), segment('c', [5, 5], [6, 5]), segment('d', [6.000000001, 5], [7, 5])]);
    const plan = optimizeCPPaths(doc), text = writer(format)(doc, plan).text, report = verifyCPProcessingExport(text, format, doc, plan);
    assert.equal(report.pathCount, 4); assert.equal(report.processedEdgeCount, 4);
    if (format !== 'svg') assert.deepEqual(parseDxf(text).segments.map((s: Segment) => edgeKey([s.a[0], -s.a[1]], [s.b[0], -s.b[1]])).sort(), sourceGeometry(doc));
  });
  for (const [label, a, b] of [
    ['negative decimals', [-1.234567890123456, -20], [2.99999999999999, 30.1]],
    ['tiny scale', [0.000000000001, -0.000000000002], [0.000000000003, 0.000000000005]],
    ['large scale', [-999999.12345678, -999998], [999999.98765432, 999999]],
  ] as const) test(`${format}: ${label} roundtrip has no scaling, centering, rounding or double reflection`, () => {
    const doc = document([segment('exact', [...a], [...b])]), plan = optimizeCPPaths(doc), text = writer(format)(doc, plan).text;
    const report = verifyCPProcessingExport(text, format, doc, plan); assert.equal(report.downLength, Math.hypot(b[0] - a[0], b[1] - a[1]));
    if (format === 'dxf') { const s = parseDxf(text).segments[0]; assert.equal(edgeKey([s.a[0], -s.a[1]], [s.b[0], -s.b[1]]), edgeKey([...a], [...b])); }
  });
  test(`${format}: explicit passes are real edge occurrences and metadata never multiplies them again`, () => {
    const doc = document([segment('a', [0, 0], [1, 0]), segment('b', [1, 0], [2, 0])]);
    const plan = optimizeCPPaths(doc, {profiles: {M: {passes: 3}}}), text = writer(format)(doc, plan).text, report = verifyCPProcessingExport(text, format, doc, plan);
    assert.equal(report.processedEdgeCount, 6); assert.equal(report.downLength, 6); assert.deepEqual(report.sourcePasses, {a: 3, b: 3});
    if (format === 'dxf') assert.equal(parseDxf(text).segments.length, 6);
  });
  test(`${format}: duplicated and partially overlapping sources require explicit retain and keep all declared visits`, () => {
    const doc = document([segment('a', [0, 0], [3, 0]), segment('b', [3, 0], [0, 0], 'V'), segment('c', [1, 0], [4, 0])]);
    assert.throws(() => optimizeCPPaths(doc), /重复|重叠/);
    const plan = optimizeCPPaths(doc, {overlapPolicy: 'retain'}), text = writer(format)(doc, plan).text, report = verifyCPProcessingExport(text, format, doc, plan);
    assert.equal(report.downLength, 9); assert.equal(report.processedEdgeCount, 3); assert.deepEqual(report.sourcePasses, {a: 1, b: 1, c: 1});
    const forbidden = structuredClone(plan); forbidden.options.overlapPolicy = 'reject'; assert.throws(() => writer(format)(doc, forbidden), /重复|重叠/);
  });
  test(`${format}: equal settings keep classifications separate unless explicitly merged`, () => {
    const doc = document([segment('a', [0, 0], [1, 0]), segment('b', [1, 0], [2, 0], 'V')]);
    const options: CPPathOptimizerOptions = {profiles: {M: {groupId: 'same', settingsKey: '压痕 & <测试> "1"'}, V: {groupId: 'same', settingsKey: '压痕 & <测试> "1"'}}};
    const separate = optimizeCPPaths(doc, options); assert.equal(separate.groups.length, 2); assert.equal(verifyCPProcessingExport(writer(format)(doc, separate).text, format, doc, separate).pathCount, 2);
    const merged = optimizeCPPaths(doc, {...options, mergeSameSettings: true}); assert.equal(merged.groups.length, 1); assert.equal(verifyCPProcessingExport(writer(format)(doc, merged).text, format, doc, merged).pathCount, format === 'dxf-lines' ? 2 : 1);
    if (format === 'dxf') assert.ok(!/[^\x00-\x7f]/.test(writer(format)(doc, merged).text));
    const unauthorized = structuredClone(merged); unauthorized.options.mergeSameSettings = false; assert.throws(() => writer(format)(doc, unauthorized), /分组/);
  });
  test(`${format}: explicit omissions, zero-length notices and original drawing extent are retained without fake geometry`, () => {
    const doc = document([segment('a', [0, 0], [1, 0]), segment('z', [2, 2], [2, 2]), segment('aux', [100, 100], [101, 101], 'A')]);
    doc.objects = [{id: 'circle', kind: 'circle', center: [200, 300], radius: 5, color: '#123456'}];
    const plan = optimizeCPPaths(doc, {profiles: {A: {enabled: false}}}), output = writer(format)(doc, plan), report = verifyCPProcessingExport(output.text, format, doc, plan);
    assert.equal(report.processedEdgeCount, 1); assert.deepEqual(report.sourcePasses, {a: 1}); assert.equal(plan.analysis.zeroLength.length, 1); assert.equal(plan.analysis.excluded.length, 1); assert.ok(output.warnings.some(w => w.includes('1 个圆')));
    assert.deepEqual(report.bounds, {x: 0, y: 0, width: 205, height: 305});
  });
  test(`${format}: source mutation and forged planned blank connectors fail before serialization`, () => {
    const doc = chain(), plan = optimizeCPPaths(doc), output = writer(format)(doc, plan).text;
    const connector = structuredClone(plan); connector.paths[0].points[1][0] += 0.1; assert.throws(() => writer(format)(doc, connector), /位置|覆盖/);
    const omit = structuredClone(plan); omit.paths = []; assert.throws(() => writer(format)(doc, omit), /数量|遗漏/);
    const extra = structuredClone(plan); extra.paths.push({...structuredClone(extra.paths[0]), id: 'new'}); assert.throws(() => writer(format)(doc, extra), /次数/);
    doc.segments[0].a[0] += 1; assert.throws(() => verifyCPProcessingExport(output, format, doc, plan), /位置|尺度/);
  });
  test(`${format}: invalid source values or unsupported formats are rejected`, () => {
    const doc = chain(), plan = optimizeCPPaths(doc); doc.segments[0].a[0] = NaN; assert.throws(() => writer(format)(doc, plan), /坐标/);
    assert.throws(() => verifyCPProcessingExport('', format, chain(), plan), /为空/);
    assert.throws(() => verifyCPProcessingExport('text', 'cp' as CPProcessingExportFormat, chain(), plan), /格式/);
  });
}

test('SVG independently parses geometry instead of trusting unchanged source metadata', () => {
  const doc = chain(), plan = optimizeCPPaths(doc), output = exportCPProcessingSVG(doc, plan).text;
  const variants = [
    output.replace('width="30mm"', 'width="60mm"'),
    output.replace('viewBox="10 20 30 5"', 'viewBox="0 0 30 5"'),
    output.replace('data-units="mm"', 'data-units="cm"'),
    output.replace(/ d="([^"]+)"/, (_, d) => ` d="${d.replace(/([ML]) ([^ ]+) ([^ ]+)/, (_a: string, cmd: string, x: string, y: string) => `${cmd} ${Number(x) + 0.1} ${y}`)}"`),
    output.replace('fill="none"', 'fill="red"'),
    output.replace('<path ', '<path transform="scale(2)" '),
    output.replace('<path ', '<path stroke-dasharray="1 1" '),
    output.replace('<g ', '<g transform="translate(2 0)" '),
    output.replace('</svg>', '<line x1="0" y1="0" x2="1" y2="1"/></svg>'),
    output.replace(/<path[^>]*\/>/, ''),
    output.replace(/(<path[^>]*\/>)/, '$1$1'),
    output.replace('data-passes="1"', 'data-passes="2"'),
    output.replace(' L ', ' M '),
    output.replace(' L ', ' C '),
    '<!DOCTYPE svg><svg/>',
  ];
  for (const variant of variants) { assert.notEqual(variant, output); assert.throws(() => verifyCPProcessingExport(variant, 'svg', doc, plan), /核验失败/); }
});

test('DXF strict readback rejects geometry, units, hidden closure, widths, extrusion, handles and phantom entities', () => {
  const doc = chain(), plan = optimizeCPPaths(doc), output = exportCPProcessingDXF(doc, plan).text;
  const variants = [
    alterFirstDXFVertex(output, (value, code) => code === 10 ? String(Number(value) + 0.1) : value),
    alterFirstDXFVertex(output, (value, code) => code === 20 ? String(-Number(value)) : value),
    alterFirstDXFVertex(output, () => 'NaN'),
    output.replace(/\$INSUNITS\r\n\s*70\r\n4/, '$INSUNITS\r\n70\r\n1'),
    output.replace('AC1015', 'AC1009'),
    output + '999\r\nextra\r\n',
    output.replace(/ *0\r\nEOF\r\n$/, ''),
    mutateEntities(output, p => p.map((q, i) => i === 0 ? {...q, value: 'LINE'} : q)),
    ...[42, 39, 210, 1000].map(code => mutateEntities(output, p => [p[0], {code, value: '1'}, ...p.slice(1)])),
    ...([[90, '999'], [70, '1'], [330, '0'], [5, '1']] as const).map(([code, value]) => mutateEntities(output, p => {p.find(q => q.code === code)!.value = value; return p;})),
    mutateEntities(output, p => [...p, ...p]),
    mutateEntities(output, () => []),
    output.replace(/ *2\r\nLAYER\r\n/, '2\r\nUNKNOWN\r\n'),
  ];
  for (const variant of variants) { assert.notEqual(variant, output); assert.throws(() => verifyCPProcessingExport(variant, 'dxf', doc, plan), /核验失败/); }
});

test('export rejects moving a valid edge into another processing group even when geometry is unchanged', () => {
  const doc = document([segment('a', [0, 0], [1, 0]), segment('b', [1, 0], [2, 0], 'V')]), plan = optimizeCPPaths(doc);
  const svg = exportCPProcessingSVG(doc, plan).text.replace('data-group-id="g1"', 'data-group-id="g2"'); assert.throws(() => verifyCPProcessingExport(svg, 'svg', doc, plan), /分组/);
  for (const format of ['dxf', 'dxf-lines'] as const) {
    const dxf = mutateEntities(writer(format)(doc, plan).text, p => {const layer = p.find(q => q.code === 8)!; layer.value = layer.value === 'MountainLine' ? 'ValleyLine' : 'MountainLine'; return p;});
    assert.throws(() => verifyCPProcessingExport(dxf, format, doc, plan), /图层|分组/);
  }
});

test('SVG preserves globally ordered interleaved groups and reports actual serialized travel', () => {
  const doc = document([segment('m1', [1, 0], [2, 0]), segment('v', [3, 0], [4, 0], 'V'), segment('m2', [5, 0], [6, 0])]);
  const plan = optimizeCPPaths(doc), bySource = new Map(plan.paths.map(p => [p.sourceSegmentIds[0], p]));
  plan.paths = ['m1', 'v', 'm2'].map(id => ({...bySource.get(id)!, points: [doc.segments.find(s => s.id === id)!.a, doc.segments.find(s => s.id === id)!.b]})); plan.after = cpPathMetrics(plan.paths, plan.options.origin);
  const output = exportCPProcessingSVG(doc, plan).text, report = verifyCPProcessingExport(output, 'svg', doc, plan);
  assert.equal(report.travelLength, plan.after.travelDistance); assert.equal(report.travelLength, 3);
  assert.deepEqual([...output.matchAll(/data-group-id="([^"]+)"/g)].map(m => m[1]), [plan.paths[0].groupId, plan.paths[1].groupId, plan.paths[2].groupId]);
});

test('readback source IDs are safe for unusual JSON keys', () => {
  const doc = document([segment('__proto__', [0, 0], [1, 0])]), plan = optimizeCPPaths(doc);
  const report = verifyCPProcessingExport(exportCPProcessingSVG(doc, plan).text, 'svg', doc, plan);
  assert.equal(Object.getPrototypeOf(report.sourcePasses), Object.prototype); assert.equal(Object.hasOwn(report.sourcePasses, '__proto__'), true); assert.equal(report.sourcePasses.__proto__, 1);
});

test('real exported path order and before/after statistics cannot be silently changed', () => {
  const doc = document([segment('a', [0, 0], [1, 0]), segment('b', [5, 0], [6, 0])]), plan = optimizeCPPaths(doc);
  const svg = exportCPProcessingSVG(doc, plan).text, svgParts = svg.match(/<path[^>]*\/>/g)!;
  assert.equal(svgParts.length, 2);
  const svgSwap = svg.replace(svgParts[0], 'TEMP_PATH').replace(svgParts[1], svgParts[0]).replace('TEMP_PATH', svgParts[1]);
  assert.throws(() => verifyCPProcessingExport(svgSwap, 'svg', doc, plan), /顺序/);
  for (const format of ['dxf', 'dxf-lines'] as const) {
    const dxf = writer(format)(doc, plan).text;
    const dxfSwap = mutateEntities(dxf, p => {const records = entityRecords(p); assert.equal(records.length, 2); return [...records[1], ...records[0]];});
    assert.throws(() => verifyCPProcessingExport(dxfSwap, format, doc, plan), /顺序|位置|句柄/);
  }
  for (const field of ['before', 'after'] as const) {
    const forged = structuredClone(plan); forged[field].travelDistance += 0.1;
    assert.throws(() => exportCPProcessingSVG(doc, forged), /统计/); assert.throws(() => exportCPProcessingDXF(doc, forged), /统计/);
  }
});

test('a 12,000-edge continuous path uses standard LWPOLYLINE without embedded provenance', () => {
  const doc = document(Array.from({length: 12_000}, (_, i) => segment('edge_' + i, [i, 0], [i + 1, 0])));
  const plan = optimizeCPPaths(doc, {profiles: {M: {settingsKey: '压'.repeat(4096)}}}), output = exportCPProcessingDXF(doc, plan).text;
  const parsed = parseDxf(output); assert.equal(parsed.segments.length, 12_000); assert.equal(parsed.units, 4); assert.equal(parsed.version, 'AC1015');
  const pairs = readPairs(output), [start, end] = entityRange(pairs), entities = pairs.slice(start, end);
  assert.equal(entityRecords(entities).length, 1); assert.equal(entities[0].value, 'LWPOLYLINE');
  assert.equal(entities.find(p => p.code === 90)!.value, '12001');
  assert.ok(!pairs.some(p => p.code === 999 || p.code >= 1000)); assert.doesNotMatch(output, /ZHEZHI_CP/);
  const report = verifyCPProcessingExport(output, 'dxf', doc, plan);
  assert.equal(report.processedEdgeCount, 12_000); assert.equal(report.representation, 'dxf-lwpolyline'); assert.equal(report.entityCount, 1); assert.equal(report.continuousPathsPreserved, true);
  const fallback = exportCPProcessingDXFLines(doc, plan).text, fallbackReport = verifyCPProcessingExport(fallback, 'dxf-lines', doc, plan);
  assert.equal(parseDxf(fallback).segments.length, 12_000); assert.equal(fallbackReport.entityCount, 12_000); assert.equal(fallbackReport.pathCount, 12_000); assert.equal(fallbackReport.continuousPathsPreserved, false);
});

test('capacity-sized disconnected paths verify with linear source-membership storage', () => {
  const doc = document(Array.from({length: 12_000}, (_, i) => segment(`edge_${i}`, [i * 2, 0], [i * 2 + 1, 0]))), plan = optimizeCPPaths(doc);
  for (const format of ['svg', 'dxf', 'dxf-lines'] as const) {
    const output = writer(format)(doc, plan).text, report = verifyCPProcessingExport(output, format, doc, plan);
    assert.equal(report.pathCount, 12_000); assert.equal(report.processedEdgeCount, 12_000); assert.equal(report.downLength, 12_000); assert.equal(report.travelLength, plan.after.travelDistance);
  }
});
test('R12 LINE fallback keeps exactly the ordinary exporter dialect and optimized edge sequence', () => {
  const doc = chain(), original = exportDXF(doc).text, plan = optimizeCPPaths(doc), text = exportCPProcessingDXFLines(doc, plan).text;
  const pairs = readPairs(text), ordinaryPairs = readPairs(original), [start, end] = entityRange(pairs), [ordinaryStart] = entityRange(ordinaryPairs);
  assert.deepEqual(pairs.slice(0, start), ordinaryPairs.slice(0, ordinaryStart));
  assert.equal(pairs[0].code, 999); assert.equal(parseDxf(text).version, 'AC1009'); assert.equal(parseDxf(text).units, null);
  assert.ok(!pairs.some(p => p.code === 100 || p.code === 1000 || p.code === 1001 || p.code === 9 && p.value === '$INSUNITS'));
  assert.doesNotMatch(text, /APPID|ZHEZHI_CP|POLYLINE/);
  assert.ok(entityRecords(pairs.slice(start, end)).every(record => record[0].value === 'LINE'));
  const geometry = parseDxf(text).segments;
  const ordered = plan.paths.flatMap(path => path.points.slice(0, -1).map((a, i) => ({a: [a[0], -a[1]], b: [path.points[i + 1][0], -path.points[i + 1][1]]})));
  assert.deepEqual(geometry.map(({a, b}) => ({a, b})), ordered);
  const report = verifyCPProcessingExport(text, 'dxf-lines', doc, plan);
  assert.equal(report.pathCount, 3); assert.equal(report.representation, 'dxf-line'); assert.equal(report.downLength, plan.after.drawLength); assert.equal(report.travelLength, plan.after.travelDistance);
});

test('LINE compatibility readback rejects mutation, hidden processing, omitted edges and changed layer/axis/scale', () => {
  const doc = chain(), plan = optimizeCPPaths(doc), output = exportCPProcessingDXFLines(doc, plan).text;
  const variants = [
    alterFirstDXFVertex(output, (v, c) => c === 10 ? String(Number(v) * 2) : v),
    alterFirstDXFVertex(output, (v, c) => c === 20 ? String(-Number(v)) : v),
    mutateEntities(output, p => {p.find(q => q.code === 11)!.value = 'NaN'; return p;}),
    mutateEntities(output, p => [p[0], {code: 60, value: '1'}, ...p.slice(1)]),
    mutateEntities(output, p => {p.find(q => q.code === 6)!.value = 'DASHED'; return p;}),
    mutateEntities(output, p => {p.find(q => q.code === 31)!.value = '0.1'; return p;}),
    mutateEntities(output, p => entityRecords(p).slice(1).flat()),
    mutateEntities(output, p => [...p, ...entityRecords(p)[0]]),
    output.replace('AC1009', 'AC1015'),
    output.replace('$LUNITS\r\n70\r\n2', '$LUNITS\r\n70\r\n1'),
    output + '0\r\nLINE\r\n',
  ];
  for (const text of variants) {assert.notEqual(text, output); assert.throws(() => verifyCPProcessingExport(text, 'dxf-lines', doc, plan), /核验失败/);}
});

test('R2000 skeleton has unique handles, valid owners/pointers, consistent table counts and next HANDSEED', () => {
  const doc = document([segment('a', [0, 0], [1, 0]), segment('b', [3, 0], [4, 0], 'V')]), plan = optimizeCPPaths(doc), pairs = readPairs(exportCPProcessingDXF(doc, plan).text);
  const sections = new Map<string, TestPair[]>();
  for (let i = 0; i < pairs.length; i++) if (pairs[i].value === 'SECTION' && pairs[i].code === 0) {
    const start = i + 2; let end = start; while (!(pairs[end].code === 0 && pairs[end].value === 'ENDSEC')) end++;
    sections.set(pairs[i + 1].value, pairs.slice(start, end)); i = end;
  }
  assert.deepEqual([...sections.keys()], ['HEADER', 'CLASSES', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS']);
  const records = [...sections].filter(([name]) => name !== 'HEADER').flatMap(([, body]) => entityRecords(body));
  const handles = records.flatMap(record => record.filter(p => p.code === 5 || p.code === 105).map(p => p.value));
  assert.equal(handles.length, new Set(handles).size);
  const defined = new Set(handles);
  for (const p of records.flat()) if ([330, 340, 342, 350, 390].includes(p.code) && p.value !== '0') assert.ok(defined.has(p.value), 'dangling handle ' + p.value);
  const head = sections.get('HEADER')!, seed = head[head.findIndex(p => p.code === 9 && p.value === '$HANDSEED') + 1];
  assert.equal(seed.code, 5); assert.equal(parseInt(seed.value, 16), Math.max(...handles.map(h => parseInt(h, 16))) + 1);
  const tables = entityRecords(sections.get('TABLES')!);
  for (let i = 0; i < tables.length; i++) if (tables[i][0].value === 'TABLE') {
    const table = tables[i], count = Number(table.find(p => p.code === 70)!.value); let actual = 0;
    while (tables[++i][0].value !== 'ENDTAB') actual++;
    assert.equal(count, actual, 'incorrect count for ' + table.find(p => p.code === 2)!.value);
  }
  assert.doesNotMatch(writePairs(sections.get('ENTITIES')!), /ZHEZHI_CP|APPID|1001\r\n/);
});

