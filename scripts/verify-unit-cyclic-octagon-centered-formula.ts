/** Locally compose Origamica's n=8 mother and In[3041] centered tile formulas. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {modelOverlapRegions} from '../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../src/app/modelRegionLayers';
import {prepareTessResult,readTessParams,tessConstructionKey,unitCyclicSourceParams,
  type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';
import {unitCyclicCenteredPreset,unitCyclicHexagonCenteredPreset,
  unitCyclicOctagonCenteredPreset} from '../src/app/unitCyclicSource';

type Cp={vertices_coords:[number,number][];edges_vertices:[number,number][];
  edges_assignment:string[];edges_foldAngle:(number|null)[];faces_vertices:number[][];
  zhezhi_face_tile_instance?:number[];zhezhi_face_tile_source?:number[]};
type Named={fold:Cp;sourceTile:{inputAngles:number[];effectiveAngles:number[];
  zeroAlternationCenterAngles:number[];centerAngles:number[];
  alternatingAdjustment:number;vertices:[number,number][];
  centralTypes:string[];notebookFormulas:string[];
  savedOctagonNumericalOut:null;layerOrder:string;adoptable:boolean};
  closureError:number;checks:{geometry:{status:string};local:{status:string}}};
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const env={...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'};
const runPython=(args:string[],input?:string)=>{
  const run=spawnSync(python,args,{cwd:root,input,encoding:'utf8',timeout:30000,
    maxBuffer:4*1024*1024,windowsHide:true,env});
  assert.equal(run.status,0,run.error?.message||run.stderr);
  return JSON.parse(run.stdout);
};
const namedCode=[
  'import json,sys',
  "sys.path.insert(0,'backend')",
  'from tessellation_unit_cyclic_centered_octagon import formula_cyclic_centered_octagon_candidate',
  'print(json.dumps(formula_cyclic_centered_octagon_candidate()))',
].join(';');
const named=runPython(['-c',namedCode]) as Named;
assert.deepEqual(named.sourceTile.inputAngles,[140,135,135,135,130,135,0,0]);
assert.deepEqual(named.sourceTile.effectiveAngles,
  [140,135,135,135,130,135,135,135]);
assert.deepEqual(named.sourceTile.centralTypes,
  ['M','M','M','M','M','M','V','V']);
assert.deepEqual(named.sourceTile.notebookFormulas,
  ['In[357]','In[373]','In[378]','In[3041]']);
assert.equal(named.sourceTile.savedOctagonNumericalOut,null);
assert.equal(named.sourceTile.layerOrder,'not_checked');
assert.equal(named.sourceTile.adoptable,false);
for(const [actual,expected] of named.sourceTile.zeroAlternationCenterAngles.map(
  (actual,index)=>[actual,[40,50,40,50,50,40,50,40][index]] as const))
  assert.ok(Math.abs(actual-expected)<1e-8,'zero-alternation arc differs');
for(const [actual,expected] of named.sourceTile.centerAngles.map(
  (actual,index)=>[actual,[45,45,45,45,55,35,55,35][index]] as const))
  assert.ok(Math.abs(actual-expected)<1e-8,'side-constrained arc differs');
assert.ok(Math.abs(named.sourceTile.alternatingAdjustment-5)<1e-8);
assert.equal(named.checks.geometry.status,'passed');
assert.equal(named.checks.local.status,'passed');
assert.ok(named.closureError<1e-8);

const preset=unitCyclicOctagonCenteredPreset();
const params=readTessParams(unitCyclicSourceParams(preset));
assert.ok(params&&params.family==='custom');
assert.deepEqual(params.unitCyclic,preset);
assert.deepEqual(params.faces,[[0,1,2,3,4,5,6,7]]);
assert.deepEqual(params.tileTwists?.map(twist=>twist.centralTypes.join('')),
  ['MMMMMMVV']);
assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
let maxMotherCoordinateError=0;
params.vertices.forEach((point,index)=>{
  const expected=named.sourceTile.vertices[index];
  const error=Math.hypot(point[0]-expected[0],point[1]-expected[1]);
  maxMotherCoordinateError=Math.max(maxMotherCoordinateError,error);
  assert.ok(error<1e-8,`mother vertex ${index} differs`);
});
const alteredSource=structuredClone(params);
alteredSource.unitCyclic!.angles[0]=139;
assert.equal(readTessParams(alteredSource),null,'forged source metadata survived');
const alteredMesh=structuredClone(params);
alteredMesh.vertices[2][0]+=.01;
assert.equal(readTessParams(alteredMesh),null,'edited mesh retained source metadata');
for(const [legacy,faces] of [
  [unitCyclicCenteredPreset(),[[0,1,2,3],[4,2,1,5]]],
  [unitCyclicHexagonCenteredPreset(),[[0,1,2,3,4,5]]],
] as const){
  const checked=readTessParams(unitCyclicSourceParams(legacy));
  assert.ok(checked&&checked.family==='custom');
  assert.deepEqual(checked.faces,faces);
  assert.deepEqual(checked.unitCyclic,legacy);
}

const {unitCyclic:_source,...request}=params;
const response=runPython([path.join(root,'backend','tessellate.py')],
  JSON.stringify(request)) as TessResponse;
assert.equal(response.stats.checks.geometry.status,'passed');
assert.equal(response.stats.checks.local.status,'passed');
assert.deepEqual([response.stats.vertices,response.stats.edges,response.stats.faces],
  [32,48,17]);
const cp=response.fold as Cp;
assert.deepEqual(cp.zhezhi_face_tile_instance,
  Array(cp.faces_vertices.length).fill(0));
assert.deepEqual(cp.zhezhi_face_tile_source,
  Array(cp.faces_vertices.length).fill(0));
for(const field of ['edges_vertices','edges_assignment','edges_foldAngle',
  'faces_vertices'] as const)assert.deepEqual(cp[field],named.fold[field],
    `named CP ${field} differs`);
assert.equal(cp.vertices_coords.length,named.fold.vertices_coords.length);
let maxCpCoordinateError=0;
cp.vertices_coords.forEach((point,index)=>{
  const expected=named.fold.vertices_coords[index];
  const error=Math.hypot(point[0]-expected[0],point[1]-expected[1]);
  maxCpCoordinateError=Math.max(maxCpCoordinateError,error);
  assert.ok(error<1e-8,`named CP vertex ${index} differs`);
});

const key=tessConstructionKey(params),prepared=prepareTessResult(response,params);
const graph=tessFlatInput(prepared,prepared.doc,key,true).graph;
const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
const layers=recomputeFlatLayers(geometry);
assert.equal(layers.layers.status,'solved',layers.layers.message);
assert.equal(layers.layers.solutionCountExact,'1');
assert.deepEqual(layers.geometry,geometry.geometry);
assert.ok(layers.layers.faceOrders!.every(([a,b])=>
  a<graph.faces_vertices!.length&&b<graph.faces_vertices!.length));
const regions=modelOverlapRegions(layers),regionCounts={} as Record<'front'|'back',number>;
for(const side of ['front','back'] as const){
  const ordered=modelRegionLayers(layers,regions,side);
  assert.ok(ordered.length>0&&ordered.every(region=>region.layers.status==='ordered'),
    `${side} region order incomplete`);
  regionCounts[side]=ordered.length;
}
console.log(JSON.stringify({scope:'local n=8 formula-derived single tile',
  notebookFormulas:named.sourceTile.notebookFormulas,
  wolframOctagonNumericalOut:false,
  cp:{vertices:response.stats.vertices,edges:response.stats.edges,
    faces:response.stats.faces,maxMotherCoordinateError,maxCpCoordinateError},
  flatGeometry:geometry.geometry.status,layerOrder:layers.layers.status,
  solutions:layers.layers.solutionCountExact,regionCounts,
  message:layers.layers.message}));
