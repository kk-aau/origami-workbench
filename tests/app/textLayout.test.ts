import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import DrawingObjects from '../../src/components/DrawingObjects';
import { textLines, textLineY, textBounds, type TextObject } from '../../src/app/textLayout';
import { objectsSVG } from '../../src/app/drawingObjects';
import { getDrawingBounds } from '../../src/app/paper';
import type { Doc } from '../../src/core/types';
const object: TextObject = { id: 'note', kind: 'text', color: '#123456', position: [10, 20], text: '山折\r\n\r\n谷折\n', fontSize: 5 };
const doc: Doc = { name: '文字', paper: { width: 200, height: 200 }, segments: [], objects: [object] };
test('text layout preserves blank and trailing lines and all newline conventions', () => {
  assert.deepEqual(textLines(object.text), ['山折', '', '谷折', '']);
  assert.deepEqual(textLines('甲\r乙\n丙'), ['甲', '乙', '丙']);
  assert.equal(textLineY(object, 3), 38);
  assert.deepEqual(textLines(''), ['']);
});
test('fit bounds use the longest line and include all multiline baselines', () => {
  const bounds = textBounds(object);
  assert.equal(bounds.width, 10);
  assert.equal(bounds.y, 15);
  assert.ok(bounds.y + bounds.height >= textLineY(object, 3) + 1.5 - 1e-10);
  const fitted = getDrawingBounds(doc);
  assert.deepEqual([fitted.x, fitted.y, fitted.width], [bounds.x, bounds.y, bounds.width]);
  assert.ok(Math.abs(fitted.height - bounds.height) < 1e-10);
  assert.equal(textBounds({ ...object, text: '😀' }).width, 5);
});
test('canvas and export agree on multiline positions and preserve whitespace', () => {
  const markup = renderToStaticMarkup(createElement(DrawingObjects, { objects: [object], units: 1 }));
  const exported = objectsSVG(doc);
  for (const source of [markup, exported]) {
    assert.equal((source.match(/<tspan /g) ?? []).length, 4);
    for (const y of [20, 26, 32, 38]) assert.ok(source.includes(`x="10" y="${y}"`));
    assert.ok(source.includes('xml:space="preserve"'));
  }
});
test('multiline export escapes markup rather than creating executable elements', () => {
  const source = objectsSVG({ ...doc, objects: [{ ...object, text: '<script>&"\'\n  中文' }] });
  assert.ok(!source.includes('<script>'));
  assert.ok(source.includes('&lt;script&gt;&amp;&quot;&apos;'));
  assert.ok(source.includes('>  中文</tspan>'));
});
