/** Saved In[3180]: centered pleat-angle twist on one ArchimedeanPatch[1]. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {modelOverlapRegions} from '../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../src/app/modelRegionLayers';
import {prepareTessResult,readTessParams,tessConstructionKey,
  type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';
import {archimedeanPatchIn3180Preset,archimedeanPatchParams}
  from '../src/app/archimedeanPatchSource';

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

// Backend direct source path bypasses workspace JSON dispatch and provenance.
const namedCode=[
  'import json,sys',
  "sys.path.insert(0,'backend')",
  'from tessellation_archimedean_patch_catalog import archimedean_patch',
  'from tessellation_lattice_patch import twist_patch_options',
  'from tessellation_meshes import polygon_mesh',
  'from tessellation_tile_patch import construct_tile_patch',
  'patch=archimedean_patch(1)',
  "twists=twist_patch_options(patch['sourceTiles'],[['M']*3,['V']*3],.2,variant='centered',tilt=70)",
  "mother=polygon_mesh(patch['sourceTiles'])",
  "fold=construct_tile_patch(mother,twists,mother['vertices_coords'],mother['faces_vertices'])",
  'print(json.dumps(fold))',
].join(';');
const named=runPython(['-c',namedCode]) as Cp;
const saved=archimedeanPatchParams(archimedeanPatchIn3180Preset());
const h=Math.sqrt(3)/2;
const expectedVertices:[number,number][]=[[0,0],[1,0],[.5,h],[1.5,h]];
const expectedFaces=[[0,1,2],[1,3,2]];
assert.deepEqual(saved.faces,expectedFaces);
saved.vertices.forEach((point,index)=>assert.ok(Math.hypot(
  point[0]-expectedVertices[index][0],point[1]-expectedVertices[index][1])<1e-11));
assert.deepEqual([saved.range1,saved.range2],[[0,0],[0,0]]);
assert.deepEqual(saved.tileTwists,[
  {width:.2,offset:0,tilt:70,centralTypes:['M','M','M']},
  {width:.2,offset:0,tilt:70,centralTypes:['V','V','V']},
]);
const params=readTessParams(JSON.parse(JSON.stringify(saved)));
assert.ok(params&&params.family==='custom');
assert.deepEqual(params.archimedeanPatch,archimedeanPatchIn3180Preset());
const {archimedeanPatch:_source,...request}=params;
const result=runPython([path.join(root,'backend','tessellate.py')],JSON.stringify(request)) as TessResponse;
assert.equal(result.stats.checks.geometry.status,'passed');
assert.equal(result.stats.checks.local.status,'passed');
assert.deepEqual([result.stats.vertices,result.stats.edges,result.stats.faces],[20,30,11]);
const cp=result.fold as Cp;
for(const field of ['edges_vertices','edges_assignment','edges_foldAngle','faces_vertices',
  'zhezhi_face_tile_instance','zhezhi_face_tile_source'] as const)
  assert.deepEqual(cp[field],named[field],`direct source CP differs at ${field}`);
let maximumCoordinateError=0;
cp.vertices_coords.forEach((point,index)=>{
  const error=Math.hypot(point[0]-named.vertices_coords[index][0],
    point[1]-named.vertices_coords[index][1]);
  maximumCoordinateError=Math.max(maximumCoordinateError,error);
  assert.ok(error<1e-8,`direct source CP vertex ${index} differs`);
});
const key=tessConstructionKey(params),prepared=prepareTessResult(result,params);
const graph=tessFlatInput(prepared,prepared.doc,key,true).graph;
const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
const layers=recomputeFlatLayers(geometry);
assert.equal(layers.layers.status,'solved',layers.layers.message);
assert.equal(layers.layers.solutionCountExact,'1');
const regionCounts:Record<string,number>={};
const regions=modelOverlapRegions(layers);
for(const side of ['front','back'] as const){
  const ordered=modelRegionLayers(layers,regions,side);
  assert.ok(ordered.every(region=>region.layers.status==='ordered'),
    `${side} region order incomplete`);
  regionCounts[side]=ordered.length;
}
assert.deepEqual(regionCounts,{front:261,back:261});
console.log(JSON.stringify({example:'In[3180]',scope:'one two-triangle patch',
  cp:{vertices:result.stats.vertices,edges:result.stats.edges,faces:result.stats.faces,
    maximumCoordinateError},flatGeometry:geometry.geometry.status,
  layerOrder:layers.layers.status,solutions:layers.layers.solutionCountExact,
  regionCounts,message:layers.layers.message}));
