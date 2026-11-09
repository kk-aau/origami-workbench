import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {changeTessParams,readTessParams,tessPreset,prepareTessResult,previewTessDocument,type TessParams} from '../../src/app/tessellation';
import {gammaAndAlpha,shrinkAndTwist} from '../../src/app/primalDualParams';
import {tessFlatInput,tessFlatRoot} from '../../src/app/tessellationFlat';
import {computeFlatGeometry} from '../../src/core/flatFold';

test('gamma/alpha round trips preserve edited duals and reject malformed saved options',()=>{
 for(const direction of ['cw','ccw'] as const)for(const gamma of [.01,.5,1,100])for(const alpha of [.1,30,89.9]){
  const p=shrinkAndTwist(gamma,alpha,direction),inverse=gammaAndAlpha(p.scale,p.angle);
  assert.ok(Math.abs(inverse.gamma-gamma)<1e-9);assert.ok(Math.abs(inverse.pleatAngle-alpha)<1e-9);assert.equal(inverse.twistDirection,direction);
  const params=changeTessParams(tessPreset('periodic'),{parameterization:'gamma-alpha',gamma,pleatAngle:alpha,twistDirection:direction,postRotation:'dual'});
  assert.deepEqual(readTessParams(params),params);
 }
 const p=changeTessParams(tessPreset('periodic'),{dualTargets:[[0,0],[1,1]]});
 for(const patch of [{parameterization:'gamma-alpha',gamma:1,pleatAngle:30},{postRotation:'primal'},{angle:40}])assert.deepEqual((changeTessParams(p,patch) as typeof p).dualTargets,[[0,0],[1,1]]);
 for(const patch of [{gamma:1},{parameterization:'bad'},{postRotation:'bad'},{parameterization:'gamma-alpha',gamma:0},{parameterization:'gamma-alpha',pleatAngle:-30}])assert.equal(readTessParams({...tessPreset('periodic'),...patch}),null);
 assert.equal(readTessParams({...tessPreset('twist'),postRotation:'dual'}),null);
});

test('gamma/alpha live preview and folded geometry match independently regenerated coordinates for every orientation',()=>{
 const base=changeTessParams({...tessPreset('periodic'),rows:2,columns:2},{parameterization:'gamma-alpha',gamma:.5,pleatAngle:30});
 const params:TessParams[]=[base,...(['none','primal','dual'] as const).map(postRotation=>changeTessParams(base,{gamma:.6,pleatAngle:42,postRotation}))];
 const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',"import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps([generate(p) for p in json.load(sys.stdin)]))"],{input:JSON.stringify(params),encoding:'utf8',windowsHide:true,timeout:30000,env:{...process.env,OPENBLAS_NUM_THREADS:'1'}});
 assert.equal(run.status,0,run.stderr);const responses=JSON.parse(run.stdout),source=prepareTessResult(responses[0],base);
 for(let i=1;i<params.length;i++){
  const expected=prepareTessResult(responses[i],params[i]),preview=previewTessDocument(source,JSON.stringify(base),params[i]);assert.ok(preview);
  const a=tessFlatInput(source,preview,'preview',false),b=tessFlatInput(expected,expected.doc,'checked',true);
  assert.deepEqual(a.graph.edges_vertices,b.graph.edges_vertices);assert.deepEqual(a.graph.faces_vertices,b.graph.faces_vertices);assert.deepEqual(a.graph.edges_assignment,b.graph.edges_assignment);
  for(let j=0;j<a.graph.vertices_coords.length;j++)assert.ok(Math.hypot(a.graph.vertices_coords[j][0]-b.graph.vertices_coords[j][0],a.graph.vertices_coords[j][1]-b.graph.vertices_coords[j][1])<1e-6);
  const root=tessFlatRoot(b.graph),af=computeFlatGeometry(a.graph,2e-6,{startingFace:root}),bf=computeFlatGeometry(b.graph,2e-6,{startingFace:root});
  assert.equal(af.geometry.status,'ready');assert.equal(bf.geometry.status,'ready');
  for(let j=0;j<af.geometry.vertices.length;j++)assert.ok(Math.hypot(af.geometry.vertices[j][0]-bf.geometry.vertices[j][0],af.geometry.vertices[j][1]-bf.geometry.vertices[j][1])<1e-5);
 }
});
