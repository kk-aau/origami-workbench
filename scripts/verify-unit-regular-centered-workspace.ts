/** The named Origamica source round-trips through the existing custom tile patch. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {canAdoptTessWithTileLayers,changeTessParams,prepareTessResult,
  readTessParams,tessConstructionKey,unitRegularCenteredParams,type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';
import {UNIT_REGULAR_CENTERED_TILE_TYPE,unitRegularCenteredAltPreset,
  unitRegularCenteredPleatAngle,unitRegularCenteredPreset} from '../src/app/unitRegularCentered';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const backend=path.join(root,'backend','tessellate.py');
const preset=unitRegularCenteredPreset();
const params=unitRegularCenteredParams(preset);
assert.deepEqual(params.vertices,[[0,0],[1,0],[1,1],[0,1],[1,2],[0,2]]);
assert.deepEqual(params.faces,[[0,1,2,3],[3,2,4,5]]);
assert.deepEqual(params.tileTwists,[
  {width:.2,offset:0,tilt:70,centralTypes:['M','M','V','V']},
  {width:.2,offset:0,tilt:70,centralTypes:['M','M','V','V']},
]);
assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
assert.equal(readTessParams({...params,vertices:params.vertices.map((point,i)=>i===4?[point[0]+.01,point[1]]:point)}),null);
assert.equal(readTessParams({...params,tileTwists:[{...params.tileTwists![0],tilt:71},params.tileTwists![1]]}),null);
assert.equal(changeTessParams(params,{tileTwists:params.tileTwists?.map(tile=>({...tile}))}).family,'custom');
assert.equal((changeTessParams(params,{tileTwists:params.tileTwists?.map(tile=>({...tile}))}) as typeof params).unitRegularCentered,undefined);
assert.equal((changeTessParams(params,{monolithicOptions:{...params.monolithicOptions!,mergedEdges:'retain'}}) as typeof params).unitRegularCentered,undefined);

const single=unitRegularCenteredParams({...preset,arrangement:'single'});
assert.deepEqual(single.faces,[[0,1,2,3]]);
assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(single))),single);
const twelve=unitRegularCenteredParams({...preset,sides:12,centralTypes:Array.from({length:12},(_,i)=>i%4<2?'M':'V')});
assert.equal(twelve.faces.length,2);
assert.equal(twelve.vertices.length,22);
assert.ok(readTessParams(twelve));

// A project stores params, including the source marker. The backend receives
// exactly the established custom tile-twists contract.
const project={metadata:{tessellation:{parameters:params}}};
assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(project)).metadata.tessellation.parameters),params);
const {unitRegularCentered:_source,tileDecorations:_display,tileSpecs:_specs,...request}=params;
const run=spawnSync(python,[backend],{cwd:root,input:JSON.stringify(request),encoding:'utf8',timeout:30000,
  maxBuffer:4*1024*1024,windowsHide:true,
  env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
assert.equal(run.status,0,run.error?.message||run.stderr);
const response=JSON.parse(run.stdout) as TessResponse;
assert.equal(response.stats.checks.geometry.status,'passed');
assert.equal(response.stats.checks.local.status,'passed');
assert.equal(response.stats.faces,15);
const key=tessConstructionKey(params),prepared=prepareTessResult(response,params);
const graph=tessFlatInput(prepared,prepared.doc,key,true).graph;
const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
assert.equal(geometry.geometry.status,'ready');
const solved=recomputeFlatLayers(geometry);
assert.equal(solved.layers.status,'solved',solved.layers.message);
assert.equal(solved.layers.solutionCountExact,'1');
assert.equal(canAdoptTessWithTileLayers(prepared,false,key,params,solved.layers.status),true);
for(const status of [undefined,'checking','unconfirmed','no-solution','invalid'])
  assert.equal(canAdoptTessWithTileLayers(prepared,false,key,params,status),false);
console.log(JSON.stringify({source:preset.tileType,arrangement:preset.arrangement,
  savedParameters:true,backendOutput:'tile-twists',faces:response.stats.faces,
  globalLayerOrder:solved.layers.status,solutions:solved.layers.solutionCountExact}));

const altPreset=unitRegularCenteredAltPreset(),alt=unitRegularCenteredParams(altPreset);
assert.deepEqual(alt.vertices,params.vertices);
assert.deepEqual(alt.faces,params.faces);
assert.deepEqual(alt.tileTwists,[
  {width:.2,offset:0,angleMode:'twist',twistAngle:30,centralTypes:['M','M','V','V']},
  {width:.2,offset:0,angleMode:'twist',twistAngle:30,centralTypes:['M','M','V','V']},
]);
assert.ok(Math.abs(unitRegularCenteredPleatAngle(altPreset)-70.89339464913091)<1e-10);
assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(alt))),alt);
assert.equal(readTessParams({...alt,unitRegularCentered:{...altPreset,twistAngle:31}}),null);
assert.equal(readTessParams({...alt,unitRegularCentered:{...altPreset,arrangement:'in3005-pair'}}),null);
assert.equal(readTessParams({...alt,unitRegularCentered:{...altPreset,twistAngle:90}}),null);
assert.equal(readTessParams({...alt,unitRegularCentered:{...altPreset,tileType:UNIT_REGULAR_CENTERED_TILE_TYPE,pleatAngle:70}}),null);
assert.equal(readTessParams({...alt,tileTwists:[{...alt.tileTwists![0],twistAngle:31},alt.tileTwists![1]]}),null);
assert.equal(readTessParams({...alt,monolithicOptions:{...alt.monolithicOptions!,mergedEdges:'retain'}}),null);
const altProject={metadata:{tessellation:{parameters:alt}}};
assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(altProject)).metadata.tessellation.parameters),alt);
const {unitRegularCentered:_altSource,tileDecorations:_altDisplay,tileSpecs:_altSpecs,...altRequest}=alt;
const altRun=spawnSync(python,[backend],{cwd:root,input:JSON.stringify(altRequest),encoding:'utf8',timeout:30000,
  maxBuffer:4*1024*1024,windowsHide:true,
  env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
assert.equal(altRun.status,0,altRun.error?.message||altRun.stderr);
const altResponse=JSON.parse(altRun.stdout) as TessResponse;
assert.equal(altResponse.stats.checks.geometry.status,'passed');
assert.equal(altResponse.stats.checks.local.status,'passed');
assert.deepEqual([altResponse.stats.vertices,altResponse.stats.edges,altResponse.stats.faces],[24,38,15]);
const altKey=tessConstructionKey(alt),altPrepared=prepareTessResult(altResponse,alt);
const altGraph=tessFlatInput(altPrepared,altPrepared.doc,altKey,true).graph;
const altGeometry=computeFlatGeometry(altGraph,1e-6,{startingFace:tessFlatRoot(altGraph)});
assert.equal(altGeometry.geometry.status,'ready');
const altSolved=recomputeFlatLayers(altGeometry);
assert.equal(altSolved.layers.status,'solved',altSolved.layers.message);
assert.equal(altSolved.layers.solutionCountExact,'1');
assert.equal(canAdoptTessWithTileLayers(altPrepared,false,altKey,alt,altSolved.layers.status),true);
for(const status of [undefined,'checking','unconfirmed','no-solution','invalid'])
  assert.equal(canAdoptTessWithTileLayers(altPrepared,false,altKey,alt,status),false);
console.log(JSON.stringify({source:altPreset.tileType,arrangement:altPreset.arrangement,
  savedParameters:true,backendOutput:'tile-twists',cp:{vertices:24,edges:38,faces:15},
  globalLayerOrder:altSolved.layers.status,solutions:altSolved.layers.solutionCountExact}));
