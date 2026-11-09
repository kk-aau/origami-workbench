import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {readTessParams,prepareTessResult,tessConstructionKey,canAdoptTessWithTileLayers,type TessResponse} from '../../src/app/tessellation';
import {wovenIn3437Preset,readWovenFullEdgeInsets,type WovenParams} from '../../src/app/wovenParams';
import {wovenIn3437Source,readWovenGraphSource,recomputeWovenGraphSource,wovenGraphSourceMatches} from '../../src/app/wovenGraphSource';
import {wovenFullInsetsMatch,wovenInsetEdges,makeWovenFullInsets} from '../../src/app/wovenFullInsets';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {tessFlatInput,tessFlatRoot} from '../../src/app/tessellationFlat';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';

const python=path.resolve('.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const run=spawnSync(python,['-c',"import sys,json;sys.path.insert(0,'backend');from test_tessellation_woven_graph_source import fixtures;print(json.dumps(fixtures()))"],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:20*1024*1024,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
assert.equal(run.status,0,run.stderr);
const cases=JSON.parse(run.stdout) as {params:WovenParams&{mode:'graph'};response:TessResponse}[];

test('In3437 complete raw source independently recomputes all ordered V/E and persists actual source',()=>{
 const source=wovenIn3437Source(),actual=recomputeWovenGraphSource(source),p=wovenIn3437Preset();
 assert.equal(source.inputGraph.vertices.length,22);assert.equal(source.inputGraph.edges.length,13);
 assert.equal(actual.graph.vertices.length,46);assert.equal(actual.graph.edges.length,79);
 assert.equal(p.width,16);assert.equal(p.parity,1);assert.equal(p.graphSource?.invertFoldType,true);
 assert.deepEqual(actual.graph.edges,cases[0].params.graph.edges);assert.deepEqual(actual.originalEdgeForSegment,cases[0].response.source.originalEdgeForSegment);
 assert.ok(wovenGraphSourceMatches(source,cases[0].params.graph));assert.ok(wovenGraphSourceMatches(source,p.graph));
 const delta=Math.max(...actual.graph.vertices.map((q,i)=>Math.hypot(q[0]-cases[0].params.graph.vertices[i][0],q[1]-cases[0].params.graph.vertices[i][1])));assert.ok(delta<1e-10);
 for(const {params,response} of cases){assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);assert.deepEqual(response.source.graphSource,params.graphSource);assert.deepEqual(response.mother!.vertices_coords,params.graph.vertices);assert.deepEqual(response.mother!.edges_vertices,params.graph.edges);assert.equal(response.source.lines,undefined);}
 assert.ok(readTessParams(p));
});

test('source contract rejects wrong raw source, actual count/index/endpoints and family spoofing',()=>{
 const source=wovenIn3437Source();assert.deepEqual(readWovenGraphSource(source),source);
 for(const mutate of [(p:ReturnType<typeof wovenIn3437Preset>)=>{p.graphSource!.intersectionTolerance=1 as 2;},p=>{p.graphSource!.kind='fake' as 'origamica-in3437';},p=>{p.graphSource!.invertFoldType=false as true;},p=>{p.graphSource!.inputGraph.vertices[0][0]+=.01;},p=>{p.graph.vertices[0][0]+=.01;},p=>{p.graph.edges.reverse();},p=>{p.graph.vertices.pop();}]){const p=wovenIn3437Preset();mutate(p);assert.equal(readTessParams(p),null);}
 assert.equal(readTessParams({family:'primal-dual',graphSource:source}),null);
 assert.equal(readTessParams({...wovenIn3437Preset(),lines:[[0,0,1]]}),null);
 assert.equal(readTessParams({...wovenIn3437Preset(),width:20.001}),null);
 assert.equal(readTessParams({family:'woven-lines',mode:'lines',width:16}),null);
});

test('graph full h context remains strict and absolute full79 values survive width and periodicity',()=>{
 const {params,response}=cases[1],result=prepareTessResult(response,params),edges=wovenInsetEdges(result),full=params.fullEdgeInsets!;
 assert.equal(readWovenFullEdgeInsets(full),null,'legacy line budget remains h≤1 / coordinates≤10');assert.ok(readWovenFullEdgeInsets(full,true));assert.ok(wovenFullInsetsMatch(full,edges,true));assert.deepEqual(makeWovenFullInsets(edges),full);
 assert.deepEqual(cases[0].response.fold,response.fold);assert.deepEqual(response.fold,cases[2].response.fold);assert.deepEqual(cases[3].response.fold,cases[4].response.fold);
 assert.deepEqual(cases[4].response.source.requestedEdgeInsets,new Array(79).fill(8));assert.deepEqual(cases[4].response.source.effectiveEdgeInsets,(cases[4].response.source.edgeLines as number[]).map(k=>k<0?0:8));
 for(const mutate of [(p:typeof params)=>{p.fullEdgeInsets!.entries[0].inset=10.001;},p=>{p.fullEdgeInsets!.entries[0].from[0]+=.0001;},p=>{p.fullEdgeInsets!.entries[0].edge=1;},p=>{p.fullEdgeInsets!.entries[0].line=0;},p=>{p.fullEdgeInsets!.entries.pop();}]){const p=structuredClone(params);mutate(p);assert.equal(readTessParams(p),null);}
 assert.equal(readTessParams({...params,periodicityEnabled:false,periodicity:[[0,1]]}),null);
});

test('unscaled saved source is adoptable with solved whole layers and distinct real front/back visibility',()=>{
 for(const {params,response} of [cases[0],cases[4],cases[5]]){
  const result=prepareTessResult(response,params),key=tessConstructionKey(params),input=tessFlatInput(result,result.doc,key,true);
  assert.deepEqual((result.doc.metadata!.tessellation as {parameters:unknown}).parameters,params);assert.deepEqual((result.doc.metadata!.tessellation as {source:unknown}).source,response.source);
  assert.ok(Math.abs(Math.max(result.doc.paper.width,result.doc.paper.height)-200)<1e-10);assert.ok(Math.min(result.doc.paper.width,result.doc.paper.height)>0);
  const geometry=computeFlatGeometry(input.graph,1e-6,{startingFace:input.startingFace});assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);const layers=recomputeFlatLayers(geometry);assert.equal(layers.layers.status,'solved',layers.layers.message);
  const gate=recomputeFlatLayers(computeFlatGeometry(input.graph,1e-6,{startingFace:tessFlatRoot(input.graph)}));assert.equal(gate.layers.status,'solved');assert.ok(canAdoptTessWithTileLayers(result,false,key,params,gate.layers.status));
  const regions=modelOverlapRegions(layers),front=modelRegionLayers(layers,regions,'front'),back=modelRegionLayers(layers,regions,'back');assert.ok(front.length>1000);assert.ok([...front,...back].every(r=>r.layers.status==='ordered'));assert.ok(front.some((r,i)=>r.layers.status==='ordered'&&back[i].layers.status==='ordered'&&r.layers.topToBottom[0]!==back[i].layers.topToBottom[0]));
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify((result.doc.metadata!.tessellation as {parameters:unknown}).parameters))),params);
 }
 assert.equal(cases[5].response.source.stationaryFace,3);
});
