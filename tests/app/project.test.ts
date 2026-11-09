import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upgradeProject } from '../../src/core/project';
import { validateDoc, type Doc } from '../../src/core/types';
import { exportDocument, importDocument } from '../../src/core/formats';
import { buildFold } from '../../src/core/geometry';
import { blankDoc, line, assign, historyReducer, transformSelection } from '../../src/app/state';
import { objectsSVG, resizeDocument } from '../../src/app/drawingObjects';
import { splitEditableSegments } from '../../src/app/planarize';
import { chooseRecovery } from '../../src/app/recovery';
import { getDrawingBounds, paperPath } from '../../src/app/paper';
import { TOOL_GUIDES, TOOL_NAMES, getToolStep } from '../../src/app/tools';

function fixture(): Doc {
  return { ...blankDoc('v2工程',200,200), objects: [
    { id: 'circle', kind: 'circle', center: [50, 50], radius: 25, color: '#8052ad' },
    { id: 'label', kind: 'text', position: [10, 20], text: '中文 <script>& "文字"', fontSize: 5, color: '#224466' },
    { id: 'mark', kind: 'mark', a: [0, 100], b: [200, 100], color: '#337755' },
  ] };
}
test('legacy migration is explicit, immutable and idempotent; never invents paper edges', () => {
  const legacy: Doc = { name: '旧图', paper: { width: 100, height: 100 }, segments: [], metadata: { source: '原作' } };
  const before = structuredClone(legacy), upgraded = upgradeProject(legacy);
  assert.equal(upgraded.schemaVersion, 2); assert.deepEqual(upgraded.objects, []);
  assert.deepEqual(upgraded.segments, []); assert.deepEqual(legacy, before);
  assert.deepEqual(upgradeProject(upgraded), upgraded);
});
test('v1 native input upgrades; v2 complete native roundtrip retains objects and extensions', () => {
  const old = importDocument(JSON.stringify({ format: 'zhezhi-workbench', version: 1, name: '旧图', paper: { width: 10, height: 10 }, segments: [], custom: { a: 1 } }), 'json');
  assert.equal(old.doc.schemaVersion, 2); assert.deepEqual(old.doc.metadata?.nativeExtras, { custom: { a: 1 } });
  const doc = fixture(); const text = exportDocument(doc, 'json').text;
  assert.equal(JSON.parse(text).version, 2); assert.deepEqual(importDocument(text, 'json').doc, doc);
});
test('future or conflicting native versions and foreign formats fail before replacement', () => {
  for (const extras of [{version:3},{version:1,schemaVersion:2},{format:'another-app'}])
    assert.throws(() => importDocument(JSON.stringify({ ...fixture(), ...extras }), 'json'));
  assert.throws(() => upgradeProject({ ...fixture(), schemaVersion: 999 }), /版本/);
});
test('invalid object kinds, shared IDs, values, markup colors and capacity are rejected', () => {
  const doc = fixture();
  for (const object of [
    {...doc.objects![0], kind:'unknown'}, {...doc.objects![0], id:doc.segments[0].id},
    {...doc.objects![0], radius:0}, {...doc.objects![0], center:[NaN,0]},
    {...doc.objects![0], color:'url(https://example.com)'},
    {...doc.objects![1], text:42}, {...doc.objects![1], fontSize:Infinity},
    {...doc.objects![2], a:[0]},
  ]) assert.throws(() => validateDoc({ ...doc, objects: [object] }));
  assert.throws(() => validateDoc({ ...doc, objects: Array(1501).fill(doc.objects![0]) }));
});
test('solver excludes circles, text and marks while editable normalization preserves them', () => {
  const doc = fixture();
  assert.deepEqual(buildFold(doc).graph, buildFold({...doc,objects:[]}).graph);
  const split = splitEditableSegments({...doc,segments:[...doc.segments,line([0,50],[200,50],'M')]});
  assert.deepEqual(split.objects, doc.objects); assert.equal(split.objects!.length, 3);
});
test('line editing, undo and redo preserve complete object payloads', () => {
  const doc = fixture();
  const next = transformSelection(doc, new Set([doc.segments[0].id]), 'move', 5, 5);
  let history = historyReducer({ past: [], present: doc, future: [] }, { type: 'commit', doc: next });
  assert.deepEqual(history.present.objects, doc.objects);
  history = historyReducer(history,{type:'undo'}); assert.deepEqual(history.present, doc);
  history = historyReducer(history,{type:'redo'}); assert.deepEqual(history.present, next);
});
test('recovery retains versioned object data and rejects invalid objects', () => {
  const doc = fixture(), updated = new Date().toISOString();
  assert.deepEqual(chooseRecovery({doc,updated},null).recovery?.doc,doc);
  assert.equal(chooseRecovery({doc:{...doc,objects:[{kind:'future'}]},updated},null).recovery,null);
});
test('all geometry-only export formats explicitly warn about omitted drawing objects', () => {
  for (const format of ['cp','opx','fold'] as const) {
    const result = exportDocument(fixture(),format);
    assert.ok(result.warnings.some(w => w.includes('3 个圆、文字或独立标记')));
  }
});
test('safe SVG displays annotations as text, never executable markup', () => {
  const svg = objectsSVG(fixture());
  assert.ok(svg.includes('<circle')); assert.ok(svg.includes('<text')); assert.ok(svg.includes('&lt;script&gt;&amp;'));
  assert.ok(!svg.includes('<script>'));
});
test('uniform resizing scales all objects and rejects circle distortion atomically', () => {
  const doc=fixture(), before=structuredClone(doc), resized=resizeDocument(doc,400,400);
  assert.deepEqual(resized.objects![0],{...doc.objects![0],center:[100,100],radius:50});
  assert.equal((resized.objects![1] as any).fontSize,10);
  assert.deepEqual((resized.objects![2] as any).b,[400,200]);
  assert.throws(()=>resizeDocument(doc,400,200),/不能单向拉伸/);
  assert.deepEqual(doc,before);
});
test('drawing extents include objects outside paper but objects never define the outline', () => {
  const doc=fixture(); doc.objects=[{id:'outside',kind:'circle',center:[300,300],radius:20,color:'#111111'}];
  assert.equal(getDrawingBounds(doc).width,320);
  assert.equal(paperPath(doc),paperPath({...doc,objects:[]}));
});
test('boundary drawing and reassignment use zero angle and preserve history', () => {
  assert.equal(line([0,0],[10,0],'B').angle,0);
  const source=line([0,0],[10,0],'V'), boundary=assign([source],new Set([source.id]),'B')[0];
  assert.equal(boundary.assignment,'B'); assert.equal(boundary.angle,0);
  assert.equal(assign([boundary],new Set([source.id]),'M')[0].angle,-180);
});
test('all existing tools have one shared name and nonempty localized step definitions', () => {
  for (const id of Object.keys(TOOL_GUIDES) as (keyof typeof TOOL_GUIDES)[]) {
    assert.equal(TOOL_NAMES[id],TOOL_GUIDES[id].name);
    assert.ok(TOOL_GUIDES[id].usage); assert.ok(getToolStep(id,999).instruction);
    assert.equal(getToolStep(id,NaN).instruction,TOOL_GUIDES[id].steps[0]);
  }
});
