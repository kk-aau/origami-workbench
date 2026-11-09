import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {solveConcaveLayerCandidate} from '../../src/core/concaveLayerCandidate';
import {recomputeFlatLayers} from '../../src/core/flatFold';
import {buildExactModelTopology,walkExactCoverage} from '../../src/app/modelExactTopology';
import {flatExactProof} from '../../src/app/flatExactProof';
import {prepareTessResult,tessConstructionKey} from '../../src/app/tessellation';
import {tessFlatInput} from '../../src/app/tessellationFlat';
import {computeTessFlatGeometry} from '../../src/app/tessellationFlatGeometry';
import type {FlatFoldResult,FoldGraph,Point} from '../../src/core/types';

test('original-face candidate matches enumerated concave solutions and certifies every exact region',()=>{
 const cases=JSON.parse(readFileSync('tests/fixtures/woven-concave-cells-20261001.json','utf8')).cases;
 for(const c of cases){
  const prepared=prepareTessResult(c.response,c.params??c.query),input=computeTessFlatGeometry(tessFlatInput(prepared,prepared.doc,tessConstructionKey(c.params??c.query),true)),before=structuredClone(input);
  const topology=buildExactModelTopology(input),g=input.geometry.graph!,ps=g.vertices_coords,eps=Math.max(1e-6,Math.max(Math.max(...ps.map(p=>p[0]))-Math.min(...ps.map(p=>p[0])),Math.max(...ps.map(p=>p[1]))-Math.min(...ps.map(p=>p[1])))*1e-8);
  const candidate=solveConcaveLayerCandidate(g,eps,{coverage:{faceCount:topology.faceCount,cellCount:topology.cellCount,walk:v=>walkExactCoverage(topology,v)}});
  assert.ok(candidate);assert.equal(candidate.coverageCertificate?.verifiedCells,topology.cellCount);
  assert.ok(candidate.orders.every(([a,b])=>a<g.faces_vertices!.length&&b<g.faces_vertices!.length));
  const actual=new Map(candidate.orders.map(([a,b,s])=>[`${a} ${b}`,s]));
  assert.ok([0,1].some(solutionIndex=>recomputeFlatLayers(input,{solutionIndex}).layers.faceOrders!.every(([a,b,s])=>actual.get(`${a} ${b}`)===s)),c.name);
  assert.deepEqual(input,before);
 }
});

test('large concave reanalysis publishes a complete original-region certificate without claiming a candidate count',()=>{
 const points:Point[]=JSON.parse(readFileSync('tests/fixtures/dragon-concave-notch.json','utf8')).points;
 const g:FoldGraph={vertices_coords:[],faces_vertices:[],edges_vertices:[],edges_assignment:[],edges_foldAngle:[]};
 for(let i=0;i<260;i++){
  const start=g.vertices_coords.length;g.vertices_coords.push(...points.map(([x,y])=>[x+(i%20)*10,y+Math.floor(i/20)*10] as Point));
  const face=points.map((_,k)=>start+k);g.faces_vertices!.push(face);
  face.forEach((v,k)=>{g.edges_vertices.push([v,face[(k+1)%face.length]]);g.edges_assignment.push('B');g.edges_foldAngle.push(0);});
 }
 const input:FlatFoldResult={geometry:{status:'ready',message:'fixture',vertices:g.vertices_coords,faces:g.faces_vertices!,graph:g},layers:{status:'unknown',message:'fixture'},warnings:[]},before=structuredClone(input);
 const result=recomputeFlatLayers(input);
 assert.equal(result.layers.status,'solved',result.layers.message);
 assert.equal(result.layers.solutionIndex,undefined);assert.equal(result.layers.solutionCountExact,undefined);
 const proof=flatExactProof(result);assert.ok(proof);assert.equal(proof.certificate.verifiedCells,proof.topology.cellCount);
 assert.deepEqual(result.geometry,input.geometry);assert.deepEqual(input,before);
 // A finite F mark belongs to the public geometry, not the private area graph.
 const marked=structuredClone(input),mg=marked.geometry.graph!,start=mg.vertices_coords.length;
 const blend=(a:number,b:number,c:number):Point=>[a*points[0][0]+b*points[1][0]+c*points[5][0],a*points[0][1]+b*points[1][1]+c*points[5][1]];
 mg.vertices_coords.push(blend(.5,.25,.25),blend(.25,.5,.25));
 mg.edges_vertices.push([start,start+1]);mg.edges_assignment.push('F');mg.edges_foldAngle.push(0);
 const markedResult=recomputeFlatLayers(marked);
 assert.equal(markedResult.layers.status,'solved',markedResult.layers.message);
 assert.ok(flatExactProof(markedResult));assert.deepEqual(markedResult.geometry,marked.geometry);
});
