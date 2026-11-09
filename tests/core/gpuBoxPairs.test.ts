import test from 'node:test';
import assert from 'node:assert/strict';
import {createGpuBoxPairFilter,encodeGpuBounds,outwardGpuFloat,type GpuBounds} from '../../src/core/gpuBoxPairs';

test('GPU bounds expand every finite representable coordinate, including signed zero and flushed subnormals',()=>{
 const values=[0,-0,Number.MIN_VALUE,-Number.MIN_VALUE,2**-150,-(2**-150),2**-126,-(2**-126),1e-9,-1e-9,1,-1,1+2**-24,1-2**-25,123456.789,-123456.789,1e6,-1e6];
 let seed=1234567;for(let i=0;i<10000;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;values.push((seed/2**32-.5)*2**(i%250-125));}
 for(const value of values){
  const lo=outwardGpuFloat(value,-1),hi=outwardGpuFloat(value,1);
  assert.ok(lo<=value,`${lo} <= ${value}`);assert.ok(hi>=value,`${hi} >= ${value}`);
  for(const v of [lo,hi])assert.ok(v===0||Math.abs(v)>=2**-126,'encoded bounds never depend on subnormal shader preservation');
 }
});

test('outward upload cannot reject a strict positive-area overlap at a float rounding boundary',()=>{
 const fixtures:GpuBounds[][]=[
  [[1,1,1+1e-10,1+1e-10],[1+5e-11,1+5e-11,1+2e-10,1+2e-10]],
  [[-1e-45,-1e-45,1e-45,1e-45],[0,0,1e-44,1e-44]],
  [[999999,999999,999999+1e-7,999999+1e-7],[999999+5e-8,999999+5e-8,1000000,1000000]],
 ];
 for(const boxes of fixtures){const encoded=encodeGpuBounds(boxes)!;assert.ok(encoded);assert.ok(encoded[0]<=encoded[6]&&encoded[4]<=encoded[2]&&encoded[1]<=encoded[7]&&encoded[5]<=encoded[3]);}
});

test('invalid source structures are never hidden as unsupported GPU hardware',()=>{
 for(const boxes of [[[1,0,0,1]],[[0,NaN,1,2]],[[0,0,1]],[[0,0,Infinity,1]]] as unknown as GpuBounds[][])assert.throws(()=>createGpuBoxPairFilter(boxes),TypeError);
 assert.equal(encodeGpuBounds([[0,0,Number.MAX_VALUE,1]]),null);
 assert.equal(createGpuBoxPairFilter([[0,0,1,1],[0,0,1,1]]),null,'Node has no OffscreenCanvas; callers retain the complete CPU path');
});
