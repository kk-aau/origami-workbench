/** Bounded CP/layer audit of the six-tile source patch in saved In[3186]. */
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
import {archimedeanPatchIn3186Preset,archimedeanPatchParams}
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

// The Python source geometry follows the six saved JoinTiling triples.
// Construct its CP directly, without the generic JSON dispatcher.
const namedCode=[
  'import json,sys',
  "sys.path.insert(0,'backend')",
  'from test_tessellation_archimedean_patch8_lattice import source_patch8,SOURCE_TYPES,MONOLITHIC',
  'from tessellation_lattice_patch import twist_patch_options',
  'from tessellation_meshes import polygon_mesh',
  'from tessellation_tile_patch import construct_tile_patch',
  'patch=source_patch8()',
  "twists=twist_patch_options(patch,SOURCE_TYPES,.12,variant='centered-angle',angle=29)",
  'mother=polygon_mesh(patch)',
  "fold=construct_tile_patch(mother,twists,mother['vertices_coords'],mother['faces_vertices'],MONOLITHIC)",
  'print(json.dumps(fold))',
].join(';');
const named=runPython(['-c',namedCode]) as Cp;

// Independent analytic coordinates for ArchimedeanPatch[8]. Source face order
// follows the notebook's six tile specs, retaining each tile's first vertex.
const h=Math.sqrt(3)/2;
const vertices:[number,number][]=[
  [0,0],[1,0],[1,1],[0,1],[.5,-h],[.5+h,-h-.5],
  [1+h,-.5],[1.5+h,-h-.5],[1.5+2*h,-h],[1+2*h,0],
  [1+2*h,1],[1+h,1.5],
];
const faces=[[0,1,2,3],[4,1,0],[4,5,6,1],[5,7,6],[7,8,9,6],
  [1,6,9,10,11,2]];
const saved=archimedeanPatchParams(archimedeanPatchIn3186Preset());
assert.deepEqual(saved.faces,faces);
assert.deepEqual([saved.range1,saved.range2],[[0,0],[0,0]]);
saved.vertices.forEach((point,index)=>assert.ok(
  Math.hypot(point[0]-vertices[index][0],point[1]-vertices[index][1])<1e-11));
assert.deepEqual(saved.tileTwists?.map(option=>option.centralTypes.join('')),
  ['MMMM','VVV','MMMM','VVV','MMMM','VVVVVV']);
const params=readTessParams(JSON.parse(JSON.stringify(saved)));
assert.ok(params&&params.family==='custom');
assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
assert.deepEqual(params.archimedeanPatch,archimedeanPatchIn3186Preset());
const {archimedeanPatch:_source,...request}=params;
const result=runPython([path.join(root,'backend','tessellate.py')],JSON.stringify(request)) as TessResponse;
assert.equal(result.stats.checks.geometry.status,'passed');
assert.equal(result.stats.checks.local.status,'passed');
assert.deepEqual([result.stats.vertices,result.stats.edges,result.stats.faces],[54,88,35]);
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
const cross=(a:[number,number],b:[number,number])=>a[0]*b[1]-a[1]*b[0];
const concaveFaces=(coords:[number,number][],polygons:number[][])=>polygons.flatMap((face,index)=>{
  const turns=face.map((vertex,i)=>{
    const p=coords[vertex],q=coords[face[(i+1)%face.length]],
      r=coords[face[(i+2)%face.length]];
    const a:[number,number]=[q[0]-p[0],q[1]-p[1]];
    const b:[number,number]=[r[0]-q[0],r[1]-q[1]];
    return {value:cross(a,b),limit:1e-6*Math.max(Math.hypot(...a),Math.hypot(...b))};
  }).filter(turn=>Math.abs(turn.value)>turn.limit).map(turn=>turn.value);
  return turns.some(turn=>turn>0)&&turns.some(turn=>turn<0)?[index]:[];
});
const unfoldedConcave=concaveFaces(graph.vertices_coords as [number,number][],
  graph.faces_vertices??[]);
const foldedConcave=concaveFaces(geometry.geometry.vertices as [number,number][],
  geometry.geometry.faces);
assert.deepEqual(unfoldedConcave,[9,30]);
assert.deepEqual(foldedConcave,[9,30]);
const layers=recomputeFlatLayers(geometry);
assert.equal(layers.layers.status,'solved',layers.layers.message);
assert.equal(layers.layers.solutionCountExact,'1');
assert.deepEqual(layers.geometry,geometry.geometry);
assert.ok(layers.layers.faceOrders!.every(([a,b])=>a<geometry.geometry.faces.length&&b<geometry.geometry.faces.length));
const regions=modelOverlapRegions(layers);
const regionCounts={} as Record<'front'|'back',number>;
for(const side of ['front','back'] as const){
  const ordered=modelRegionLayers(layers,regions,side);
  assert.ok(ordered.every(region=>region.layers.status==='ordered'),`${side} region order incomplete`);
  regionCounts[side]=ordered.length;
}
console.log(JSON.stringify({example:'In[3186] source patch only',
  cp:{vertices:result.stats.vertices,edges:result.stats.edges,faces:result.stats.faces,
    identity:'same topology/assignments/fold angles/face provenance; coordinates within 1e-8',
    maximumCoordinateError},flatGeometry:geometry.geometry.status,
  layerOrder:layers.layers.status,solutions:layers.layers.solutionCountExact,
  unfoldedConcave,foldedConcave,regionCounts,message:layers.layers.message}));
