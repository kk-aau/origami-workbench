import {test} from 'node:test';
import assert from 'node:assert/strict';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import type {FoldGraph} from '../../src/core/types';
import {orientPrimalDualFaceupGeometry,primalDualFaceupRoot,primalDualFaceupSatisfied,primalDualLocalFaceOrdering} from '../../src/app/primalDualFaceup';

const fold=(assignment:'M'|'V'):FoldGraph=>({
 vertices_coords:[[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]],
 edges_vertices:[[0,1],[1,2],[2,5],[5,4],[4,3],[3,0],[1,4]],
 edges_assignment:['B','B','B','B','B','B',assignment],
 edges_foldAngle:[0,0,0,0,0,0,assignment==='M'?-180:180],
 faces_vertices:[[0,1,4,3],[1,2,5,4]],
});

test('FaceupFace propagates signed material parity and local M/V relation, without a global top-face condition',()=>{
 for(const assignment of ['M','V'] as const)for(const seed of [1,2,-1,-2]){
  const graph=fold(assignment),{colors,aboveToBelow}=primalDualLocalFaceOrdering(graph,seed);
  assert.equal(colors[Math.abs(seed)-1],Math.sign(seed));
  assert.equal(aboveToBelow.length,1);
  const root=primalDualFaceupRoot(graph,seed),geometry=computeFlatGeometry(graph,1e-6,{startingFace:root});
  const result=recomputeFlatLayers(geometry);
  assert.equal(result.layers.status,'solved');
  assert.equal(primalDualFaceupSatisfied(result,graph,seed),true);
  assert.equal(primalDualFaceupSatisfied(result,graph,-seed),false);
 }
});

test('FaceupFace rejects invalid seed, missing M/V and a non-bipartite face adjacency graph',()=>{
 const graph=fold('M');
 for(const seed of [0,3,-3,1.5])assert.throws(()=>primalDualLocalFaceOrdering(graph,seed));
 graph.edges_assignment[6]='F';
 assert.throws(()=>primalDualLocalFaceOrdering(graph,1),/山谷/);
});

test('one uncreased face can be displayed material-back-up for negative FaceupFace',()=>{
 const graph:FoldGraph={vertices_coords:[[0,0],[2,0],[2,1],[0,1]],
  edges_vertices:[[0,1],[1,2],[2,3],[3,0]],edges_assignment:['B','B','B','B'],
  edges_foldAngle:[0,0,0,0],faces_vertices:[[0,1,2,3]]};
 const root=primalDualFaceupRoot(graph,-1);
 const geometry=orientPrimalDualFaceupGeometry(computeFlatGeometry(graph,1e-6,{startingFace:root}),-1);
 const solved=recomputeFlatLayers(geometry);
 assert.equal(solved.layers.status,'solved');
 assert.equal(primalDualFaceupSatisfied(solved,graph,-1),true);
 assert.equal(primalDualFaceupSatisfied(solved,graph,1),false);
});
