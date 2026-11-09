import test from 'node:test';
import assert from 'node:assert/strict';
import ear from 'rabbit-ear';
import type {FoldGraph,Point} from '../../src/core/types';
import {buildConcaveLayerPartition,solveConcaveLayerOrders} from '../../src/core/concaveLayers';
import {resolvedLayerTriangles,triangleLayerOverlaps} from '../../src/core/triangleLayerConstraints';
function sheets(points:Point[],two=false):FoldGraph{const vertices=two?[...points,...points.map(p=>[...p] as Point)]:points;return {vertices_coords:vertices,edges_vertices:[[0,1],[1,2],[2,0],...(two?[[3,4],[4,5],[5,3]] as [number,number][]:[])],edges_assignment:Array(two?6:3).fill('B'),edges_foldAngle:Array(two?6:3).fill(0),faces_vertices:[[0,1,2],...(two?[[3,4,5]]:[])]};}
test('small-angle triangle keeps all resolved corners and overlap uses real material area',()=>{
 const g=sheets([[0,0],[100,0],[100,.01]],true),before=structuredClone(g);assert.equal(ear.graph.makeFacesPolygon(g,1e-6)[0].length,2);assert.ok(resolvedLayerTriangles(g.vertices_coords,g.faces_vertices!,1e-6));assert.deepEqual(triangleLayerOverlaps(g,1e-6),[[1],[0]]);const partition=buildConcaveLayerPartition(g,1e-6);assert.equal(partition.privateVertices.length,0);assert.deepEqual(partition.graph.faces_vertices.map(r=>[...r].sort((a,b)=>a-b)),g.faces_vertices!.map(r=>[...r].sort((a,b)=>a-b)));assert.deepEqual(g,before);const answer=solveConcaveLayerOrders(g,1e-6);assert.equal(answer.status,'complete');if(answer.status==='complete')assert.equal(answer.count,2n);
});
test('small-angle actual mountain hinge still enforces a single original-face order',()=>{
 const g:FoldGraph={vertices_coords:[[0,0],[100,0],[100,.01],[100,.01]],edges_vertices:[[0,1],[1,2],[2,0],[0,3],[3,1]],edges_assignment:['M','B','B','B','B'],edges_foldAngle:[-180,0,0,0,0],faces_vertices:[[0,1,2],[1,0,3]]},answer=solveConcaveLayerOrders(g,1e-6);assert.equal(answer.status,'complete');if(answer.status==='complete'){assert.equal(answer.count,1n);assert.equal(answer.orders?.length,1);}
});
test('linear resolution and scale/translation validity remain authoritative',()=>{
 assert.equal(resolvedLayerTriangles([[0,0],[100,0],[100,1e-9]],[[0,1,2]],1e-6),false);assert.equal(solveConcaveLayerOrders(sheets([[0,0],[100,0],[100,1e-9]]),1e-6).status,'unsupported');for(const scale of [.1,1,10])for(const angle of [0,.47,1.45]){const g=sheets([[0,0],[100,0],[100,.01]].map(([x,y])=>[1234+scale*(x*Math.cos(angle)-y*Math.sin(angle)),-987+scale*(x*Math.sin(angle)+y*Math.cos(angle))]),true),a=solveConcaveLayerOrders(g,scale*1e-6);assert.equal(a.status,'complete');if(a.status==='complete')assert.equal(a.count,2n);}
});
