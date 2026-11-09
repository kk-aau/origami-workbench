import {test} from 'node:test';
import assert from 'node:assert/strict';
import {changeTessParams,readTessParams,tessPreset} from '../../src/app/tessellation';

test('rigid Miura parameters are stable project metadata and never inherit paper extension',()=>{
  const preset=tessPreset('rigid-quad');
  assert.equal(preset.family,'rigid-quad');
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(preset))),preset);
  const edited=changeTessParams(preset,{minimumEdgeLength:2});
  assert.deepEqual(readTessParams(edited),edited);
  assert.equal(readTessParams({...edited,paper:{shape:'square',margin:.1}}),null);
  assert.equal(readTessParams({...edited,bottomFoldAnglesDeg:[45]}),null);
  assert.equal(readTessParams({...edited,minimumEdgeLength:0}),null);
});

test('per-edge minimums must address an edge in the selected rectangular grid',()=>{
  const preset=tessPreset('rigid-quad');
  assert.equal(preset.family,'rigid-quad');
  const valid=readTessParams({...preset,minimumEdgeLengths:[[0,0,0,3],[1,3,2,2]]});
  assert.ok(valid);
  assert.equal(readTessParams({...preset,minimumEdgeLengths:[[0,3,0,3]]}),null);
  assert.equal(readTessParams({...preset,minimumEdgeLengths:[[1,0,3,3]]}),null);
});

test('original backplane and zero-length edge survive project serialization',()=>{
  const original=readTessParams({family:'rigid-quad',
    bottomDirectionsDeg:[90,90,90,90,90],bottomFoldAnglesDeg:[108,-72,-72,-72,108],
    leftDirectionsDeg:[0,0,0,0],leftFoldAnglesDeg:[132.5,-132.5,-132.5,132.5],
    minimumEdgeLength:1,baseFaces:[[0,0],[5,0]],minimumEdgeLengths:[[1,6,2,0]]});
  assert.ok(original);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(original))),original);
  assert.equal(readTessParams({...original,baseFaces:[[6,0]]}),null);
  assert.equal(readTessParams({...original,baseFaces:[[0,0],[0,0]]}),null);
  assert.equal(readTessParams({...original,minimumEdgeLengths:[[1,7,2,0]]}),null);
  assert.equal(readTessParams({...original,minimumEdgeLengths:[[1,6,2,-1]]}),null);
  assert.equal(readTessParams({...original,minimumEdgeLengths:[[1,6,2,0],[1,6,2,1]]}),null);
});

test('irregular rigid boundary and four corner angles survive project serialization',()=>{
  const preset=tessPreset('rigid-quad');
  assert.equal(preset.family,'rigid-quad');
  const irregular=readTessParams({...preset,rectangular:false,cornerAnglesDeg:[95,85,95,85]});
  assert.ok(irregular);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(irregular))),irregular);
  assert.equal(readTessParams({...irregular,cornerAnglesDeg:[95,85]}),null);
  assert.equal(readTessParams({...irregular,cornerAnglesDeg:[0,85,95,85]}),null);
  assert.equal(readTessParams({...irregular,cornerAnglesDeg:[181,85,95,85]}),null);
  const withBase=readTessParams({...irregular,baseFaces:[[0,0]]});
  assert.ok(withBase);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(withBase))),withBase);
  assert.equal(readTessParams({...irregular,rectangular:'false'}),null);
});

test('vertex merge tolerance is stable project metadata',()=>{
  const preset=tessPreset('rigid-quad');
  const noMerge=readTessParams({...preset,samePtTolerance:null});
  assert.ok(noMerge);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(noMerge))),noMerge);
  assert.deepEqual(readTessParams({...preset,samePtTolerance:0})?.samePtTolerance,0);
  assert.equal(readTessParams({...preset,samePtTolerance:-1}),null);
  assert.equal(readTessParams({...preset,samePtTolerance:'None'}),null);
  assert.equal(readTessParams({...preset,addPlaneGraph:false}),null);
});
