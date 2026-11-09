/** Full-pipeline layer audit for Origamica's saved In[3019] offset square pair. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {prepareTessResult,readTessParams,tessConstructionKey,tessPreset,
  type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const backend=path.join(root,'backend','tessellate.py');
const base=tessPreset('custom');
assert.equal(base.family,'custom');
const tile=(offset:number)=>({width:.2,offset,tilt:90,
  centralTypes:['V','V','V','V'] as ('M'|'V')[]});
const params=readTessParams({...base,
  vertices:[[0,0],[1,0],[1,1],[0,1],[1,2],[0,2]],
  faces:[[0,1,2,3],[3,2,4,5]],repeatX:1,repeatY:1,
  customOutput:'tile-twists',tileTwists:[tile(.15),tile(-.15)],
  monolithicOptions:{mergedEdges:'delete',samePtTolerance:1e-8,
    collinearCleanup:true,collinearTolerance:1e-8}});
assert.ok(params&&params.family==='custom');
const env={...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'};
const run=spawnSync(python,[backend],{cwd:root,input:JSON.stringify(params),
  encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,windowsHide:true,env});
assert.equal(run.status,0,run.error?.message||run.stderr);
const result=JSON.parse(run.stdout) as TessResponse;
assert.equal(result.stats.checks.geometry.status,'passed');
assert.equal(result.stats.checks.local.status,'passed');
assert.deepEqual([result.stats.vertices,result.stats.edges,result.stats.faces],[24,38,15]);
// Verify that the production pipeline evaluates the independently named CP.
const named=spawnSync(python,['-c',
  "import json,sys;sys.path.insert(0,'backend');from tessellation_unit_regular_offset import original_regular_offset_pair;print(json.dumps(original_regular_offset_pair()['fold']))"],
  {cwd:root,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,windowsHide:true,env});
assert.equal(named.status,0,named.error?.message||named.stderr);
type Cp={vertices_coords:[number,number][];edges_vertices:[number,number][];
  edges_assignment:string[];faces_vertices:number[][]};
const sourceCp=JSON.parse(named.stdout) as Cp;
const pipelineCp=result.fold as Cp;
assert.deepEqual(pipelineCp.edges_vertices,sourceCp.edges_vertices);
assert.deepEqual(pipelineCp.edges_assignment,sourceCp.edges_assignment);
assert.deepEqual(pipelineCp.faces_vertices,sourceCp.faces_vertices);
assert.equal(pipelineCp.vertices_coords.length,sourceCp.vertices_coords.length);
pipelineCp.vertices_coords.forEach((point,index)=>{
  assert.ok(Math.hypot(point[0]-sourceCp.vertices_coords[index][0],
    point[1]-sourceCp.vertices_coords[index][1])<1e-8,`CP vertex ${index} differs`);
});
const key=tessConstructionKey(params),prepared=prepareTessResult(result,params);
const graph=tessFlatInput(prepared,prepared.doc,key,true).graph;
const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
const solved=recomputeFlatLayers(geometry);
assert.equal(solved.layers.status,'solved',solved.layers.message);
assert.equal(solved.layers.solutionCountExact,'1');
console.log(JSON.stringify({type:'UnitRegularPolygonOffsetTwistTile',example:'In[3019]',
  cp:{vertices:result.stats.vertices,edges:result.stats.edges,faces:result.stats.faces},
  flatGeometry:geometry.geometry.status,layerOrder:solved.layers.status,
  solutions:solved.layers.solutionCountExact,message:solved.layers.message}));
