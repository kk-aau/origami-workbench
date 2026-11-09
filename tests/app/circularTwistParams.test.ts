import {test} from 'node:test';
import assert from 'node:assert/strict';
import {changeTessParams,readTessParams,tessPreset} from '../../src/app/tessellation';
import {unitRegularCircularTwist} from '../../src/app/circularTwistOriginal';

test('original circular twist parameters round-trip and preserve the circular paper contract',()=>{
  const preset=tessPreset('circular-twist');
  assert.equal(preset.family,'circular-twist');
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(preset))),preset);
  const changed=changeTessParams(preset,{radius:2.5,circleDivisions:24,stationaryFace:4});
  assert.equal(changed.family,'circular-twist');
  assert.deepEqual(readTessParams(changed),changed);
  assert.equal(readTessParams({...changed,paper:{shape:'square',margin:.1}}),null);
  assert.equal(readTessParams({...changed,stationaryFace:8}),null);
});

test('circular twist rejects reversed rays, concave centers and invalid fold assignments',()=>{
  const preset=tessPreset('circular-twist');
  assert.equal(preset.family,'circular-twist');
  assert.equal(readTessParams({...preset,angle:-30}),null);
  assert.equal(readTessParams({...preset,radius:.3}),null);
  assert.equal(readTessParams({...preset,centralTypes:['M','V']}),null);
  assert.equal(readTessParams({...preset,circleDivisions:7}),null);
  assert.equal(readTessParams({...preset,polygon:[[0,0],[1,0],[.2,.2],[1,1],[0,1]],centralTypes:['M','M','M','M','M']}),null);
  const reversed={...preset,polygon:[...preset.polygon].reverse(),angle:-30,centralTypes:[...preset.centralTypes].reverse()};
  assert.deepEqual(readTessParams(reversed),reversed);
});

test('expanded regular polygon domain survives project readback up to 64 sides',()=>{
  for(const sides of [13,16,64]){
    const params={family:'circular-twist',...unitRegularCircularTwist(sides,3),
      angle:30,circleDivisions:64,centralTypes:Array.from({length:sides},()=> 'M'),stationaryFace:2*sides+1};
    assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  }
  const outOfRange=unitRegularCircularTwist(64,3).polygon;
  assert.equal(readTessParams({family:'circular-twist',polygon:[...outOfRange,outOfRange[0]],
    angle:30,radius:40,circleDivisions:64,centralTypes:Array.from({length:65},()=> 'M'),stationaryFace:'auto'}),null);
});
