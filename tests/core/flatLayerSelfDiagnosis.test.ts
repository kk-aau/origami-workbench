import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {FlatFoldResult,Point} from '../../src/core/types';
import {diagnoseFlatLayerCoverage} from '../../src/core/flatLayerSelfDiagnosis';
import {solveConvexLayerCandidate} from '../../src/core/convexLayerCandidate';
import {flatExactProof} from '../../src/app/flatExactProof';
import {flatFoldPublication} from '../../src/app/flatFoldPublication';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {singleMountainFold} from '../fixtures/layerBoundaryCases';
import {buildExactModelTopology} from '../../src/app/modelExactTopology';

function model(rings:Point[][],orders:[number,number,number][]=[]):FlatFoldResult{
 const vertices:Point[]=[],faces=rings.map(ring=>ring.map(p=>vertices.push(p)-1));
 const edges=faces.flatMap(face=>face.map((v,i)=>[v,face[(i+1)%face.length]] as [number,number]));
 return {geometry:{status:'ready',message:'原几何',vertices,faces,graph:{vertices_coords:vertices,faces_vertices:faces,edges_vertices:edges,edges_assignment:edges.map(()=>'B'),edges_foldAngle:edges.map(()=>0)}},
  layers:{status:'solved',message:'原约束提示',faceOrders:orders,solutionCount:8,solutionCountExact:'8',solutionIndex:2},warnings:[]};
}
const square:Point[]=[[0,0],[1,0],[1,1],[0,1]];

test('coverage completion uses material contours while preserving zero-angle drawing marks',()=>{
 const thin:Point[]=[[1-1e-11,0],[2,0],[2,1],[1-1e-11,1]],input=model([square,square,thin]);
 const graph=input.geometry.graph!;
 const first=graph.vertices_coords.length;
 graph.vertices_coords.push([.2,.3],[.7,.3]);
 graph.edges_vertices.push([first,first+1]);graph.edges_assignment.push('F');graph.edges_foldAngle.push(0);
 graph.zhezhi_flatCreases='marks';
 const before=structuredClone(input.geometry);
 const result=recomputeFlatLayers(input);
 assert.equal(result.layers.status,'solved',result.layers.message);
 assert.equal(result.layers.selfDiagnosis?.status,'completed');
 assert.ok(result.layers.selfDiagnosis!.missingPairs>0);
 assert.deepEqual(result.geometry,before);
 assert.ok(flatExactProof(result));
 assert.equal(flatFoldPublication(result).surface?.status,'complete');
});

test('tiny overlaps are completed once with known relations and geometry unchanged, then published on both sides',()=>{
 const thin:Point[]=[[1-1e-11,0],[2,0],[2,1],[1-1e-11,1]],result=model([square,square,thin],[[0,1,1]]),before=structuredClone(result.geometry);
 result.layers.relativeConstraints=[{above:0,below:1}];let calls=0;
 diagnoseFlatLayerCoverage(result,options=>{calls++;return solveConvexLayerCandidate(result.geometry.graph!,1e-6,options);});
 assert.equal(result.layers.status,'solved',result.layers.message);assert.equal(result.layers.selfDiagnosis?.status,'completed');assert.equal(result.layers.selfDiagnosis?.missingPairs,2);
 assert.deepEqual(result.geometry,before);assert.ok(result.layers.faceOrders!.some(row=>row.join() === '0,1,1'));assert.deepEqual(result.layers.relativeConstraints,[{above:0,below:1}]);
 assert.equal(result.layers.solutionCount,undefined);assert.equal(result.layers.solutionCountExact,undefined);assert.equal(result.layers.solutionIndex,2);assert.match(result.layers.message,/原约束提示/);
 diagnoseFlatLayerCoverage(result,()=>{throw Error('must reuse proof');});assert.equal(calls,1);
 const publication=flatFoldPublication(result);assert.equal(publication.surface?.status,'complete');assert.ok(publication.surface?.status==='complete'&&publication.surface.opposite?.exact);
});

test('a complete local cycle is diagnosed without searching a replacement or claiming global no-solution',()=>{
 const result=model([square,square,square],[[0,1,1],[1,2,1],[0,2,-1]]),before=structuredClone(result.layers.faceOrders);
 diagnoseFlatLayerCoverage(result,()=>{throw Error('must not search');});
 assert.equal(result.layers.status,'error');assert.equal(result.layers.selfDiagnosis?.status,'conflict');assert.match(result.layers.message,/循环/);assert.deepEqual(result.layers.faceOrders,before);assert.equal(flatExactProof(result),undefined);
});

test('a candidate that cannot extend stays rejected without erasing relations',()=>{
 const result=model([square,square,square,square],[[0,1,1],[1,2,1],[0,2,-1]]),before=structuredClone(result.layers.faceOrders);
 diagnoseFlatLayerCoverage(result,options=>solveConvexLayerCandidate(result.geometry.graph!,1e-6,options));
 assert.equal(result.layers.status,'error');assert.equal(result.layers.selfDiagnosis?.status,'conflict');assert.equal(result.layers.selfDiagnosis?.missingPairs,3);assert.deepEqual(result.layers.faceOrders,before);assert.match(result.layers.message,/不等于原折痕图无解/);
});

test('malformed geometry and a candidate changing old relations cannot masquerade as completion',()=>{
 const bad=model([[[0,0],[1,0],[2,0]]]);diagnoseFlatLayerCoverage(bad,()=>null);assert.equal(bad.layers.selfDiagnosis?.status,'error');assert.equal(flatExactProof(bad),undefined);
 const changed=model([square,square,square],[[0,1,1]]);diagnoseFlatLayerCoverage(changed,()=>({orders:[[0,1,-1],[0,2,1],[1,2,1]]}));assert.equal(changed.layers.status,'error');assert.match(changed.layers.message,/改变或丢失/);assert.deepEqual(changed.layers.faceOrders,[[0,1,1]]);
});

test('visible-face constraints are retained when completion is incompatible',()=>{
 const result=model([square,square]);result.layers.constraints=[{face:1,side:'white'}];
 diagnoseFlatLayerCoverage(result,()=>({orders:[[0,1,1]],faceOrder:[1,0]}));
 assert.equal(result.layers.selfDiagnosis?.status,'conflict');assert.match(result.layers.message,/可见纸面/);assert.deepEqual(result.layers.constraints,[{face:1,side:'white'}]);
});

test('ordinary folds retain counts and get full proof on initial and repeated solving',()=>{
 const doc=singleMountainFold(100),before=structuredClone(doc),first=computeFlatFold(doc);
 for(const result of [first,recomputeFlatLayers(first)]){
  assert.equal(result.layers.status,'solved',result.layers.message);assert.equal(result.layers.selfDiagnosis?.status,'verified');assert.equal(result.layers.solutionCountExact,'1');assert.ok(flatExactProof(result));
 }
 assert.deepEqual(doc,before);
});

test('exact self-check accepts retraced internal banks, preserves tiny holes, and rejects a zero-area bow tie',()=>{
 const bank=model([square]);bank.geometry.vertices.push([.2,.2],[.8,.8]);bank.geometry.graph!.faces_holes=[[[4,5]]];
 const before=structuredClone(bank.geometry);diagnoseFlatLayerCoverage(bank,()=>{throw Error('no missing relations');});
 assert.equal(bank.layers.status,'solved',bank.layers.message);assert.deepEqual(bank.geometry,before);assert.equal(flatFoldPublication(bank).surface?.status,'complete');
 const tiny=model([square]);tiny.geometry.vertices.push([.4,.4],[.4+1e-12,.4],[.4+1e-12,.4+1e-12],[.4,.4+1e-12]);tiny.geometry.graph!.faces_holes=[[[4,5,6,7]]];
 const topology=buildExactModelTopology(tiny);assert.equal(topology.ringIsHole[1],1);assert.ok(topology.cellArea.some(area=>area>0&&area<1e-20));
 const crossing=model([square]);crossing.geometry.vertices.push([.2,.2],[.8,.8],[.2,.8],[.8,.2]);crossing.geometry.graph!.faces_holes=[[[4,5,6,7]]];
 assert.throws(()=>buildExactModelTopology(crossing),/零面积纸面环/);
});
