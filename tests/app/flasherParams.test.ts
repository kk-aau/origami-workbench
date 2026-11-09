import test from 'node:test';
import assert from 'node:assert/strict';
import {flasherFaceCount,hexFlasherSavedParams,readFlasherParams} from '../../src/app/flasherParams';
import {readTessParams,tessPreset} from '../../src/app/tessellation';

test('Flasher presets and saved parameters retain both original example branches',()=>{
  const first=tessPreset('flasher');
  assert.deepEqual(first,{family:'flasher',rings:2,heightOrder:2,rotationalOrder:4,
    radialIncrement:.05,diagonal:'Y',minimumAngleDeg:10});
  assert.deepEqual(readTessParams(structuredClone(first)),first);
  const second={...first,rotationalOrder:5,radialIncrement:.1,diagonal:'Z' as const};
  assert.deepEqual(readTessParams(structuredClone(second)),second);
  assert.equal(flasherFaceCount(2,2,4),97);
  assert.equal(flasherFaceCount(2,2,5),121);
  const highOrder={...first,rings:3,heightOrder:3,radialIncrement:0};
  assert.equal(flasherFaceCount(3,3,4),289);
  assert.deepEqual(readTessParams(structuredClone(highOrder)),highOrder);
  const x={...first,rings:3,rotationalOrder:5,radialIncrement:0,diagonal:'X' as const};
  assert.equal(flasherFaceCount(3,2,5),241);
  assert.deepEqual(readTessParams(structuredClone(x)),x);
  const hex=hexFlasherSavedParams();
  assert.deepEqual(hex,{family:'flasher',rings:2,heightOrder:2,rotationalOrder:6,
    radialIncrement:.05,diagonal:'Z',minimumAngleDeg:10});
  assert.equal(flasherFaceCount(2,2,6),145);
  assert.deepEqual(readTessParams(structuredClone(hex)),hex);
});

test('Flasher reader refuses unsupported paper, invalid counts and unknown options',()=>{
  const preset=tessPreset('flasher');
  for(const invalid of [
    {...preset,paper:{shape:'square',margin:.1}},
    {...preset,rings:5},
    {...preset,heightOrder:5},
    {...preset,radialIncrement:-.001},
    {...preset,rotationalOrder:150},
    {...preset,rings:9,heightOrder:1,rotationalOrder:4},
    {...preset,diagonal:'W'},
    {...preset,rings:1.5},
    {...preset,unknown:true},
  ])assert.equal(readTessParams(invalid),null);
  assert.deepEqual(readFlasherParams({...preset,minimumAngleDeg:90}),
    {...preset,minimumAngleDeg:90});
});

test('extended heightOrder4 and m9 stay legal within the original radial and face budgets',()=>{
  const preset=tessPreset('flasher');
  for(const [patch,faces] of [[{heightOrder:4},193],[{rotationalOrder:9},217]] as const){
    const params={...preset,...patch};
    assert.ok(params.rings*params.heightOrder<=9);
    assert.equal(flasherFaceCount(params.rings,params.heightOrder,params.rotationalOrder),faces);
    assert.ok(faces<=600);
    assert.deepEqual(readFlasherParams(params),params);
    assert.deepEqual(readTessParams(params),params);
  }
  assert.equal(flasherFaceCount(9,1,4),721);
  assert.equal(readFlasherParams({...preset,rings:9,heightOrder:1,rotationalOrder:4}),null);
});
