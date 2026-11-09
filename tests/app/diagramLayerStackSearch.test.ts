import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterDiagramLayerStackFaces} from '../../src/components/diagramLayerStackSearch';

test('paper search preserves the supplied layer order and zero-based source identities',()=>{
  const faces=Object.freeze([119,2,11,111,0]);
  assert.deepEqual(filterDiagramLayerStackFaces(faces,'12'),[119,11,111]);
  assert.deepEqual(faces,[119,2,11,111,0]);
  assert.deepEqual(filterDiagramLayerStackFaces(faces,''),faces);
  assert.deepEqual(filterDiagramLayerStackFaces(faces,' \t '),faces);
});

test('paper search accepts F identifiers, letter case, whitespace and full-width input',()=>{
  const faces=[119,11,111,0];
  for(const query of ['F12','f12',' f 12 ','Ｆ１２'])assert.deepEqual(filterDiagramLayerStackFaces(faces,query),[119,11]);
  assert.deepEqual(filterDiagramLayerStackFaces(faces,'１１２'),[111]);
  assert.deepEqual(filterDiagramLayerStackFaces(faces,'F1'),faces);
});

test('paper search does not match layer positions or fabricate unnamed papers',()=>{
  const faces=[11,24,7];
  assert.deepEqual(filterDiagramLayerStackFaces(faces,'F2'),[24]);
  assert.deepEqual(filterDiagramLayerStackFaces(faces,'F3'),[]);
  assert.deepEqual(filterDiagramLayerStackFaces(faces,'第一层'),[]);
  assert.deepEqual(filterDiagramLayerStackFaces([],''),[]);
});
