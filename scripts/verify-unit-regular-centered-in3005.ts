/** Full-pipeline check of stable Origamica UnitRegularPolygonCenteredTwistTile In[3005]. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {canAdoptTessWithTileLayers,prepareTessResult,readTessParams,
  tessConstructionKey,tessPreset,type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';
import {modelOverlapRegions} from '../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../src/app/modelRegionLayers';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const backend=path.join(root,'backend','tessellate.py');
const base=tessPreset('custom');
assert.equal(base.family,'custom');
const tile={width:.2,offset:0,tilt:70,centralTypes:['M','M','V','V'] as ('M'|'V')[]};
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
assert.equal(result.stats.faces,15);
const key=tessConstructionKey(params),prepared=prepareTessResult(result,params);
const graph=tessFlatInput(prepared,prepared.doc,key,true).graph;
const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
const solved=recomputeFlatLayers(geometry);
assert.equal(solved.layers.status,'solved',solved.layers.message);
assert.equal(solved.layers.solutionCountExact,'1');
assert.ok(solved.layers.faceOrder);
assert.equal(canAdoptTessWithTileLayers(prepared,false,key,params,solved.layers.status),true);
const regions=modelOverlapRegions(solved);
const visible=(side:'front'|'back')=>{
  const local=modelRegionLayers(solved,regions,side);
  assert.ok(local.every(region=>region.layers.status==='ordered'));
  return [...new Set(local.map(region=>region.layers.status==='ordered'
    ? region.layers.topToBottom[0]:-1))].sort((a,b)=>a-b);
};
const front=visible('front'),back=visible('back');
assert.deepEqual(front,[0,2,4,6,8,9,10,11,12,13,14]);
assert.deepEqual(back,[0,1,2,3,4,6,7,8,10,12,14]);
console.log(JSON.stringify({type:'UnitRegularPolygonCenteredTwistTile',
  example:'Origamica In[3005]',tiles:2,cp:{vertices:result.stats.vertices,
    edges:result.stats.edges,faces:result.stats.faces},flatGeometry:'ready',
  layerOrder:solved.layers.status,solutions:solved.layers.solutionCountExact,
  visibleFaces:{front,back},overlapCells:regions.cells.length}));
