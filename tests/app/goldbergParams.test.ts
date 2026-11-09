import {test} from 'node:test';
import assert from 'node:assert/strict';
import {changeTessParams,readTessParams,tessPreset} from '../../src/app/tessellation';

test('Goldberg original controls survive parameter edits and old projects remain legacy',()=>{
  const original=changeTessParams(tessPreset('nonperiodic'),{kind:'goldberg'});
  assert.ok(original.family==='nonperiodic'&&original.kind==='goldberg');
  assert.deepEqual([original.goldbergVersion,original.goldbergOrder,original.goldbergRings,original.goldbergOffset,original.goldbergOutput],['origamica',5,2,0,'twist']);
  const offset=changeTessParams(original,{goldbergOrder:8,goldbergOffset:1,goldbergOutput:'tiling'});
  assert.deepEqual(readTessParams(offset),offset);
  assert.equal(readTessParams({...offset,goldbergOrder:7}),null);
  assert.equal(readTessParams({...offset,goldbergOffset:4}),null);
  assert.equal(readTessParams({...offset,goldbergOrder:16,goldbergRings:5}),null);
  assert.equal(readTessParams({...offset,goldbergOutput:'unknown'}),null);
  const legacy={family:'nonperiodic',kind:'goldberg',count:9,seed:1,depth:1,angle:45,scale:.3};
  assert.deepEqual(readTessParams(legacy),legacy);
  assert.equal(readTessParams({...legacy,goldbergOrder:7}),null);
  const switched=changeTessParams(offset,{kind:'delaunay'});
  assert.ok(switched.family==='nonperiodic'&&switched.kind==='delaunay'&&switched.goldbergVersion===undefined);
});
