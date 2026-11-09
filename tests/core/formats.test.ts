import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportDocument, importDocument, importFold, importParsedDocument } from '../../src/core/formats';
import {importFoldInterchange} from '../../src/core/foldInterchange';
import { type Doc } from '../../src/core/types';
const sample: Doc = { name: '中文 & <折痕>', paper: { width: 200, height: 200 }, segments: [
  { id: 'b0', a: [-100, -100], b: [100, -100], assignment: 'B', angle: 0 },
  { id: 'b1', a: [100, -100], b: [100, 100], assignment: 'B', angle: 0 },
  { id: 'b2', a: [100, 100], b: [-100, 100], assignment: 'B', angle: 0 },
  { id: 'b3', a: [-100, 100], b: [-100, -100], assignment: 'B', angle: 0 },
  { id: 'v', a: [-100, 0], b: [100, 0], assignment: 'V', angle: 180 },
  { id: 'a', a: [-100, 20], b: [100, 20], assignment: 'A', angle: 0 },
] };
const lineValues = (d: Doc) => d.segments.map(s => [s.a, s.b, s.assignment, s.angle]);
test('native JSON preserves full document with explicit v2 migration', () => assert.deepEqual(importDocument(exportDocument(sample, 'json').text, 'json').doc, {...sample,schemaVersion:2,objects:[]}));
test('already parsed native JSON follows the same import path', () => {
  const text=exportDocument(sample,'json').text;
  assert.deepEqual(importParsedDocument(JSON.parse(text),'json'),importDocument(text,'json'));
});
test('CP round trip preserves semantic M V B A and coordinates', () => {
  const output = exportDocument(sample, 'cp',{cpCoordinates:'original'}); assert.deepEqual(lineValues(importDocument(output.text, 'cp').doc), lineValues(sample)); assert.ok(output.warnings.length);
});

test('CP type 4 imports as non-folding auxiliary, not flat or unassigned',()=>{
  const loaded=importDocument('4 200 200 191.66666666666657 191.66666666666657','cp');
  assert.equal(loaded.doc.segments[0].assignment,'A');assert.equal(loaded.doc.segments[0].angle,0);
  assert.deepEqual(loaded.doc.segments[0].b,[191.66666666666657,191.66666666666657]);assert.ok(loaded.warnings.some(w=>w.includes('不参与折叠')));
});
test('CP legacy 0 and current 4 both import as auxiliary and export as 4',()=>{
  const loaded=importDocument('\uFEFF# legacy\r\n0 -10 0 0 10\r\n4 0 10 10 0\r\n','cp');
  assert.deepEqual(loaded.doc.segments.map(s=>s.assignment),['A','A']);
  assert.deepEqual(exportDocument(loaded.doc,'cp').text.trim().split('\n').map(l=>l.split(' ')[0]),['4','4']);
});
test('CP accepts CR-only and mixed line endings without changing geometry or diagnostic line numbers',()=>{
  const rows=['# 旧换行格式','','1 -10 -10 10 -10','2 -10 -10 10 10','4 0 0 10 0'];
  const baseline=importDocument(rows.join('\n'),'cp');
  assert.deepEqual(importDocument(rows.join('\r'),'cp'),baseline);
  assert.deepEqual(importDocument(rows[0]+'\r\n'+rows[1]+'\r'+rows[2]+'\n'+rows[3]+'\r\n'+rows[4],'cp'),baseline);
  assert.throws(()=>importDocument('# comment\r\r1 0 0 10 0\r5 0 0 10 10','cp'),/第 4 行/);
});
test('CP canonical auxiliary code does not change OPX auxiliary code',()=>{
  assert.match(exportDocument(sample,'cp').text,/^4 -200 40 200 40$/m);
  const opx=exportDocument(sample,'opx').text;assert.match(opx,/<void property="type"><int>0<\/int>/);assert.doesNotMatch(opx,/<void property="type"><int>4<\/int>/);
  assert.equal(importDocument(opx,'opx').doc.segments.at(-1)?.assignment,'A');
  assert.throws(()=>importDocument(opx.replace('<void property="type"><int>0</int>','<void property="type"><int>4</int>'),'opx'),/OPX 线型 4/);
});
test('CP errors retain original line numbers and reject unknown types',()=>{
  const text='# test\n'+'\n'.repeat(159)+'4 0 0 10 10\n5 0 0 1 1';assert.throws(()=>importDocument(text,'cp'),/第 162 行/);
  assert.throws(()=>importDocument('constructor 0 0 1 1','cp'),/格式无效/);assert.throws(()=>importDocument('4 NaN 0 1 1','cp'),/数值/);
});
test('CP auxiliary survives native and FOLD exchange without becoming a face edge',()=>{
  const loaded=importDocument(exportDocument(sample,'cp').text,'cp').doc;
  assert.equal(importDocument(exportDocument(loaded,'json').text,'json').doc.segments.at(-1)?.assignment,'A');
  const fold=importFoldInterchange(JSON.parse(exportDocument(loaded,'fold').text)) as any;assert.equal(fold.zhezhi_auxiliary.length,1);assert.equal(fold.faces_vertices.length,2);assert.ok(!fold.edges_assignment.includes('A'));
});
test('native F and U are not silently relabeled as CP auxiliary',()=>{
  for(const assignment of ['F','U'] as const){const d=structuredClone(sample);d.segments[5].assignment=assignment;d.segments[5].angle=assignment==='F'?0:null;assert.throws(()=>exportDocument(d,'cp'),/不支持/);assert.equal(importDocument(exportDocument(d,'json').text,'json').doc.segments[5].assignment,assignment);}
});
test('OPX public-field encoding roundtrip preserves Chinese name and zero fields', () => {
  const output = exportDocument(sample, 'opx'), loaded = importDocument(output.text, 'opx');
  assert.equal(loaded.doc.name, sample.name); assert.deepEqual(lineValues(loaded.doc), lineValues(sample));
});
test('OPX omitted coordinates default to zero; DTD and objects rejected', () => {
  const xml = '<java><object class="oripa.DataSet"><void property="lines"><array class="oripa.OriLineProxy" length="1"><void index="0"><object class="oripa.OriLineProxy"><void property="type"><int>2</int></void><void property="x1"><double>20</double></void></object></void></array></void></object></java>';
  assert.deepEqual(importDocument(xml, 'opx').doc.segments[0].a, [0, 0]);
  assert.throws(() => importDocument('<!DOCTYPE java [<!ENTITY x SYSTEM "file:///x">]>' + xml, 'opx'), /DTD/);
  assert.throws(() => importDocument(xml.replace('oripa.OriLineProxy"><void property', 'java.lang.Runtime"><void property'), 'opx'), /对象/);
});
test('FOLD exports planar graph and explicit auxiliary extension', () => {
  const output = exportDocument(sample, 'fold'), parsed = JSON.parse(output.text);
  assert.equal(parsed.faces_vertices.length, 2); assert.equal(parsed['zhezhi:workbench'].fields.zhezhi_auxiliary.length, 1); assert.ok(!parsed.edges_assignment.includes('A'));
  const loaded = importDocument(output.text, 'fold'); assert.equal(loaded.doc.name, sample.name); assert.equal(loaded.doc.segments.filter(s => s.assignment === 'A').length, 1);
});
test('FOLD null angles are valid and preserved, not silently assigned 180', () => {
  const raw = { vertices_coords: [[0, 0], [10, 0], [20, 0]], edges_vertices: [[0, 1], [1, 2]], edges_assignment: ['M', 'U'], edges_foldAngle: [null, null] };
  const loaded = importFold(raw); assert.deepEqual(loaded.doc.segments.map(s => s.angle), [null, null]);
  const output = JSON.parse(exportDocument(loaded.doc, 'fold').text); assert.deepEqual(output.edges_foldAngle, [null, null]);
});
test('FOLD rejects multi-frame, folded form and nonzero Z', () => {
  const raw = { vertices_coords: [[0, 0], [1, 0]], edges_vertices: [[0, 1]], edges_assignment: ['M'] };
  assert.throws(() => importFold({ ...raw, file_frames: [{}] }), /多个/);
  assert.throws(() => importFold({ ...raw, frame_classes: ['foldedForm'] }), /折后/);
  assert.throws(() => importFold({ ...raw, vertices_coords: [[0, 0, 1], [1, 0, 0]] }), /三维/);
});
test('FOLD unknown assignment/cut rejected and metadata not silently lost', () => {
  const raw = { vertices_coords: [[0, 0], [10, 0]], edges_vertices: [[0, 1]], edges_assignment: ['M'], mystery_field: 'x' };
  assert.throws(() => importFold({ ...raw, edges_assignment: ['C'] }), /暂不支持/);
  const result = importFold(raw); assert.equal((result.doc.metadata?.sourceFoldExtras as Record<string, unknown>).mystery_field, 'x'); assert.ok(result.warnings.some(w => w.includes('mystery_field')));
});
test('FOLD unit conversion preserves negative coordinates', () => {
  const r = importFold({ frame_unit: 'cm', vertices_coords: [[-1, 0], [2, 0]], edges_vertices: [[0, 1]], edges_assignment: ['M'] });
  assert.deepEqual(r.doc.segments[0].a, [-10, 0]); assert.deepEqual(r.doc.segments[0].b, [20, 0]);
});
test('unsupported CP U/F export is refused, invalid numeric and sign rejected', () => {
  const d = structuredClone(sample); d.segments[4].assignment = 'U'; d.segments[4].angle = null;
  assert.throws(() => exportDocument(d, 'cp'), /不支持/);
  assert.throws(() => importDocument('2 NaN 0 1 2', 'cp'), /数值/);
  d.segments[4].assignment = 'M'; d.segments[4].angle = 10; assert.throws(() => exportDocument(d, 'json'), /符号/);
});
