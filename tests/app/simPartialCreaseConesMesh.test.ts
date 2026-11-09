import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildDiagramFold,distance,pointOnSegment,polygonArea} from '../../src/core/geometry';
import type {Point} from '../../src/core/types';
import {buildPartialCreaseConesMesh} from '../../src/engine/simPartialCreaseConeMesh';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {planSimulationStepCone} from '../../src/engine/simStepCone';
import type {SimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {fixture} from '../fixtures/diagramPartialCrease';

function network(){const f=fixture('network');return {source:buildDiagramFold(f.project.states[1].doc).graph,routes:f.project.steps[0].foldLink!.precreases!};}

test('four cones share one conforming material mesh while preserving every CP segment',()=>{
  const {source,routes}=network(),saved=structuredClone(source),mesh=buildPartialCreaseConesMesh(source,routes,{rayCount:8}),{prepared}=prepareSimulationDocument(mesh.fold),points=mesh.materialCoordinates;
  assert.deepEqual(source,saved);assert.deepEqual(points.slice(0,source.vertices_coords.length),source.vertices_coords);
  assert.equal(mesh.cones.length,4);assert.ok(prepared.vertexCount<1200&&prepared.faceCount<2400);
  assert.equal(prepared.sourceFaceCount,1);assert.deepEqual(new Set(prepared.triangleSourceFaces),new Set([0]));
  assert.equal(mesh.fold.zhezhi_partial_crease_cone,undefined);assert.deepEqual(mesh.fold.zhezhi_partial_crease_cones,mesh.cones);
  assert.ok(Math.abs(mesh.fold.faces_vertices!.reduce((sum,t)=>sum+Math.abs(polygonArea(t.map(v=>points[v]))),0)-10000)<1e-6);
  source.edges_vertices.forEach(([a,b],e)=>{const total=mesh.fold.edges_vertices.reduce((sum,[u,v],i)=>sum+(mesh.edgeSourceEdges[i]===e?distance(points[u],points[v]):0),0);assert.ok(Math.abs(total-distance(source.vertices_coords[a],source.vertices_coords[b]))<1e-6);});
  for(const cone of mesh.cones){
    assert.equal(cone.rays.length,8);assert.equal(cone.vertexSectors.length,prepared.vertexCount);assert.equal(cone.triangleSectors.length,prepared.faceCount);assert.equal(cone.vertexSectors[cone.apexVertex].length,8);
    const apex=points[cone.apexVertex];
    prepared.facesVertices.forEach((t,f)=>{
      const s=cone.triangleSectors[f],a=cone.rays[s].direction,b=cone.rays[(s+1)%8].direction;
      t.forEach(v=>{const x=points[v][0]-apex[0],y=points[v][1]-apex[1];assert.ok(a[0]*y-a[1]*x>=-1e-5);assert.ok(x*b[1]-y*b[0]>=-1e-5);assert.ok(cone.vertexSectors[v].includes(s));});
    });
  }
  prepared.edgesVertices.forEach(([a,b],e)=>{
    const pending=routes.some(route=>[a,b].every(v=>pointOnSegment(points[v],route,1e-6))),owners=prepared.edgesFaces[e];
    const seam=owners.length===2&&mesh.cones.some(c=>c.triangleSectors[owners[0]]!==c.triangleSectors[owners[1]]);
    assert.equal(mesh.bendingStiffness[e],pending||prepared.edgesAssignment[e]==='B'||!seam?1:.15);
  });
});

test('each cone validates exact shared vertices on the common mesh through a small reversible rotation loop',()=>{
  const {source,routes}=network(),mesh=buildPartialCreaseConesMesh(source,routes,{rayCount:8}),{prepared}=prepareSimulationDocument(mesh.fold),model=new OrigamiModel(prepared),points=mesh.materialCoordinates;
  const fixed=prepared.facesVertices.map(t=>({t,d:distance([t.reduce((s,v)=>s+points[v][0],0)/3,t.reduce((s,v)=>s+points[v][1],0)/3],[50,50])})).sort((a,b)=>a.d-b.d)[0].t;
  mesh.cones.forEach((cone,c)=>{
    const animation:SimulationStepAnimation={version:1,sourceSignature:'shared-cones-test',initialPositions:Array.from(model.originalPositions),fixedVertices:[...fixed],flexRequest:{version:1,bendingStiffness:mesh.bendingStiffness},ranges:prepared.creaseParams.map(p=>{
      const [a,b]=prepared.edgesVertices[p.edge],active=[a,b].every(v=>pointOnSegment(points[v],routes[c],1e-6));
      return {edge:p.edge,fromAngle:0,toAngle:0,...(active?{viaAngle:180}:{})};
    })};
    const motion=planSimulationStepCone(prepared,animation,cone,{peakAngle:1,steps:32,maxTimeMs:5000});
    assert.ok(motion.maxEdgeStrain<2e-4);assert.ok(motion.maxAreaStrain<8e-4);assert.deepEqual(motion.keyframes[0].positions,motion.keyframes.at(-1)!.positions);
  });
});

test('the common constructor also supports one cone without changing material identities',()=>{
  const {source,routes}=network(),mesh=buildPartialCreaseConesMesh(source,routes.slice(0,1),{rayCount:8}),{prepared}=prepareSimulationDocument(mesh.fold);
  assert.equal(mesh.cones.length,1);assert.equal(prepared.sourceFaceCount,1);assert.equal(mesh.cones[0].triangleSectors.length,prepared.faceCount);
  assert.throws(()=>buildPartialCreaseConesMesh(source,[]),/一到四条/);
});
