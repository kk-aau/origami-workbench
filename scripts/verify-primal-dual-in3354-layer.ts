/** Origamica In[3354]: directed CP, global layer order and FaceupFace=3. */
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
import {primalDualIn3354Params} from '../src/app/primalDualIn3354';

const workbench=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(workbench,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const params=primalDualIn3354Params();
const run=spawnSync(python,[path.join(workbench,'backend','tessellate.py')],{
  input:JSON.stringify(params),encoding:'utf8',cwd:workbench,timeout:30000,
  maxBuffer:8*1024*1024,windowsHide:true,
  env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
assert.equal(run.status,0,run.error?.message||run.stderr);
const response=JSON.parse(run.stdout) as TessResponse;
for(const check of ['geometry','local','lff'] as const)
  assert.equal(response.stats.checks[check]?.status,'passed',`${check} failed`);
assert.equal(response.stats.edges,24);
const key=tessConstructionKey(params),result=prepareTessResult(response,params);
assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(result.doc.metadata?.tessellation?.parameters))),params);
const graph=tessFlatInput(result,result.doc,key,true).graph;
const geometry=orientPrimalDualFaceupGeometry(computeFlatGeometry(graph,1e-6,{
  startingFace:primalDualFaceupRoot(graph,3)}),3);
assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
const solved=recomputeFlatLayers(geometry);
assert.equal(solved.layers.status,'solved',solved.layers.message);
assert.equal(solved.layers.solutionCountExact,'1');
assert.equal(primalDualFaceupSatisfied(solved,graph,3),true);
assert.equal(canAdoptTessWithTileLayers(result,false,key,params,solved.layers.status),true);
console.log(JSON.stringify({source:'Origamica In[3354]',edges:response.stats.edges,
  flat:geometry.geometry.status,layer:solved.layers.status,
  solutionCountExact:solved.layers.solutionCountExact,faceupFace:3,adoptable:true}));
