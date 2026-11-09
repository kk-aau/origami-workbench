/** Saved Goldberg mother meshes plus this app's default twist: reject unsolved layer order. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {canAdoptTessWithTileLayers,changeTessParams,prepareTessResult,
  tessConstructionKey,tessPreset,type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const backend=path.join(root,'backend','tessellate.py');
for(const [order,rings,offset] of [[7,2,0],[8,2,1]] as const){
  const params=changeTessParams(changeTessParams(tessPreset('nonperiodic'),{kind:'goldberg'}),
    {goldbergOrder:order,goldbergRings:rings,goldbergOffset:offset,goldbergOutput:'twist'});
  const run=spawnSync(python,[backend],{cwd:root,input:JSON.stringify(params),encoding:'utf8',
    timeout:30000,maxBuffer:8*1024*1024,windowsHide:true,
    env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
  assert.equal(run.status,0,`${order}/${rings}/${offset}: ${run.error?.message||run.stderr}`);
  const response=JSON.parse(run.stdout) as TessResponse;
  const key=tessConstructionKey(params),prepared=prepareTessResult(response,params);
  const graph=tessFlatInput(prepared,prepared.doc,key,true).graph;
  const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
  assert.equal(response.stats.checks.geometry.status,'passed');
  assert.equal(response.stats.checks.local.status,'passed');
  assert.equal(geometry.geometry.status,'ready');
  const solved=recomputeFlatLayers(geometry);
  assert.equal(solved.layers.status,'no-solution',
    '当前扭转候选若获得层序解，需重新核对 Goldberg 来源和采用门禁');
  assert.equal(canAdoptTessWithTileLayers(prepared,false,key,params,solved.layers.status),false);
  console.log(JSON.stringify({order,rings,offset,cp:[response.stats.vertices,response.stats.edges,
    response.stats.faces],geometry:response.stats.checks.geometry.status,
    local:response.stats.checks.local.status,flat:geometry.geometry.status,
    layer:solved.layers.status,adoptable:false}));
  if(offset===0){
    const tilingParams=changeTessParams(params,{goldbergOutput:'tiling'});
    const tilingRun=spawnSync(python,[backend],{cwd:root,input:JSON.stringify(tilingParams),
      encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024,windowsHide:true,
      env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
    assert.equal(tilingRun.status,0,tilingRun.error?.message||tilingRun.stderr);
    const tiling=prepareTessResult(JSON.parse(tilingRun.stdout) as TessResponse,tilingParams);
    assert.equal(tiling.source.output,'tiling');
    assert.equal(canAdoptTessWithTileLayers(tiling,false,tessConstructionKey(tilingParams),
      tilingParams,undefined),true);
  }
}
