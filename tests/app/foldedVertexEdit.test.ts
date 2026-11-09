import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveFoldedVertices, selectFoldedVertex } from '../../src/app/foldedVertexEdit';
import type { FlatFoldResult, Point } from '../../src/core/types';
import { flatPresentation } from '../../src/app/flatPresentation';

const points:Point[]=[[0,0],[0,0],[0,0],[10,0],[0,10]];
const empty={group:[],selected:[]};
function result():FlatFoldResult{return {geometry:{status:'ready',message:'',vertices:structuredClone(points),faces:[[0,3,4],[1,4,3]],graph:{vertices_coords:structuredClone(points),edges_vertices:[[0,3],[3,4],[4,0]],edges_assignment:['B','B','B'],edges_foldAngle:[0,0,0],faceOrders:[[0,1,1]]}},layers:{status:'solved',message:'',faceOrder:[0,1],faceOrders:[[0,1,1]],solutionCount:1},warnings:[]};}

test('first folded click marks coincident group but selects only the clicked vertex',()=>{
  const before=structuredClone(points),selection=selectFoldedVertex(points,empty,1,'folded');
  assert.deepEqual(selection,{group:[0,1,2],selected:[1]});assert.deepEqual(points,before);assert.deepEqual(empty,{group:[],selected:[]});
});
test('unfolded points toggle individual members; folded click retains the chosen subset',()=>{
  let selection=selectFoldedVertex(points,empty,0,'unfolded');
  selection=selectFoldedVertex(points,selection,2,'unfolded');assert.deepEqual(selection.selected,[0,2]);
  assert.equal(selectFoldedVertex(points,selection,1,'folded'),selection);
  selection=selectFoldedVertex(points,selection,0,'unfolded');selection=selectFoldedVertex(points,selection,2,'unfolded');
  assert.deepEqual(selection.selected,[]);assert.deepEqual(selectFoldedVertex(points,selection,1,'folded').selected,[1]);
});
test('clicking another folded location replaces the group with fixed original tolerance',()=>{
  const selection=selectFoldedVertex(points,selectFoldedVertex(points,empty,1,'folded'),3,'folded');
  assert.deepEqual(selection,{group:[3],selected:[3]});
  assert.deepEqual(selectFoldedVertex([[0,0],[.5e-7,0],[2e-7,0]],empty,0,'folded').group,[0,1]);
});
test('moving selected members changes result geometry only and invalidates every old layer result',()=>{
  const original=result(),before=structuredClone(original);
  const next=moveFoldedVertices(original,{group:[0,1,2],selected:[0,2]},[2,3]);
  assert.deepEqual(next.geometry.vertices,[[2,3],[0,0],[2,3],[10,0],[0,10]]);
  assert.deepEqual(next.geometry.graph?.vertices_coords,next.geometry.vertices);assert.equal(next.geometry.graph?.faceOrders,undefined);
  assert.equal(next.geometry.modified,true);assert.equal(next.layers.status,'unknown');assert.equal(next.layers.faceOrder,undefined);assert.equal(next.layers.solutionCount,undefined);
  assert.equal(flatPresentation(next,'front').hasOrder,false);assert.match(next.geometry.message,/不代表/);assert.deepEqual(original,before);
});
test('empty and unchanged moves are identity; repeated edits do not duplicate warnings',()=>{
  const original=result();assert.equal(moveFoldedVertices(original,empty,[1,1]),original);
  assert.equal(moveFoldedVertices(original,{group:[0],selected:[0]},[0,0]),original);
  const first=moveFoldedVertices(original,{group:[0],selected:[0]},[1,1]);
  assert.equal(moveFoldedVertices(first,{group:[0],selected:[0]},[2,2]).warnings.length,1);
});
test('invalid vertices, selections and destinations reject atomically',()=>{
  const original=result(),before=structuredClone(original);
  for(const selected of [[-1],[99],[.5],[0,0]])assert.throws(()=>moveFoldedVertices(original,{group:[0,1,2],selected},[1,1]));
  assert.throws(()=>moveFoldedVertices(original,{group:[],selected:[0]},[1,1]));
  assert.throws(()=>moveFoldedVertices(original,{group:[0],selected:[0]},[Infinity,1]));
  assert.throws(()=>moveFoldedVertices({...original,geometry:{...original.geometry,status:'invalid'}},empty,[1,1]));
  assert.deepEqual(original,before);
});
