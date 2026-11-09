import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareModelSnapshot} from '../../src/app/modelSnapshot';
import {exportModelSnapshot} from '../../src/core/modelSnapshot';
import {computeFlatFold} from '../../src/core/flatFold';
import {blankDoc} from '../../src/app/state';
import {splitEditableSegments} from '../../src/app/planarize';
import {resolveStartingFace} from '../../src/app/flatFoldSettings';
import {materialCutFixture,materialSlitFixture} from '../fixtures/materialModel';

test('snapshot preparation preserves source/model correspondence through editor upgrade',()=>{
  const doc=blankDoc('快照准备',100,100),result=computeFlatFold(doc);
  const prepared=prepareModelSnapshot(exportModelSnapshot(doc,result));
  assert.deepEqual(prepared.doc,doc);assert.deepEqual(prepared.result.geometry.vertices,result.geometry.vertices);
  assert.equal(prepared.result.layers.status,'unknown');
});

test('snapshot root index restores its source contour before publishing into editor',()=>{
  const doc=blankDoc('第二起始面',100,100);doc.segments.push({id:'m',a:[50,0],b:[50,100],assignment:'M',angle:-180});
  const source=splitEditableSegments(doc),before=structuredClone(source),result=computeFlatFold(source,undefined,{startingFace:1});
  assert.equal(source.flatFold,undefined);
  const prepared=prepareModelSnapshot(exportModelSnapshot(source,result));
  assert.deepEqual(resolveStartingFace(prepared.doc,prepared.graph),{face:1,stale:false});
  assert.equal(prepared.result.geometry.startingFace,1);assert.deepEqual(source,before);
  assert.deepEqual(prepared.doc.segments,source.segments);
});

test('material snapshot preparation preserves split banks and the calculation-time source root',()=>{
 for(const {source,result} of [materialCutFixture(),materialSlitFixture()]){
  const before=structuredClone(source),prepared=prepareModelSnapshot(exportModelSnapshot(source,result));
  assert.deepEqual(prepared.doc.segments,source.segments);assert.deepEqual(prepared.result.geometry.vertices,result.geometry.vertices);
  for(const key of ['faces_edges','edges_faces','faces_faces'] as const)assert.deepEqual(JSON.parse(JSON.stringify(prepared.graph[key])),JSON.parse(JSON.stringify(result.geometry.graph![key])));
  assert.deepEqual(resolveStartingFace(prepared.doc,prepared.graph),{face:result.geometry.startingFace,stale:false});assert.deepEqual(source,before);
 }
});
