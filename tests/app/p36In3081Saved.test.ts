import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {p36In3081Params,p36In3081TileSpecs} from '../../src/app/p36In3081Source';
import {readTessParams,prepareTessResult,tessConstructionKey,type TessResponse} from '../../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../../src/app/tessellationFlat';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const env={...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'};

test('原版 In[3081] 十三块 JoinTiling 输入构成整片可平折 CP 与唯一层序',()=>{
  const source=p36In3081TileSpecs();
  assert.equal(source.length,13);
  assert.deepEqual(source.map(tile=>tile.sides),[4,6,4,3,4,3,4,3,3,4,3,4,3]);
  assert.deepEqual(source.slice(1).map(tile=>[
    tile.join!.targetTile+1,tile.join!.targetVertex+1,tile.join!.sourceVertex+1,
  ]),[[1,2,1],[2,3,1],[1,1,1],[4,2,1],[5,2,1],[6,2,1],
    [7,2,1],[1,3,2],[9,2,1],[10,2,1],[11,1,1],[12,2,1]]);
  const params=readTessParams(p36In3081Params());
  assert.ok(params&&params.family==='custom');
  assert.equal(params.faces.length,13);
  assert.equal(params.vertices.length,18);
  assert.deepEqual(params.tileTwists?.map(tile=>tile.centralTypes.join('')),
    source.map((tile,index)=>'VMVMVMVMMVMVM'[index].repeat(tile.sides)));
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  const wrong=structuredClone(params);
  wrong.tileSpecs![8].join!.sourceVertex=0;
  assert.equal(readTessParams(wrong),null);
  const request=structuredClone(params);
  delete request.tileSpecs; // App.generateTess retains source locally, strips UI metadata for the backend.
  const run=spawnSync(python,[path.join(root,'backend','tessellate.py')],{
    cwd:root,input:JSON.stringify(request),encoding:'utf8',timeout:30000,
    maxBuffer:8*1024*1024,windowsHide:true,env});
  assert.equal(run.status,0,run.error?.message||run.stderr);
  const result=JSON.parse(run.stdout) as TessResponse;
  assert.deepEqual([result.stats.vertices,result.stats.edges,result.stats.faces],[84,144,61]);
  assert.equal(result.stats.checks.geometry.status,'passed');
  assert.equal(result.stats.checks.local.status,'passed');
  const prepared=prepareTessResult(result,params);
  const graph=tessFlatInput(prepared,prepared.doc,tessConstructionKey(params),true).graph;
  const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
  assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
  const layers=recomputeFlatLayers(geometry);
  assert.equal(layers.layers.status,'solved',layers.layers.message);
  assert.equal(layers.layers.solutionCountExact,'1');
});
