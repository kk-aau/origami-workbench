import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tessPreset,changeTessParams,readTessParams,canAdoptTess,prepareTessResult,type TessResponse} from '../../src/app/tessellation';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

test('Cairo periodic parameters persist and are removed on other mixed tilings',()=>{
 for(const tiling of ['cairo','double-cairo']){
  const p=changeTessParams(tessPreset('archimedean'),{tiling});
  assert.deepEqual(readTessParams(p),p);
  const edited=changeTessParams(p,{cairoAngle:105,repeatX:4,repeatY:3,cairoOutput:'twist'});
  assert.deepEqual(readTessParams(edited),edited);
  for(const patch of [{cairoAngle:60},{cairoAngle:120},{repeatX:0},{repeatY:5},{cairoOutput:'bad'}])assert.equal(readTessParams({...p,...patch}),null);
  const changed=changeTessParams(edited,{tiling:'3.6.3.6'});assert.deepEqual(readTessParams(changed),changed);assert.equal('cairoAngle' in changed,false);assert.equal('cairoOutput' in changed,false);
 }
 assert.equal(readTessParams({...tessPreset('archimedean'),cairoAngle:90}),null);
});

test('checked mother tilings can be saved without claiming local foldability',()=>{
 const p=changeTessParams(tessPreset('archimedean'),{tiling:'cairo'}),key=JSON.stringify(p);
 const response:TessResponse={fold:{vertices_coords:[[0,0],[1,0],[0,1]],edges_vertices:[[0,1],[1,2],[2,0]],edges_assignment:['B','B','B']},stats:{vertices:3,edges:3,faces:1,tiles:1,checks:{geometry:{status:'passed'},local:{status:'not_applicable',interiorVertices:6}}},source:{output:'tiling'},warnings:['母结构']};
 const result=prepareTessResult(response,p);
 assert.equal(canAdoptTess(result,false,key,p),true);assert.equal(canAdoptTess(result,true,key,p),false);
 assert.equal(canAdoptTess({...result,source:{}},false,key,p),false);
 assert.equal(canAdoptTess({...result,stats:{...result.stats,checks:{...result.stats.checks,geometry:{status:'failed'}}}},false,key,p),false);
});

test('real Double Cairo FOLD mother imports as editable auxiliary lines and retains original faces',()=>{
 const params=changeTessParams(tessPreset('archimedean'),{tiling:'double-cairo',cairoAngle:105});
 delete params.paper; // This fixture asserts the original 2×2 mother has exactly 32 faces.
 const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',"import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps(generate(json.load(sys.stdin))))"],{input:JSON.stringify(params),encoding:'utf8',windowsHide:true,timeout:30000,env:{...process.env,OPENBLAS_NUM_THREADS:'1'}});
 assert.equal(run.status,0,run.stderr);
 const response=JSON.parse(run.stdout) as TessResponse,result=prepareTessResult(response,params);
 assert.equal(response.fold&&Array.isArray((response.fold as {faces_vertices:unknown[]}).faces_vertices)&& (response.fold as {faces_vertices:unknown[]}).faces_vertices.length,32);
 assert.equal(result.source.output,'tiling');
 assert.equal(result.doc.segments.filter(s=>s.assignment==='A').length,response.stats.edges-(result.doc.segments.filter(s=>s.assignment==='B').length));
 assert.ok(result.doc.segments.some(s=>s.assignment==='B'));
 assert.ok(result.doc.segments.every(s=>s.assignment==='A'||s.assignment==='B'));
 assert.equal(result.doc.metadata?.tessellation&&((result.doc.metadata.tessellation as {parameters:typeof params}).parameters).cairoAngle,105);
 assert.equal(canAdoptTess(result,false,JSON.stringify(params),params),true);
 assert.equal(result.stats.checks.local.status,'not_applicable');
});

test('paper-backed Double Cairo imports its extended pattern and new sheet boundary',()=>{
 const params=changeTessParams(tessPreset('archimedean'),{tiling:'double-cairo',cairoAngle:105,cairoOutput:'tiling',paper:{shape:'square',margin:.1}});
 const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',"import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps(generate(json.load(sys.stdin))))"],{input:JSON.stringify(params),encoding:'utf8',windowsHide:true,timeout:30000,env:{...process.env,OPENBLAS_NUM_THREADS:'1'}});
 assert.equal(run.status,0,run.stderr);
 const response=JSON.parse(run.stdout) as TessResponse,result=prepareTessResult(response,params);
 assert.equal(result.source.paperMethod,'extended-pattern-clip-v1');
 assert.equal(result.source.paperExpansion,2);
 assert.ok(response.stats.faces>32);
 assert.ok(result.doc.segments.filter(s=>s.assignment==='A').length>62);
 assert.ok(result.doc.segments.some(s=>s.assignment==='B'));
 assert.ok(result.doc.segments.every(s=>s.assignment==='A'||s.assignment==='B'));
 assert.equal(result.stats.checks.geometry.status,'passed');
 assert.equal(canAdoptTess(result,false,JSON.stringify(params),params),true);
});
