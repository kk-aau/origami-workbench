import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {readTessParams,prepareTessResult,tessConstructionKey,canAdoptTessWithTileLayers,type TessResponse} from '../../src/app/tessellation';
import {readWovenFullEdgeInsets,wovenPeriodicityEnabled,type WovenParams} from '../../src/app/wovenParams';
import {makeWovenFullInsets,wovenFullInsetsMatch,wovenInsetEdges} from '../../src/app/wovenFullInsets';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {tessFlatInput,tessFlatRoot} from '../../src/app/tessellationFlat';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import type {FoldGraph} from '../../src/core/types';

const python=path.resolve('.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
function fixtures(){
 const code=`import json,sys
sys.path.insert(0,'backend')
from tessellate import generate
from test_tessellation_woven_full_edge_insets import BASE,mother,full_source
from tessellation_line_groups import chord_lines,arrangement
data=mother()
pairs=[[i,j] for i,p in enumerate(data['mesh']['vertices_coords']) for j,q in enumerate(data['mesh']['vertices_coords']) if abs(p[0]+1)<1e-8 and abs(q[0]-1)<1e-8 and abs(p[1]-q[1])<1e-8 and abs(p[1])<.9]
params=[dict(BASE,fullEdgeInsets=full_source(data)),dict(BASE,fullEdgeInsets=full_source(data,True)),dict(BASE,borderInset='none',fullEdgeInsets=full_source(data)),dict(BASE,periodicity=pairs,fullEdgeInsets=full_source(data)),dict(BASE,parity=-1,stationaryFace=4,minPleat=1.2,minBorderPleat=.02,fullEdgeInsets=full_source(data)),dict(BASE,periodicityEnabled=True,periodicity=[],fullEdgeInsets=full_source(data))]
star_lines,star_boundary=chord_lines([[0,.15,.06]],7)
star=arrangement(star_lines,star_boundary)
full=dict(edgeCount=len(star['mesh']['edges_vertices']),entries=[dict(edge=i,line=star['edgeLines'][i],**{'from':star['mesh']['vertices_coords'][a]},to=star['mesh']['vertices_coords'][b],inset=.03) for i,(a,b) in enumerate(star['mesh']['edges_vertices'])])
params.append(dict(family='woven-lines',mode='chord',lines=[[0,.15,1]],order=7,width=.06,parity=-1,minPleat=1,minBorderPleat=.01,borderInset='auto',stationaryFace=0,fullEdgeInsets=full))
print(json.dumps([dict(params=p,response=generate(p)) for p in params]))`;
 const run=spawnSync(python,['-c',code],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:16*1024*1024,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
 assert.equal(run.status,0,run.stderr);return JSON.parse(run.stdout) as {params:WovenParams;response:TessResponse}[];
}
const cases=fixtures();

test('explicit empty periodicity strictly round trips independently from legacy empty/None',()=>{
 const params={...cases[0].params,periodicity:[]};assert.equal(wovenPeriodicityEnabled(params),false);
 for(const enabled of [false,true]){const p={...params,periodicityEnabled:enabled};assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(p))),p);assert.equal(wovenPeriodicityEnabled(p),enabled);}
 assert.equal(wovenPeriodicityEnabled(cases[3].params),true);
 assert.equal(readTessParams({...cases[3].params,periodicityEnabled:false}),null);
 assert.equal(readTessParams({...params,periodicityEnabled:1}),null);
 assert.equal(readTessParams({family:'primal-dual',periodicityEnabled:true}),null);
 assert.deepEqual(cases[5].response.fold,cases[2].response.fold);
 assert.notDeepEqual(cases[5].response.fold,cases[0].response.fold);
});

test('complete full-edge list strictly restores every edge ID/stamp and rejects omissions or mixed sources',()=>{
 const {params}=cases[0],full=params.fullEdgeInsets!;
 assert.equal(full.edgeCount,24);assert.equal(full.entries.filter(e=>e.line<0).length,12);
 assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
 for(const bad of [{...full,edgeCount:23},{...full,entries:full.entries.slice(1)},
  {...full,entries:full.entries.map((e,i)=>i===0?{...e,edge:1}:e)},
  {...full,entries:full.entries.map((e,i)=>i===0?{...e,other:1}:e)}])assert.equal(readWovenFullEdgeInsets(bad),null);
 assert.equal(readTessParams({...params,segmentInsets:[]}),null);
 assert.equal(readTessParams({family:'primal-dual',fullEdgeInsets:full}),null,'other families must not silently discard complete weaving sources');
 const zero=structuredClone(full);zero.entries.find(e=>e.line>=0)!.inset=0;
 assert.ok(readWovenFullEdgeInsets(zero),'source allows literal h=0; geometry diagnoses its collapsed molecule separately');
});

test('source matching is relative to actual graph extent and coordinate ULP at small and translated scales',()=>{
 const edges=wovenInsetEdges(prepareTessResult(cases[0].response,cases[0].params));
 for(const scale of [.001,1])for(const translation of [0,9]){
  const scaled=edges.map(e=>({...e,from:e.from.map(n=>n*scale+translation) as [number,number],to:e.to.map(n=>n*scale+translation) as [number,number]}));
  const full=makeWovenFullInsets(scaled);assert.ok(wovenFullInsetsMatch(full,scaled));
  const bad=structuredClone(full);bad.entries[0].from[0]+=1e-7*scale;assert.equal(wovenFullInsetsMatch(bad,scaled),false);
 }
});

test('positive four-side and mixed-zero boundary lists produce complete layers and ordered front/back surfaces',()=>{
 for(const {params,response} of cases.slice(0,6)){
  const result=prepareTessResult(response,params),key=tessConstructionKey(params),edges=wovenInsetEdges(result);
  assert.ok(wovenFullInsetsMatch(params.fullEdgeInsets!,edges));
  assert.deepEqual((result.doc.metadata!.tessellation as {parameters:unknown}).parameters,params);
  const input=tessFlatInput(result,result.doc,key,true),geometry=computeFlatGeometry(input.graph,1e-6,{startingFace:input.startingFace});
  assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
  const layers=recomputeFlatLayers(geometry);assert.equal(layers.layers.status,'solved',layers.layers.message);
  const raw=computeFlatGeometry(response.fold as FoldGraph,1e-7,{startingFace:response.source.stationaryFoldFace as number});
  (response.source.foldedForm as [number,number][]).forEach((p,i)=>assert.ok(Math.hypot(p[0]-raw.geometry.vertices[i][0],p[1]-raw.geometry.vertices[i][1])<1e-6));
  const gate=recomputeFlatLayers(computeFlatGeometry(input.graph,1e-6,{startingFace:tessFlatRoot(input.graph)}));assert.equal(gate.layers.status,'solved');
  assert.equal(canAdoptTessWithTileLayers(result,false,key,params,'checking'),false);assert.equal(canAdoptTessWithTileLayers(result,false,key,params,'no-solution'),false);
  assert.equal(canAdoptTessWithTileLayers(result,false,key,params,gate.layers.status),true);
  const overlap=modelOverlapRegions(layers),front=modelRegionLayers(layers,overlap,'front'),back=modelRegionLayers(layers,overlap,'back');
  assert.ok(front.length&&back.length);assert.ok([...front,...back].every(r=>r.layers.status==='ordered'));
  assert.ok(front.some((f,i)=>f.layers.status==='ordered'&&back[i]?.layers.status==='ordered'&&f.layers.topToBottom[0]!==back[i].layers.topToBottom[0]));
 }
});

test('complete full-edge source does not bypass the saved seven-star global no-solution gate',()=>{
 const {params,response}=cases[6],result=prepareTessResult(response,params),key=tessConstructionKey(params),input=tessFlatInput(result,result.doc,key,true);
 assert.ok(wovenFullInsetsMatch(params.fullEdgeInsets!,wovenInsetEdges(result)));
 assert.equal(response.stats.checks.geometry.status,'passed');assert.equal(response.stats.checks.local.status,'passed');
 const geometry=computeFlatGeometry(input.graph,1e-6,{startingFace:input.startingFace});assert.equal(geometry.geometry.status,'ready');
 const layers=recomputeFlatLayers(geometry);assert.equal(layers.layers.status,'no-solution');
 assert.equal(canAdoptTessWithTileLayers(result,false,key,params,layers.layers.status),false);
});
