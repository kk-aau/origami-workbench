/** Full-pipeline layer audit for Origamica's saved In[3010] Alt tile pair. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {canAdoptTessWithTileLayers,prepareTessResult,readTessParams,
  tessConstructionKey,tessPreset,type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const backend=path.join(root,'backend','tessellate.py');
const base=tessPreset('custom');
assert.equal(base.family,'custom');
const tile={width:.2,offset:0,angleMode:'twist' as const,twistAngle:30,
  centralTypes:['M','M','V','V'] as ('M'|'V')[]};
const params=readTessParams({...base,
  vertices:[[0,0],[1,0],[1,1],[0,1],[1,2],[0,2]],
  faces:[[0,1,2,3],[3,2,4,5]],repeatX:1,repeatY:1,
  customOutput:'tile-twists',tileTwists:[tile,tile],
  monolithicOptions:{mergedEdges:'delete',samePtTolerance:1e-8,
    collinearCleanup:true,collinearTolerance:1e-8}});
assert.ok(params&&params.family==='custom');
const run=spawnSync(python,[backend],{
  cwd:root,input:JSON.stringify(params),encoding:'utf8',timeout:30000,
  maxBuffer:4*1024*1024,windowsHide:true,
  env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
});
assert.equal(run.status,0,run.error?.message||run.stderr);
const result=JSON.parse(run.stdout) as TessResponse;
assert.equal(result.stats.checks.geometry.status,'passed');
assert.equal(result.stats.checks.local.status,'passed');
assert.deepEqual([result.stats.vertices,result.stats.edges,result.stats.faces],[24,38,15]);
const key=tessConstructionKey(params),prepared=prepareTessResult(result,params);
const graph=tessFlatInput(prepared,prepared.doc,key,true).graph;
const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
const solved=recomputeFlatLayers(geometry);
assert.equal(solved.layers.status,'solved',solved.layers.message);
assert.equal(solved.layers.solutionCountExact,'1');
assert.equal(canAdoptTessWithTileLayers(prepared,false,key,params,solved.layers.status),true);
console.log(JSON.stringify({type:'UnitRegularPolygonCenteredTwistAltTile',
  example:'Origamica In[3010]',tiles:2,cp:{vertices:result.stats.vertices,
    edges:result.stats.edges,faces:result.stats.faces},flatGeometry:'ready',
  layerOrder:solved.layers.status,solutions:solved.layers.solutionCountExact,
  message:solved.layers.message}));
