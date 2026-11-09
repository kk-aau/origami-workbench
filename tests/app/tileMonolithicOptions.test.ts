import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LEGACY_MONOLITHIC_OPTIONS,ORIGINAL_MONOLITHIC_OPTIONS,readTileMonolithicOptions} from '../../src/app/tileMonolithicOptions';

test('MonolithicEmbedTiling keeps original and legacy defaults distinct',()=>{
  assert.equal(ORIGINAL_MONOLITHIC_OPTIONS.mergedEdges,'delete');
  assert.equal(ORIGINAL_MONOLITHIC_OPTIONS.collinearCleanup,true);
  assert.equal(LEGACY_MONOLITHIC_OPTIONS.mergedEdges,'auto');
  assert.equal(LEGACY_MONOLITHIC_OPTIONS.collinearCleanup,false);
  assert.deepEqual(readTileMonolithicOptions(ORIGINAL_MONOLITHIC_OPTIONS),ORIGINAL_MONOLITHIC_OPTIONS);
});

test('MonolithicEmbedTiling rejects invalid graph tolerances and fields',()=>{
  for(const bad of [
    {...ORIGINAL_MONOLITHIC_OPTIONS,samePtTolerance:-1},
    {...ORIGINAL_MONOLITHIC_OPTIONS,collinearTolerance:Infinity},
    {...ORIGINAL_MONOLITHIC_OPTIONS,mergedEdges:'merge'},
    {...ORIGINAL_MONOLITHIC_OPTIONS,collinearCleanup:1},
    {...ORIGINAL_MONOLITHIC_OPTIONS,extra:true},
  ])assert.equal(readTileMonolithicOptions(bad),null);
});
