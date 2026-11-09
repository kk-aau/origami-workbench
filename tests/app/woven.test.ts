import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {wovenPreset,WOVEN_MODES,type WovenParams} from '../../src/app/wovenParams';
import {readTessParams,prepareTessResult,type TessResponse} from '../../src/app/tessellation';
import {computeFlatGeometry,computeFlatFold} from '../../src/core/flatFold';
import type {FoldGraph} from '../../src/core/types';

test('woven modes preserve line widths and mode-specific parameters on project restore',()=>{
 for(const mode of Object.keys(WOVEN_MODES) as WovenParams['mode'][]){
  const p=wovenPreset(mode);assert.deepEqual(readTessParams(p),p);
  assert.equal(readTessParams({...p,width:NaN}),null);
  assert.equal(readTessParams({...p,periodicity:[[2,2]]}),null);
 }
 assert.equal(readTessParams({...wovenPreset('random'),lines:[[0,.4,1]]}),null);
 assert.equal(readTessParams({...wovenPreset('lines'),order:3}),null);
 assert.equal(readTessParams({...wovenPreset('lines'),boundary:[[0,0],[1,1],[0,1],[1,0]]}),null);
 assert.deepEqual(readTessParams({...wovenPreset('chord'),boundary:[[1,0]]}),{...wovenPreset('chord'),boundary:[[1,0]]});
});

test('woven inverse unfolding agrees with actual flat geometry, including both parities',()=>{
 const params=(Object.keys(WOVEN_MODES) as WovenParams['mode'][]).flatMap(mode=>([1,-1] as const).map(parity=>({...wovenPreset(mode),parity})));
 const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',"import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps([generate(p) for p in json.load(sys.stdin)]))"],{input:JSON.stringify(params),encoding:'utf8',windowsHide:true,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},timeout:30000,maxBuffer:8*1024*1024});
 assert.equal(run.status,0,run.stderr);
 (JSON.parse(run.stdout) as TessResponse[]).forEach((response,i)=>{
  const graph=response.fold as FoldGraph,flat=computeFlatGeometry(graph,1e-7);
  assert.equal(flat.geometry.status,'ready',JSON.stringify(params[i])+flat.geometry.message);
  const reference=response.source.foldedForm as [number,number][];
  for(let a=0;a<reference.length;a++)for(let b=0;b<a;b++){
   const p=flat.geometry.vertices[a],q=flat.geometry.vertices[b],u=reference[a],v=reference[b];
   assert.ok(Math.abs(Math.hypot(p[0]-q[0],p[1]-q[1])-Math.hypot(u[0]-v[0],u[1]-v[1]))<1e-6,'global folded distances agree');
  }
  const result=prepareTessResult(response,params[i]);
  assert.deepEqual(readTessParams((result.doc.metadata?.tessellation as {parameters:unknown}).parameters),params[i]);
  const full=computeFlatFold(result.doc);assert.equal(full.geometry.status,'ready');
  assert.equal(full.layers.status,'solved',JSON.stringify(params[i])+JSON.stringify(full.layers));
 });
});


test('original Origamica merit objective is an explicit persisted woven option',()=>{
 const params={...wovenPreset('graph'),optimization:'origamica-merit' as const};
 const restored=readTessParams(JSON.parse(JSON.stringify(params)));
 assert.deepEqual(restored,params);
 assert.equal(readTessParams({...params,optimization:'unsupported' as never}),null);
});
