import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendText, updateText, deleteTexts, pickText, textIdsInBox, TEXT_DEFAULTS } from '../../src/app/textTools';
import { historyReducer, type History } from '../../src/app/state';
import { exportDocument, importDocument } from '../../src/core/formats';
import type { Doc, Point } from '../../src/core/types';
const doc: Doc = { name: '文字编辑', paper: { width: 200, height: 200 }, segments: [{ id: 'text', a: [0, 0], b: [200, 0], assignment: 'B', angle: 0 }], objects: [{ id: 'circle', kind: 'circle', center: [50, 50], radius: 10, color: '#123456' }] };
const properties = { ...TEXT_DEFAULTS, position: [10, 20] as Point, text: '山折\n谷折' };
test('text creation avoids geometry IDs and owns its position without mutating input', () => {
  const position: Point = [10, 20], next = appendText(doc, { ...properties, position });
  position[0] = 90;
  assert.equal(next.objects!.at(-1)!.id, 'text:2');
  assert.deepEqual(next.objects!.at(-1), { ...properties, id: 'text:2', kind: 'text' });
  assert.equal(next.segments, doc.segments); assert.equal(doc.objects!.length, 1);
  assert.equal(appendText(next, properties).objects!.at(-1)!.id, 'text:3');
});
test('edit and move preserve other objects; no-op returns original document', () => {
  const start = appendText(doc, properties), position: Point = [30, 40];
  const next = updateText(start, 'text:2', { position, text: '  中文\n注释', color: '#8052ad', fontSize: 8 });
  position[0] = 99;
  assert.deepEqual(next.objects!.at(-1), { ...properties, id: 'text:2', kind: 'text', position: [30, 40], text: '  中文\n注释', color: '#8052ad', fontSize: 8 });
  assert.equal(next.objects![0], start.objects![0]); assert.equal(next.segments, start.segments);
  assert.equal(updateText(next, 'text:2', { position: [30, 40] }), next);
  assert.deepEqual(start.objects!.at(-1), { ...properties, id: 'text:2', kind: 'text' });
});
test('invalid drafts and edits fail without changing the document', () => {
  const start = appendText(doc, properties), copy = structuredClone(start);
  for (const patch of [{ text: '' }, { text: ' \n ' }, { text: 'a'.repeat(10001) }, { color: 'url(evil)' }, { fontSize: 0 }, { fontSize: NaN }, { position: [1e6 + 1, 0] as Point }]) {
    assert.throws(() => appendText(doc, { ...properties, ...patch }));
    assert.throws(() => updateText(start, 'text:2', patch));
  }
  assert.throws(() => updateText(start, 'circle', { text: 'bad' }));
  assert.throws(() => updateText(start, 'missing', { text: 'bad' }));
  assert.deepEqual(start, copy);
});
test('deletion ignores stale and non-text IDs and preserves all crease segments', () => {
  const start = appendText(doc, properties);
  assert.equal(deleteTexts(start, new Set(['missing', 'text', 'circle'])), start);
  const next = deleteTexts(start, new Set(['text:2', 'circle', 'text']));
  assert.deepEqual(next.objects, doc.objects); assert.equal(next.segments, doc.segments);
});
test('hit testing uses measured glyph bounds, then nearest anchor, not estimated width', () => {
  const start = appendText(appendText(doc, properties), { ...properties, position: [15, 20] });
  const bounds = new Map([['text:2', { x: 10, y: 15, width: 12, height: 10 }], ['text:3', { x: 15, y: 15, width: 12, height: 10 }]]);
  assert.equal(pickText(start.objects!, [16, 20], bounds)?.id, 'text:3');
  assert.equal(pickText(start.objects!, [28, 20], bounds), undefined);
  assert.equal(pickText(start.objects!, [28, 20], bounds, 1)?.id, 'text:3');
  assert.equal(pickText(start.objects!, [10, 20], new Map()), undefined);
  assert.equal(pickText(start.objects!, [NaN, 20], bounds), undefined);
  assert.equal(pickText(start.objects!, [16, 20], bounds, -1), undefined);
});
test('text marquee supports full containment and boundary touching independent of direction', () => {
  const start = appendText(doc, properties), bounds = new Map([['text:2', { x: 10, y: 15, width: 12, height: 10 }]]);
  assert.deepEqual([...textIdsInBox(start.objects!, bounds, [0, 0], [30, 30], 'contained')], ['text:2']);
  assert.equal(textIdsInBox(start.objects!, bounds, [22, 20], [30, 30], 'contained').size, 0);
  assert.deepEqual([...textIdsInBox(start.objects!, bounds, [30, 30], [22, 20], 'touching')], ['text:2']);
  assert.equal(textIdsInBox(start.objects!, bounds, [23, 20], [30, 30], 'touching').size, 0);
});
test('create edit move delete each form one undo step with redo restoring text', () => {
  let history: History = { past: [], present: doc, future: [] };
  const created = appendText(doc, properties), edited = updateText(created, 'text:2', { text: '更新' });
  const moved = updateText(edited, 'text:2', { position: [80, 80] }), deleted = deleteTexts(moved, new Set(['text:2']));
  for (const next of [created, edited, moved, deleted]) history = historyReducer(history, { type: 'commit', doc: next });
  assert.equal(history.past.length, 4);
  for (const expected of [moved, edited, created, doc]) { history = historyReducer(history, { type: 'undo' }); assert.equal(history.present, expected); }
  for (const expected of [created, edited, moved, deleted]) { history = historyReducer(history, { type: 'redo' }); assert.equal(history.present, expected); }
});
test('native exchange preserves edited multiline text and CP warns about omitted objects', () => {
  const next = updateText(appendText(doc, properties), 'text:2', { text: '汉字\n  <注释> & 😀' });
  const exported = exportDocument(next, 'json');
  assert.deepEqual(importDocument(exported.text, 'json').doc.objects, next.objects);
  assert.ok(exportDocument(next, 'cp').warnings.length > 0);
});
