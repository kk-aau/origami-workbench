import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readTessParams,tessPreset} from '../../src/app/tessellation';

const segment={line:0,from:[1,-.25],to:[.25,-.25],inset:.044};

test('per-segment woven inset stamps survive project serialization',()=>{
  const preset=tessPreset('woven-lines');
  assert.equal(preset.family,'woven-lines');
  const params=readTessParams({...preset,segmentInsets:[segment]});
  assert.ok(params&&params.family==='woven-lines');
  assert.deepEqual(params.segmentInsets,[segment]);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
});

test('per-segment woven inset rejects malformed geometry references',()=>{
  const preset=tessPreset('woven-lines');
  for(const item of [
    {...segment,line:-1},{...segment,line:1.5},{...segment,inset:0},
    {...segment,inset:1.1},{...segment,from:segment.to},
    {...segment,to:[Infinity,0]},{...segment,extra:1},
  ])assert.equal(readTessParams({...preset,segmentInsets:[item]}),null,JSON.stringify(item));
});
