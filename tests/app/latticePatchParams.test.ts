import {test} from 'node:test';
import assert from 'node:assert/strict';
import {changeTessParams,readTessParams,tessPreset} from '../../src/app/tessellation';

test('signed lattice ranges survive project serialization and geometry edits',()=>{
  const preset=tessPreset('custom');
  assert.equal(preset.family,'custom');
  const params=readTessParams({...preset,lattice:[[1,0],[0,1]],range1:[-1,1],range2:[0,1],customOutput:'tiling'});
  assert.ok(params&&params.family==='custom');
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  const moved=changeTessParams(params,{vertices:params.vertices.map(([x,y])=>[x+.1,y])});
  assert.equal(moved.family,'custom');
  assert.deepEqual(moved.range1,[-1,1]);
  assert.deepEqual(moved.range2,[0,1]);
  const reset=changeTessParams(params,{lattice:undefined});
  assert.equal(reset.family,'custom');
  assert.equal(reset.range1,undefined);
  assert.equal(reset.range2,undefined);
});

test('signed lattice ranges require a valid basis and bounded tile count',()=>{
  const preset=tessPreset('custom');
  assert.equal(preset.family,'custom');
  const base={...preset,lattice:[[1,0],[0,1]],range1:[-1,1],range2:[-1,1],customOutput:'tiling'};
  assert.ok(readTessParams(base));
  for(const patch of [
    {range1:[1,-1]},{range2:[-65,0]},{range1:[0,1.5]},
    {range2:undefined},{repeatX:2},{lattice:[[1,0],[2,0]]},
    {range1:[-8,8],range2:[-8,8]},
  ])assert.equal(readTessParams({...base,...patch}),null,JSON.stringify(patch));
});

test('per-tile twist lattice accepts 36 faces but rejects 40',()=>{
  const preset=tessPreset('custom');
  assert.equal(preset.family,'custom');
  const tileTwists=preset.faces.map(face=>({width:.18,offset:0,tilt:70,centralTypes:face.map(()=>'M')}));
  const base={...preset,lattice:[[1,0],[0,1]],range1:[0,2],range2:[0,2],customOutput:'tile-twists',tileTwists};
  assert.ok(readTessParams(base));
  assert.equal(readTessParams({...base,range1:[0,1],range2:[0,4]}),null);
});
