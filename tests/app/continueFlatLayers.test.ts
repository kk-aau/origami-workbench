import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {prepareTessResult,tessPreset,type TessParams} from '../../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../../src/app/tessellationFlat';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {continueFlatLayers} from '../../src/core/continueFlatLayers';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';

test('mixed tiling carries a verified stacking through changing ratios, without solving a different branch',()=>{
 const original=tessPreset('archimedean');delete original.paper;
 const params:TessParams[]=[.3,.31,.35,.4,.45,.5].map(scale=>({...original,scale}));
 const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',"import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps([generate(p) for p in json.load(sys.stdin)]))"],{input:JSON.stringify(params),encoding:'utf8',windowsHide:true,timeout:30000});
 assert.equal(run.status,0,run.stderr);
 const frames=JSON.parse(run.stdout).map((raw,i)=>{const source=prepareTessResult(raw,params[i]),input=tessFlatInput(source,source.doc,'',true);return computeFlatGeometry(input.graph,2e-6,{startingFace:tessFlatRoot(input.graph)});});
 let previous=recomputeFlatLayers(frames[0]);assert.equal(previous.layers.status,'solved');assert.equal(previous.layers.faceOrder,undefined,'cover the cyclic global order that needs local surfaces');
 for(const frame of frames.slice(1)){
  const before=structuredClone(frame),old=structuredClone(previous),continued=continueFlatLayers(frame,previous);
  assert.ok(continued);assert.equal(continued.layers.status,'solved');assert.equal(continued.layers.solutionCount,undefined,'validation cannot claim an enumerated solution count');
  assert.deepEqual(frame,before);assert.deepEqual(previous,old);assert.deepEqual(continued.geometry,frame.geometry);
  const lookup=new Map(previous.layers.faceOrders!.map(([a,b,s])=>[`${a} ${b}`,s]));for(const [a,b,s] of continued.layers.faceOrders!)assert.equal(s,lookup.get(`${a} ${b}`));
  const regions=modelRegionLayers(continued,modelOverlapRegions(continued),'front'),total=regions.reduce((s,r)=>s+r.area,0),unknown=regions.reduce((s,r)=>s+(r.layers.status==='ordered'?0:r.area),0);assert.ok(unknown<total*1e-8);
  previous=continued;
 }
 for(const mutate of [r=>{r.geometry.graph.edges_assignment[1]=r.geometry.graph.edges_assignment[1]==='M'?'V':'M';},r=>{r.geometry.startingFace=0;},r=>{r.geometry.graph.faces_vertices=[...r.geometry.graph.faces_vertices].reverse();},r=>{r.layers.status='unknown';},r=>{r.layers.faceOrders=[];},r=>{r.layers.faceOrders=r.layers.faceOrders.map(([a,b,s])=>[a,b,-s]);}]){
  const incompatible=structuredClone(previous);mutate(incompatible);assert.equal(continueFlatLayers(frames.at(-1),incompatible),null,'changed assignment, topology, root or contradictory/missing stacking must not be reused');
 }
 const collapsed=structuredClone(frames.at(-1));collapsed.geometry.vertices=collapsed.geometry.vertices.map(()=>[0,0]);assert.equal(continueFlatLayers(collapsed,previous),null);
});
