import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCustomColor, segmentDisplayColor } from '../../src/app/customColor';
import { validateDoc, type Doc } from '../../src/core/types';
import { exportDocument, importDocument } from '../../src/core/formats';
import { splitEditableSegments } from '../../src/app/planarize';
import { assign, COLORS, historyReducer, transformSelection } from '../../src/app/state';
import { buildFold } from '../../src/core/geometry';
const doc: Doc = { name: '颜色数据', paper: { width: 200, height: 200 }, segments: [
  { id: 'aux', a: [0, 0], b: [100, 0], assignment: 'A', angle: 0 },
  { id: 'mountain', a: [50, -50], b: [50, 50], assignment: 'M', angle: -60 },
], objects: [{ id: 'circle', kind: 'circle', center: [25, 25], radius: 10, color: '#123456' }] };
const targets = { segmentIds: new Set(['aux', 'mountain']), circleIds: new Set(['circle']) };
test('custom color changes only display data of eligible objects atomically', () => {
  const next = applyCustomColor(doc, targets, '#ABCDEF');
  assert.equal(next.segments[0].displayColor, '#abcdef'); assert.equal(next.objects![0].color, '#abcdef');
  assert.equal(next.segments[1], doc.segments[1]); assert.equal(doc.segments[0].displayColor, undefined);
  assert.deepEqual(next.segments.map(s => [s.assignment, s.angle, s.a, s.b]), doc.segments.map(s => [s.assignment, s.angle, s.a, s.b]));
  assert.equal(applyCustomColor(next, targets, '#ABCDEF'), next);
  const history = historyReducer({ past: [], present: doc, future: [] }, { type: 'commit', doc: next });
  assert.equal(historyReducer(history, { type: 'undo' }).present, doc);
});
test('retyping auxiliary geometry restores semantic M/V color while keeping its override inert', () => {
  const next = applyCustomColor(doc, targets, '#ff0000');
  assert.equal(segmentDisplayColor(next.segments[0]), '#ff0000');
  const mountain = assign(next.segments, new Set(['aux']), 'M')[0];
  assert.equal(mountain.displayColor, '#ff0000'); assert.equal(segmentDisplayColor(mountain), COLORS.M);
  assert.equal(segmentDisplayColor(assign([mountain], new Set(['aux']), 'A')[0]), '#ff0000');
});
test('unsafe colors reject before mutation and native import validates overrides', () => {
  for (const color of ['red', '#fff', 'url(https://evil)', '" onload="x', '#12345678']) {
    assert.throws(() => applyCustomColor(doc, targets, color));
    assert.throws(() => validateDoc({ ...doc, segments: [{ ...doc.segments[0], displayColor: color }] }));
  }
  assert.equal(doc.objects![0].color, '#123456');
});
test('JSON and auxiliary FOLD extension retain colors; CP and OPX warn about loss', () => {
  const next = applyCustomColor(doc, targets, '#abcdef');
  assert.deepEqual(importDocument(exportDocument(next, 'json').text, 'json').doc.segments, next.segments);
  const roundtrip = importDocument(exportDocument(next, 'fold').text, 'fold').doc;
  assert.equal(roundtrip.segments.find(s => s.assignment === 'A')!.displayColor, '#abcdef');
  for (const format of ['cp', 'opx'] as const) assert.ok(exportDocument(next, format).warnings.some(w => w.includes('自定义显示颜色')));
});
test('real intersection splitting and selection copies preserve auxiliary display overrides', () => {
  const next = applyCustomColor(doc, targets, '#abcdef'), split = splitEditableSegments(next);
  assert.equal(split.segments.filter(s => s.assignment === 'A').length, 2);
  assert.ok(split.segments.filter(s => s.assignment === 'A').every(s => s.displayColor === '#abcdef'));
  const copied = transformSelection(next, new Set(['aux']), 'copy', 10, 20);
  assert.equal(copied.segments.at(-1)!.displayColor, '#abcdef');
});
test('colors are not inputs to the folding graph', () => {
  assert.deepEqual(buildFold(applyCustomColor(doc, targets, '#abcdef')).graph, buildFold(doc).graph);
});
