/** Whole-workspace layer audit of saved In[3184]'s two-square offset patch. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {prepareTessResult,readTessParams,tessConstructionKey,tessPreset,
  type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';

type Cp={vertices_coords:[number,number][];edges_vertices:[number,number][];
  edges_assignment:string[];edges_foldAngle:(number|null)[];faces_vertices:number[][];
  zhezhi_face_tile_instance:number[];zhezhi_face_tile_source:number[]};
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const env={...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'};
const runPython=(args:string[],input?:string)=>{
  const run=spawnSync(python,args,{cwd:root,input,encoding:'utf8',timeout:30000,
    maxBuffer:4*1024*1024,windowsHide:true,env});
  assert.equal(run.status,0,run.error?.message||run.stderr);
  return JSON.parse(run.stdout);
};

// The named path obtains In[3160]'s two squares and ± parity from the source
// catalog, then constructs the joined CP without JSON dispatch.
const namedCode=[
  'import json,sys',
  "sys.path.insert(0,'backend')",
  'from tessellation_archimedean_patch_catalog import two_colorable_archimedean_patch',
  'from tessellation_lattice_patch import twist_patch_options',
  'from tessellation_meshes import polygon_mesh',
  'from tessellation_tile_patch import construct_tile_patch',
  'source=two_colorable_archimedean_patch(2)',
  "twists=twist_patch_options(source['sourceTiles'],[['M']*4,['M']*4],.2,variant='offset',offset=.1,parity=source['parity'])",
  "mother=polygon_mesh(source['sourceTiles'])",
  "fold=construct_tile_patch(mother,twists,mother['vertices_coords'],mother['faces_vertices'],{'mergedEdges':'delete','samePtTolerance':1e-8,'collinearCleanup':True,'collinearTolerance':1e-8})",
  'print(json.dumps(fold))',
].join(';');
const named=runPython(['-c',namedCode]) as Cp;

const base=tessPreset('custom');
assert.equal(base.family,'custom');
const vertices:[number,number][]=[[0,0],[1,0],[1,1],[0,1],[2,0],[2,1]];
const faces=[[0,1,2,3],[1,4,5,2]];
const tileTwists=[.1,-.1].map(offset=>({width:.2,offset,tilt:90,
  centralTypes:['M','M','M','M'] as ('M'|'V')[]}));
const params=readTessParams({...base,vertices,faces,repeatX:1,repeatY:1,
  customOutput:'tile-twists',tileTwists,
  monolithicOptions:{mergedEdges:'delete',samePtTolerance:1e-8,
    collinearCleanup:true,collinearTolerance:1e-8}});
assert.ok(params&&params.family==='custom');
assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
const result=runPython([path.join(root,'backend','tessellate.py')],JSON.stringify(params)) as TessResponse;
assert.equal(result.stats.checks.geometry.status,'passed');
assert.equal(result.stats.checks.local.status,'passed');
assert.deepEqual([result.stats.vertices,result.stats.edges,result.stats.faces],[24,38,15]);
const cp=result.fold as Cp;
for(const field of ['edges_vertices','edges_assignment','edges_foldAngle','faces_vertices',
  'zhezhi_face_tile_instance','zhezhi_face_tile_source'] as const){
  assert.deepEqual(cp[field],named[field],`named CP ${field} differs`);
}
assert.equal(cp.vertices_coords.length,named.vertices_coords.length);
let maximumCoordinateError=0;
cp.vertices_coords.forEach((point,index)=>{
  const error=Math.hypot(point[0]-named.vertices_coords[index][0],
    point[1]-named.vertices_coords[index][1]);
  maximumCoordinateError=Math.max(maximumCoordinateError,error);
  assert.ok(error<1e-8,`named CP vertex ${index} differs`);
});
const key=tessConstructionKey(params),prepared=prepareTessResult(result,params);
const graph=tessFlatInput(prepared,prepared.doc,key,true).graph;
const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
const layers=recomputeFlatLayers(geometry);
assert.equal(layers.layers.status,'solved',layers.layers.message);
assert.equal(layers.layers.solutionCountExact,'1');
console.log(JSON.stringify({example:'In[3184] single two-square source patch',
  cp:{vertices:result.stats.vertices,edges:result.stats.edges,faces:result.stats.faces,
    identity:'same topology/assignments/fold angles/face provenance; coordinates within 1e-8',
    maximumCoordinateError},flatGeometry:geometry.geometry.status,
  layerOrder:layers.layers.status,solutions:layers.layers.solutionCountExact,
  faceOrderLength:layers.layers.faceOrder?.length,
  message:layers.layers.message}));
