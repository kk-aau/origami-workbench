/** Origamica In[3386]: source input and current model's refusal to adopt. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {canAdoptTessWithTileLayers,prepareTessResult,readTessParams,
  tessConstructionKey,type TessResponse} from '../src/app/tessellation';
import {tessFlatInput} from '../src/app/tessellationFlat';
import {orientPrimalDualFaceupGeometry,primalDualFaceupRoot,
  primalDualFaceupSatisfied} from '../src/app/primalDualFaceup';
import {primalDualIn3386Params} from '../src/app/primalDualIn3386';

const workbench=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(workbench,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const params=primalDualIn3386Params();
const run=spawnSync(python,[path.join(workbench,'backend','tessellate.py')],{
  input:JSON.stringify(params),encoding:'utf8',cwd:workbench,timeout:30000,
  maxBuffer:8*1024*1024,windowsHide:true,
  env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
assert.equal(run.status,0,run.error?.message||run.stderr);
const response=JSON.parse(run.stdout) as TessResponse;
assert.equal(response.stats.vertices,99);
assert.equal(response.stats.edges,187);
assert.equal(response.stats.faces,89);
assert.equal(response.stats.tiles,23);
assert.equal(response.stats.checks.geometry.status,'passed');
assert.equal(response.stats.checks.local.status,'passed');
assert.equal(response.stats.checks.lff?.status,'failed');
const key=tessConstructionKey(params),result=prepareTessResult(response,params);
assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(
  result.doc.metadata?.tessellation?.parameters))),params);
assert.equal(result.mother?.vertices_coords.length,33);
assert.equal(result.mother?.faces_vertices.length,23);
for(const [ring,radius] of [1,2,4].entries())
  for(let i=0;i<11;i++){
    const [x,y]=result.mother!.vertices_coords[ring*11+i];
    assert.ok(Math.abs(Math.hypot(x,y)-radius)<1e-8);
  }
const graph=tessFlatInput(result,result.doc,key,true).graph;
const geometry=orientPrimalDualFaceupGeometry(computeFlatGeometry(graph,1e-6,{
  startingFace:primalDualFaceupRoot(graph,1)}),1);
assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
const solved=recomputeFlatLayers(geometry);
assert.equal(solved.layers.status,'no-solution',solved.layers.message);
assert.equal(primalDualFaceupSatisfied(solved,graph,1),false);
assert.equal(canAdoptTessWithTileLayers(result,false,key,params,solved.layers.status),false);
console.log(JSON.stringify({source:'Origamica In[3386]',motherVertices:33,
  motherFaces:23,vertices:response.stats.vertices,edges:response.stats.edges,
  faces:response.stats.faces,geometry:'passed',local:'passed',lff:'failed',
  flat:'ready',layer:'no-solution',faceupFace:1,adoptable:false}));
