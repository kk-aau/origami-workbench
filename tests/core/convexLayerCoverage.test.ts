import {test} from 'node:test';import assert from 'node:assert/strict';
import {solveConvexLayerCandidate} from '../../src/core/convexLayerCandidate';
import {buildExactModelTopology,walkExactCoverage} from '../../src/app/modelExactTopology';
import type {RegionCoverage} from '../../src/core/regionTournament';
import type {FlatFoldResult,FoldGraph,Point} from '../../src/core/types';

const rect=(x:number,y:number,w:number,h:number):Point[]=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
function graphFrom(polygons:Point[][]):FoldGraph{
  const vertices_coords:Point[]=[],edges_vertices:[number,number][]=[],faces_vertices:number[][]=[],faces_edges:number[][]=[],edges_faces:number[][]=[];
  for(const polygon of polygons){const start=vertices_coords.length,firstEdge=edges_vertices.length,face=faces_vertices.length;vertices_coords.push(...polygon);faces_vertices.push(polygon.map((_,i)=>start+i));faces_edges.push(polygon.map((_,i)=>firstEdge+i));polygon.forEach((_,i)=>{edges_vertices.push([start+i,start+(i+1)%polygon.length]);edges_faces.push([face]);});}
  return {vertices_coords,edges_vertices,faces_vertices,faces_edges,edges_faces,edges_assignment:edges_vertices.map(()=>'B'),edges_foldAngle:edges_vertices.map(()=>0)};
}
function exact(graph:FoldGraph){
  const source:FlatFoldResult={geometry:{status:'ready',message:'',vertices:graph.vertices_coords,faces:graph.faces_vertices!,graph},layers:{status:'unknown',message:''},warnings:[]};
  const topology=buildExactModelTopology(source),coverage:RegionCoverage={faceCount:topology.faceCount,cellCount:topology.cellCount,walk:visitor=>walkExactCoverage(topology,visitor)};
  return {topology,coverage};
}

test('true sub-tolerance overlap registers a missing pair and certifies all exact cells',()=>{
  const graph=graphFrom([rect(0,0,1,1),rect(1-1e-10,.2,1,.4)]),before=structuredClone(graph),legacy=solveConvexLayerCandidate(graph,1e-6);
  assert.ok(legacy);assert.equal(legacy.orders.length,0,'old tolerance did not register this positive overlap');
  const {coverage}=exact(graph),answer=solveConvexLayerCandidate(graph,1e-6,{coverage});
  assert.ok(answer?.coverageCertificate);assert.equal(answer.orders.length,1);assert.equal(answer.coverageCertificate.verifiedCells,coverage.cellCount);
  let shared=0;coverage.walk({onCell:(cell,faces)=>{const proof=answer.coverageCertificate!;assert.equal(proof.depth[cell],faces.size);if(faces.size){assert.ok(faces.has(proof.top[cell]));assert.ok(faces.has(proof.bottom[cell]));}if(faces.size===2)shared++;}});
  assert.ok(shared);assert.deepEqual(graph,before);
});

test('exact-region cycles add necessary transitivity and never discard forced user relations',()=>{
  const polygon=rect(0,0,1e-10,1e-10),graph=graphFrom([polygon,polygon,polygon]),{coverage}=exact(graph),progress:{stage:string;details:Record<string,number>}[]=[];
  const fixedOrders:[number,number,number][]=[[0,1,-1],[1,2,-1],[0,2,1]];
  assert.ok(solveConvexLayerCandidate(graph,1e-6,{fixedOrders}),'legacy tolerance alone misses the common micro-region');
  const answer=solveConvexLayerCandidate(graph,1e-6,{coverage,fixedOrders,onProgress:(stage,details)=>progress.push({stage,details})});
  assert.equal(answer,null);assert.ok(progress.some(p=>p.stage==='coverage-constraints'&&p.details.added>0));
  const valid=solveConvexLayerCandidate(graph,1e-6,{coverage,fixedOrders:fixedOrders.slice(0,2)});
  assert.ok(valid?.coverageCertificate);assert.deepEqual([...valid.coverageCertificate.top],[2]);assert.deepEqual([...valid.coverageCertificate.bottom],[0]);
});

test('fixed comparisons preserve winding and reversed pair direction and reject contradictions',()=>{
  const graph=graphFrom([rect(0,0,2,2),rect(0,0,2,2).reverse()]),{coverage}=exact(graph);
  const answer=solveConvexLayerCandidate(graph,1e-6,{coverage,fixedOrders:[[1,0,1]]});
  assert.ok(answer?.coverageCertificate);assert.deepEqual([...answer.coverageCertificate.top],[1]);assert.deepEqual(answer.orders,[[0,1,1]]);
  assert.equal(solveConvexLayerCandidate(graph,1e-6,{coverage,fixedOrders:[[1,0,1],[1,0,-1]]}),null);
  assert.throws(()=>solveConvexLayerCandidate(graph,1e-6,{fixedOrders:[[0,0,1]]}),/关系无效/);
  assert.throws(()=>solveConvexLayerCandidate(graph,1e-6,{coverage:{...coverage,faceCount:3}}),/编号不一致/);
});

test('original Dragon micro-overlap receives a complete exact-cell paper certificate',()=>{
  const polygons:Point[][]=[
    [[-78.12499999651135,-112.49999999850436],[-76.24999999865588,-112.49999999886562],[-76.56249999836604,-110.93749999879482],[-77.08333333156659,-110.41666666535761],[-79.16666667777758,-110.41666665624686]],
    [[-79.16666632722865,-112.4999999553414],[-77.08333307661016,-116.66666666334095],[-76.04166639267135,-115.6250000171566],[-76.562499398721,-113.02083319005501],[-77.0833326885647,-112.4999998171225]],
  ];
  const graph=graphFrom(polygons),{coverage,topology}=exact(graph),answer=solveConvexLayerCandidate(graph,4e-6,{coverage});
  assert.ok(answer?.coverageCertificate);assert.equal(answer.coverageCertificate.verifiedCells,topology.cellCount);
  let sharedArea=0;coverage.walk({onCell:(cell,faces)=>{assert.equal(answer.coverageCertificate!.depth[cell],faces.size);if(faces.size===2)sharedArea+=topology.cellArea[cell];}});
  assert.ok(Math.abs(sharedArea-1.5304956478906452e-7)<1e-20);assert.ok(answer.orders.some(([a,b])=>a===0&&b===1));
});
