import test from 'node:test';
import assert from 'node:assert/strict';
import {flatRoundoffRecovery} from '../../src/core/flatRoundoffRecovery';
import type {FlatFoldResult,Point} from '../../src/core/types';

function model(vertices:Point[]):FlatFoldResult {
  const faces=[[0,1,2,3]];
  return {geometry:{status:'ready',message:'',vertices,faces,graph:{vertices_coords:vertices,
    faces_vertices:faces,edges_vertices:[[0,1],[1,2],[2,3],[3,0]],edges_assignment:['B','B','B','B'],edges_foldAngle:[0,0,0,0]}},
    layers:{status:'no-solution',message:''},warnings:[]};
}

test('roundoff recovery uses one bounded geometry for solver and renderer while retaining material identities',()=>{
  const input=model([[0,0],[1,0],[1,1+1e-12],[0,1]]),before=structuredClone(input);
  const result=flatRoundoffRecovery(input,4e-6)!;
  assert.ok(result);
  assert.equal(result.layers.status,'unknown');
  assert.equal(result.geometry.graph!.vertices_coords,result.geometry.vertices);
  assert.deepEqual(result.geometry.vertices,[[0,0],[1,0],[1,1],[0,1]]);
  assert.equal(result.geometry.faces,input.geometry.faces);
  assert.equal(result.geometry.graph!.edges_vertices,input.geometry.graph!.edges_vertices);
  assert.equal(result.warnings.length,1);
  assert.deepEqual(input,before);
});

test('roundoff recovery refuses to collapse distinct material corners or flip a face',()=>{
  const smallCorner=model([[0,0],[1e-10,0],[1,1],[0,1]]);
  assert.equal(flatRoundoffRecovery(smallCorner,4e-6),null);
  const thin=model([[0,0],[1,0],[1,1e-10],[0,1e-10]]);
  assert.equal(flatRoundoffRecovery(thin,4e-6),null);
});

test('unchanged geometry and invalid precision do not trigger repeat recovery',()=>{
  const input=model([[0,0],[1,0],[1,1],[0,1]]);
  assert.equal(flatRoundoffRecovery(input,4e-6),null);
  assert.equal(flatRoundoffRecovery(input,0),null);
  assert.equal(flatRoundoffRecovery(input,NaN),null);
});
