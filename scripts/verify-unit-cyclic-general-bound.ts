/** High-sided numeric composition of Origamica In[378] and In[3041/3044]. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {canAdoptTessWithTileLayers,prepareTessResult,readTessParams,
  tessConstructionKey,unitCyclicSourceParams,type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';
import {UNIT_CYCLIC_ALT_TYPE,unitCyclicGeneralPreset} from '../src/app/unitCyclicSource';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const backend=path.join(root,'backend','tessellate.py');

for(const sides of [13,16,24])for(const mode of ['centered','alt'] as const){
  const centered=unitCyclicGeneralPreset(sides);
  const {pleatAngle:_pleatAngle,...common}=centered;
  const spec=mode==='centered'?centered:{...common,tileType:UNIT_CYCLIC_ALT_TYPE,
    twistAngle:30};
  const params=unitCyclicSourceParams(spec);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  const {unitCyclic:_source,...request}=params;
  const run=spawnSync(python,[backend],{cwd:root,input:JSON.stringify(request),encoding:'utf8',
    timeout:30000,maxBuffer:4*1024*1024,windowsHide:true,
    env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
  assert.equal(run.status,0,`n=${sides} ${mode}: ${run.error?.message||run.stderr}`);
  const response=JSON.parse(run.stdout) as TessResponse;
  assert.deepEqual([response.stats.vertices,response.stats.edges,response.stats.faces],
    [4*sides,6*sides,2*sides+1]);
  assert.equal(response.stats.checks.geometry.status,'passed');
  assert.equal(response.stats.checks.local.status,'passed');
  assert.ok(typeof response.source.closureError==='number'&&response.source.closureError<1e-8);
  const key=tessConstructionKey(params),prepared=prepareTessResult(response,params);
  const graph=tessFlatInput(prepared,prepared.doc,key,true).graph;
  const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
  assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
  const solved=recomputeFlatLayers(geometry);
  assert.equal(solved.layers.status,'solved',`n=${sides} ${mode}: ${solved.layers.message}`);
  assert.equal(solved.layers.solutionCountExact,'1');
  assert.equal(canAdoptTessWithTileLayers(prepared,false,key,params,solved.layers.status),true);
  console.log(JSON.stringify({sides,mode,cp:[response.stats.vertices,response.stats.edges,
    response.stats.faces],closureError:response.source.closureError,
    layerOrder:solved.layers.status,solutions:solved.layers.solutionCountExact}));
}
