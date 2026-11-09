import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildConcaveLayerPartition,solveConcaveLayerOrders} from '../../src/core/concaveLayers';
import {polygonArea} from '../../src/core/geometry';
import {resolvedLayerTriangles} from '../../src/core/triangleLayerConstraints';
import type {FoldGraph,Point} from '../../src/core/types';

const fixture=JSON.parse(readFileSync('tests/fixtures/dragon-concave-notch.json','utf8'));
function sheet(points:Point[]):FoldGraph {
 const face=points.map((_,i)=>i);
 return {vertices_coords:points,faces_vertices:[face],edges_vertices:face.map((v,i)=>[v,(i+1)%face.length]),edges_assignment:face.map(()=>'B'),edges_foldAngle:face.map(()=>0)};
}

test('dragon notch on an ear diagonal preserves all six source corners and four resolved triangles',()=>{
 for(const reverse of [false,true])for(const mirrored of [false,true]){
  let points:Point[]=fixture.points.map(([x,y]:Point)=>[mirrored?-x:x,y]);
  if(reverse)points.reverse();
  const graph=sheet(points),before=structuredClone(graph),p=buildConcaveLayerPartition(graph,fixture.epsilon),tri=p.graph;
  assert.deepEqual(graph,before);
  assert.deepEqual(tri.vertices_coords,points);
  assert.equal(p.privateVertices.length,0);
  assert.equal(tri.faces_vertices.length,4);
  assert.ok(resolvedLayerTriangles(tri.vertices_coords,tri.faces_vertices,fixture.epsilon));
  const area=polygonArea(points),areas=tri.faces_vertices.map(t=>polygonArea(t.map(v=>points[v])));
  assert.ok(areas.every(a=>a*area>0));
  assert.ok(Math.abs(areas.reduce((a,b)=>a+b,0)-area)<1e-12);
  for(let e=0;e<6;e++){
   assert.deepEqual(tri.edges_vertices[e],graph.edges_vertices[e]);
   assert.equal(tri.edges_faces[e].length,1);
   assert.equal(p.parent[tri.edges_faces[e][0]],0);
  }
  const solved=solveConcaveLayerOrders(graph,fixture.epsilon);
  assert.equal(solved.status,'complete','message'in solved?solved.message:'');
  if(solved.status==='complete'){assert.equal(solved.count,1n);assert.deepEqual(solved.orders,[]);}
 }
});

test('a truly unresolved thin face is still refused',()=>{
 assert.equal(solveConcaveLayerOrders(sheet([[0,0],[100,0],[100,1e-9]]),1e-6).status,'unsupported');
});
