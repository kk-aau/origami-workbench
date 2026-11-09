import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readTessParams,prepareTessResult,tessConstructionKey,canAdoptTessWithTileLayers,type TessResponse} from '../../src/app/tessellation';
import type {WovenParams} from '../../src/app/wovenParams';
import {wovenGraphEdgeKinds} from '../../src/app/wovenGraph';
import {wovenInsetEdges,wovenFullInsetsMatch} from '../../src/app/wovenFullInsets';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {tessFlatInput,tessFlatRoot} from '../../src/app/tessellationFlat';
type Case={name:string;params:WovenParams&{mode:'graph'};response:TessResponse};
const saved=JSON.parse(fs.readFileSync('tests/fixtures/woven-even-degree-20261001.json','utf8')) as {cases:Case[];baseline:Case[]};

test('six/eight mother JSON preserves original indices, fixed face, full h and empty-period source',()=>{
 for(const {params,response} of saved.cases){
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  assert.deepEqual(response.mother!.vertices_coords,params.graph.vertices);assert.deepEqual(response.mother!.edges_vertices,params.graph.edges);
  assert.deepEqual(response.source.graph,params.graph);assert.equal(response.source.lines,undefined);assert.equal(response.source.segmentInsets,undefined);
  assert.deepEqual(wovenGraphEdgeKinds(params.graph),response.source.edgeLines);
  const result=prepareTessResult(response,params),metadata=result.doc.metadata!.tessellation as {parameters:unknown;source:unknown};
  assert.deepEqual(metadata.parameters,params);assert.deepEqual(metadata.source,response.source);
  if(params.fullEdgeInsets)assert.ok(wovenFullInsetsMatch(params.fullEdgeInsets,wovenInsetEdges(result),true));
 }
 const full=structuredClone(saved.cases.find(c=>c.name==='six-full')!.params);
 full.fullEdgeInsets!.entries[0].from[0]+=.001;assert.equal(readTessParams(full),null);
 delete full.fullEdgeInsets;assert.ok(readTessParams(full));
 assert.equal(readTessParams({...full,graphSource:saved.baseline[1].params.graphSource}),null);
 assert.equal(readTessParams({...full,periodicityEnabled:false,periodicity:[[1,4]]}),null);
 assert.equal(readTessParams({family:'primal-dual',graph:full.graph}),null);
});

test('higher even CP/FF geometry is real but no-solution whole layers forbid adoption',()=>{
 for(const {name,params,response} of saved.cases){
  const result=prepareTessResult(response,params),key=tessConstructionKey(params),input=tessFlatInput(result,result.doc,key,true);
  const geometry=computeFlatGeometry(input.graph,1e-6,{startingFace:input.startingFace});assert.equal(geometry.geometry.status,'ready',`${name}: ${geometry.geometry.message}`);
  const layers=recomputeFlatLayers(geometry);assert.equal(layers.layers.status,'no-solution',`${name}: ${layers.layers.message}`);
  const gate=recomputeFlatLayers(computeFlatGeometry(input.graph,1e-6,{startingFace:tessFlatRoot(input.graph)}));assert.equal(gate.layers.status,'no-solution',name);
  assert.equal(canAdoptTessWithTileLayers(result,false,key,params,gate.layers.status),false,name);
  assert.equal(canAdoptTessWithTileLayers(result,false,key,params,'checking'),false);
  const cp=response.fold.vertices_coords,ff=response.source.foldedForm as number[][];
  for(const face of response.fold.faces_vertices!)for(let i=0;i<face.length;i++)for(const b of face.slice(i+1)){
   const a=face[i];assert.ok(Math.abs(Math.hypot(cp[a][0]-cp[b][0],cp[a][1]-cp[b][1])-Math.hypot(ff[a][0]-ff[b][0],ff[a][1]-ff[b][1]))<1e-8,name);
  }
 }
});

test('old four-degree and In3437 layer gates remain solved and adoptable',()=>{
 for(const {params,response} of saved.baseline){
  assert.equal(response.source.topologyProbeBudget,undefined);
  const result=prepareTessResult(response,params),key=tessConstructionKey(params),input=tessFlatInput(result,result.doc,key,true);
  const gate=recomputeFlatLayers(computeFlatGeometry(input.graph,1e-6,{startingFace:tessFlatRoot(input.graph)}));assert.equal(gate.layers.status,'solved');
  assert.equal(canAdoptTessWithTileLayers(result,false,key,params,gate.layers.status),true);
 }
});
