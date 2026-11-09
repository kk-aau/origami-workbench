import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {readTessParams,prepareTessResult,tessConstructionKey,canAdoptTessWithTileLayers,type TessResponse} from '../../src/app/tessellation';
import {wovenPreset,type WovenParams} from '../../src/app/wovenParams';
import {readWovenGraph,wovenGraphEdgeKinds,wovenGraphPreset} from '../../src/app/wovenGraph';
import {makeWovenFullInsets,wovenFullInsetsMatch,wovenInsetEdges} from '../../src/app/wovenFullInsets';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {tessFlatInput,tessFlatRoot} from '../../src/app/tessellationFlat';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
const python=path.resolve('.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const run=spawnSync(python,['-c',"import sys,json;sys.path.insert(0,'backend');from test_tessellation_woven_graph import fixtures;print(json.dumps(fixtures()))"],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:12*1024*1024,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
assert.equal(run.status,0,run.stderr);
const cases=JSON.parse(run.stdout) as {params:WovenParams&{mode:'graph'};response:TessResponse}[];

test('finite graph reader preserves all source indices and rejects cross-family or mixed line sources',()=>{
 const preset=wovenPreset('graph');assert.deepEqual(preset,cases[0].params);
 for(const {params} of cases)assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
 const graph=wovenGraphPreset();assert.deepEqual(readWovenGraph(graph),graph);assert.deepEqual(wovenGraphEdgeKinds(graph),[-1,-1,-1,-1,0,0,0,0]);
 for(const bad of [{...graph,faces:[[0,1,2]]},{...graph,edges:[...graph.edges,[2,1]]},{...graph,vertices:[[Infinity,0],...graph.vertices.slice(1)]}])assert.equal(readWovenGraph(bad),null);
 for(const patch of [{lines:[[0,0,1]]},{boundary:[[-1,-1],[1,-1],[1,1]]},{segmentInsets:[]}])assert.equal(readTessParams({...preset,...patch}),null);
 assert.equal(readTessParams({family:'primal-dual',graph}),null);
 assert.equal(readTessParams({family:'primal-dual',mode:'graph'}),null);
});

test('complete finite graph inset stamps bind to original edge index, classification and endpoints',()=>{
 const {params,response}=cases[1],edges=wovenInsetEdges(prepareTessResult(response,params));assert.equal(edges.length,8);
 assert.ok(wovenFullInsetsMatch(params.fullEdgeInsets!,edges));assert.deepEqual(makeWovenFullInsets(edges),params.fullEdgeInsets);
 for(const field of ['from','line','edge','edgeCount'] as const){const p=structuredClone(params);if(field==='from')p.fullEdgeInsets!.entries[4].from[0]+=.0001;else if(field==='line')p.fullEdgeInsets!.entries[0].line=0;else if(field==='edge')p.fullEdgeInsets!.entries[0].edge=1;else p.fullEdgeInsets!.edgeCount=9;assert.equal(readTessParams(p),null,field);}
 const reordered=structuredClone(params);reordered.graph.edges.push(reordered.graph.edges.shift()!);assert.equal(readTessParams(reordered),null);
 const reversed=structuredClone(params);reversed.fullEdgeInsets!.entries.forEach(e=>{[e.from,e.to]=[e.to,e.from];});assert.ok(readTessParams(reversed));
 const changed=structuredClone(params);changed.graph.vertices[0]=[.002,.002];assert.equal(readTessParams(changed),null);
 delete changed.fullEdgeInsets;assert.ok(readTessParams(changed),'explicit geometry edits may clear old source and generate anew');
});

test('absolute full h survives width; None and enabled empty periodicity retain source and actual zero boundary',()=>{
 assert.deepEqual(cases[1].response.fold,cases[2].response.fold);assert.deepEqual(cases[3].response.fold,cases[4].response.fold);
 assert.notDeepEqual(cases[1].response.fold,cases[3].response.fold);
 assert.deepEqual(cases[4].response.source.effectiveEdgeInsets,[0,0,0,0,.04,.04,.04,.04]);
 assert.deepEqual(cases[4].response.source.requestedEdgeInsets,[.015,.02,.025,.03,.04,.04,.04,.04]);
 assert.equal(readTessParams({...cases[4].params,periodicityEnabled:false,periodicity:[[1,3]]}),null);
});

test('finite bent graph really unfolds with complete layers and independent front/back visible surfaces',()=>{
 for(const {params,response} of cases){
  const result=prepareTessResult(response,params),key=tessConstructionKey(params),input=tessFlatInput(result,result.doc,key,true);
  assert.deepEqual(response.mother!.vertices_coords,params.graph.vertices);assert.deepEqual(response.mother!.edges_vertices,params.graph.edges);
  assert.equal(response.source.lines,undefined);assert.equal(response.source.segmentInsets,undefined);
  assert.deepEqual((result.doc.metadata!.tessellation as {parameters:unknown}).parameters,params);
  const geometry=computeFlatGeometry(input.graph,1e-6,{startingFace:input.startingFace});assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
  const layers=recomputeFlatLayers(geometry);assert.equal(layers.layers.status,'solved',layers.layers.message);
  const gate=recomputeFlatLayers(computeFlatGeometry(input.graph,1e-6,{startingFace:tessFlatRoot(input.graph)}));assert.equal(gate.layers.status,'solved');
  assert.equal(canAdoptTessWithTileLayers(result,false,key,params,'checking'),false);assert.equal(canAdoptTessWithTileLayers(result,false,key,params,'no-solution'),false);assert.equal(canAdoptTessWithTileLayers(result,false,key,params,gate.layers.status),true);
  const overlap=modelOverlapRegions(layers),front=modelRegionLayers(layers,overlap,'front'),back=modelRegionLayers(layers,overlap,'back');assert.ok(front.length&&back.length);assert.ok([...front,...back].every(r=>r.layers.status==='ordered'));
  assert.ok(front.some((f,i)=>f.layers.status==='ordered'&&back[i]?.layers.status==='ordered'&&f.layers.topToBottom[0]!==back[i].layers.topToBottom[0]));
 }
 assert.deepEqual(cases[0].response.source.sourceFaceCycles,[[1,2,0],[2,3,0],[3,4,0],[4,1,0]]);
 assert.equal(cases[5].response.source.stationaryFace,3);
});
