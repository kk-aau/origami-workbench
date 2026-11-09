import {test} from 'node:test';
import assert from 'node:assert/strict';
import {countOriginalLayerAssignments,solveConcaveLayerOrders,buildConcaveLayerPartition} from '../../src/core/concaveLayers';
import type {FoldGraph,Point} from '../../src/core/types';

function twoSheets():FoldGraph{
 const vertices_coords:Point[]=[[0,0],[4,0],[4,4],[3,4],[3,1],[1,1],[1,4],[0,4],[.5,2],[3.5,2],[3.5,2.5],[.5,2.5]];
 const faces_vertices=[[0,1,2,3,4,5,6,7],[8,9,10,11]],edges_vertices=faces_vertices.flatMap(f=>f.map((v,i)=>[v,f[(i+1)%f.length]] as [number,number]));
 return {vertices_coords,faces_vertices,edges_vertices,edges_assignment:edges_vertices.map(()=>'B'),edges_foldAngle:edges_vertices.map(()=>0)};
}

test('CNF root conflict records a genuinely false clause and its forced assignment',()=>{
 const clauses=[[1],[-1]],answer=countOriginalLayerAssignments(1,clauses);
 assert.equal(answer.status,'complete');if(answer.status!=='complete')return;
 assert.equal(answer.count,0n);assert.equal(answer.conflicts?.length,1);
 const witness=answer.conflicts![0];assert.equal(witness.scope,'root');assert.equal(witness.clause,1);assert.deepEqual(witness.assignments,[1]);
 assert.ok(clauses[witness.clause].every(lit=>!witness.assignments.includes(lit)));
});

test('complete branch exhaustion reports examples, not forced root contradictions',()=>{
 const clauses=[[1,2],[1,-2],[-1,2],[-1,-2]],answer=countOriginalLayerAssignments(2,clauses);
 assert.equal(answer.status,'complete');if(answer.status!=='complete')return;
 assert.equal(answer.count,0n);assert.equal(answer.conflicts?.length,2);
 for(const witness of answer.conflicts!){
  assert.equal(witness.scope,'branch');
  assert.ok(clauses[witness.clause].every(lit=>witness.assignments.includes(-lit)),'each captured clause was false in the actual rejected branch');
 }
});

test('a solved or unfinished CNF run never publishes earlier branch failures as result conflicts',()=>{
 const satisfiable=countOriginalLayerAssignments(2,[[-1,2],[-1,-2],[1,2]]);
 assert.equal(satisfiable.status,'complete');if(satisfiable.status==='complete'){assert.equal(satisfiable.count,1n);assert.equal(satisfiable.conflicts,undefined);}
 const unfinished=countOriginalLayerAssignments(2,[[1,2],[1,-2],[-1,2],[-1,-2]],0n,2);
 assert.equal(unfinished.status,'unknown');assert.ok(!('conflicts'in unfinished));
});

test('concave conflict witnesses retain original paper IDs after private triangulation',()=>{
 const graph=twoSheets(),before=structuredClone(graph),partition=buildConcaveLayerPartition(graph,1e-7);
 assert.ok(partition.graph.faces_vertices.length>graph.faces_vertices!.length);
 const answer=solveConcaveLayerOrders(graph,1e-7,0,[],[{above:0,below:1},{above:1,below:0}]);
 assert.equal(answer.status,'complete');if(answer.status!=='complete')return;
 assert.equal(answer.count,0n);assert.ok(answer.conflicts?.length);
 for(const conflict of answer.conflicts!){
  assert.equal(conflict.kind,'relative-order');assert.equal(conflict.scope,'root');assert.deepEqual(conflict.faces,[0,1]);
  assert.ok(conflict.relations?.every(({above,below})=>above<2&&below<2&&above!==below));
 }
 assert.deepEqual(graph,before);
 const solved=solveConcaveLayerOrders(graph,1e-7);assert.equal(solved.status,'complete');if(solved.status==='complete'){assert.equal(solved.count,2n);assert.equal(solved.conflicts,undefined);}
});

test('contradictory inheritance hints identify the two original faces without claiming a search proof',()=>{
 const answer=solveConcaveLayerOrders(twoSheets(),1e-7,0,[{above:0,below:1},{above:1,below:0}]);
 assert.equal(answer.status,'complete');if(answer.status!=='complete')return;
 assert.equal(answer.count,0n);assert.equal(answer.nodes,0);
 assert.equal(answer.conflicts?.[0].scope,'constraint');assert.deepEqual(answer.conflicts?.[0].faces,[0,1]);assert.match(answer.conflicts![0].message,/继承偏好/);
});
