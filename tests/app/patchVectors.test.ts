import {test} from 'node:test';
import assert from 'node:assert/strict';
import {patchVector,patchVectors} from '../../src/app/patchVectors';

const patch:[number,number][][]=[
  [[0,0],[1,0],[1,1],[0,1]],
  [[1,0],[2,0],[2,1],[1,1]],
];

test('Origamica one-based PatchVector and shared-anchor PatchVectors example',()=>{
  assert.deepEqual(patchVector(patch,[1,1],[2,2]),[2,0]);
  assert.deepEqual(patchVectors(patch,[1,1],[2,2],[1,4]),[[2,0],[0,1]]);
});

test('invalid references, collinear vectors and non-finite vertices cannot set a lattice',()=>{
  for(const ref of [[0,1],[3,1],[1,5],[1.5,1]] as [number,number][])
    assert.throws(()=>patchVector(patch,ref,[1,1]));
  assert.throws(()=>patchVectors(patch,[1,1],[1,2],[2,1]));
  assert.throws(()=>patchVector([[[NaN,0],[1,0],[0,1]]],[1,1],[1,2]));
});
