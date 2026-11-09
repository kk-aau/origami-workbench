/** Workspace source, persistence, and adoption audit for saved In[3019]. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {canAdoptTessWithTileLayers,changeTessParams,prepareTessResult,
  readTessParams,tessConstructionKey,unitRegularCenteredParams,type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';
import {UNIT_REGULAR_OFFSET_TILE_TYPE,unitRegularOffsetPreset} from '../src/app/unitRegularCentered';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const backend=path.join(root,'backend','tessellate.py');
const preset=unitRegularOffsetPreset(),params=unitRegularCenteredParams(preset);
assert.equal(preset.tileType,UNIT_REGULAR_OFFSET_TILE_TYPE);
assert.deepEqual(preset.tiles.map(tile=>[tile.offset,tile.centralTypes.join('')]),
  [[.15,'VVVV'],[-.15,'VVVV']]);
assert.deepEqual(params.vertices,[[0,0],[1,0],[1,1],[0,1],[1,2],[0,2]]);
assert.deepEqual(params.faces,[[0,1,2,3],[3,2,4,5]]);
assert.deepEqual(params.tileTwists,[
  {width:.2,offset:.15,tilt:90,centralTypes:['V','V','V','V']},
  {width:.2,offset:-.15,tilt:90,centralTypes:['V','V','V','V']},
]);
assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
assert.equal(readTessParams({...params,unitRegularCentered:{...preset,
  tiles:[preset.tiles[0],{...preset.tiles[1],offset:-.16}]}}),null);
assert.equal(readTessParams({...params,unitRegularCentered:{...preset,
  tiles:[{...preset.tiles[0],centralTypes:['M','V','V','V']},preset.tiles[1]]}}),null);
assert.equal(readTessParams({...params,unitRegularCentered:{...preset,
  tiles:[preset.tiles[1],preset.tiles[0]]}}),null);
assert.equal(readTessParams({...params,unitRegularCentered:{...preset,tiles:[preset.tiles[0]]}}),null);
assert.equal(readTessParams({...params,tileTwists:[params.tileTwists![0],
  {...params.tileTwists![1],offset:-.16}]}),null);
assert.equal(readTessParams({...params,vertices:params.vertices.map((point,i)=>
  i===4?[point[0]+.01,point[1]]:point)}),null);
assert.equal(readTessParams({...params,monolithicOptions:{...params.monolithicOptions!,
  mergedEdges:'retain'}}),null);
assert.equal((changeTessParams(params,{tileTwists:params.tileTwists?.map(tile=>({...tile}))}) as typeof params).unitRegularCentered,undefined);
const unchangedOptions=changeTessParams(params,{monolithicOptions:{...params.monolithicOptions!}});
assert.equal(unchangedOptions.family,'custom');
assert.deepEqual(unchangedOptions.unitRegularCentered,preset);
const changedOptions=changeTessParams(params,{monolithicOptions:{...params.monolithicOptions!,mergedEdges:'retain'}});
assert.equal(changedOptions.family,'custom');
assert.equal(changedOptions.unitRegularCentered,undefined);
assert.ok(readTessParams(changedOptions));
const single=unitRegularCenteredParams({...preset,arrangement:'single',tiles:[preset.tiles[0]]});
assert.equal(single.faces.length,1);
assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(single))),single);
const twelve=unitRegularCenteredParams({...preset,sides:12,
  tiles:preset.tiles.map(tile=>({...tile,centralTypes:Array(12).fill('V')}))});
assert.equal(twelve.vertices.length,22);
assert.ok(readTessParams(twelve));
const project={metadata:{tessellation:{parameters:params}}};
assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(project)).metadata.tessellation.parameters),params);

const {unitRegularCentered:_source,tileDecorations:_decorations,tileSpecs:_specs,...request}=params;
assert.equal('unitRegularCentered' in request,false);
const run=spawnSync(python,[backend],{cwd:root,input:JSON.stringify(request),encoding:'utf8',
  timeout:30000,maxBuffer:4*1024*1024,windowsHide:true,
  env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
assert.equal(run.status,0,run.error?.message||run.stderr);
const response=JSON.parse(run.stdout) as TessResponse;
assert.equal(response.stats.checks.geometry.status,'passed');
assert.equal(response.stats.checks.local.status,'passed');
assert.deepEqual([response.stats.vertices,response.stats.edges,response.stats.faces],[24,38,15]);
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
  offsets:preset.tiles.map(tile=>tile.offset),types:preset.tiles.map(tile=>tile.centralTypes.join('')),
  cp:{vertices:response.stats.vertices,edges:response.stats.edges,faces:response.stats.faces},
  layerOrder:solved.layers.status,solutions:solved.layers.solutionCountExact,
  savedParameters:true,forgedSourceRejected:true}));
