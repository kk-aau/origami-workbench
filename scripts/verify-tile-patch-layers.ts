import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import type {FoldGraph} from '../src/core/types';
import {canAdoptTessWithTileLayers,defaultTileTwists,prepareTessResult,readTessParams,tessConstructionKey,tessPreset,type TessParams,type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const backend=path.join(root,'backend','tessellate.py');

function generate(params:TessParams){
  const run=spawnSync(python,[backend],{
    cwd:root,input:JSON.stringify(params),encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,
    windowsHide:true,env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
  });
  assert.equal(run.status,0,run.error?.message||run.stderr);
  return JSON.parse(run.stdout) as TessResponse;
}

const base=tessPreset('custom');
assert.equal(base.family,'custom');
const twists=defaultTileTwists(base.faces);
assert.deepEqual(twists.map(t=>t.centralTypes[0]),['M','V','V','M']);
const params=readTessParams({...base,customOutput:'tile-twists',tileTwists:twists});
assert.ok(params&&params.family==='custom');
assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params,'saved per-tile assignments survive reload');

for(const repetitions of [1,2]){
  const input={...params,repeatX:repetitions,repeatY:repetitions};
  const result=generate(input);
  assert.equal(result.stats.tiles,4*repetitions*repetitions);
  assert.equal(result.stats.checks.geometry.status,'passed');
  assert.equal(result.stats.checks.local.status,'passed');
  const source=result.source as {foldedForm:number[][];closureError:number},fold=result.fold as FoldGraph;
  assert.equal(source.foldedForm.length,fold.vertices_coords.length);
  assert.ok(source.closureError<1e-8);
  const prepared=prepareTessResult(result,input),key=tessConstructionKey(input);
  const graph=tessFlatInput(prepared,prepared.doc,key,true).graph;
  const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
  assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
  const solved=recomputeFlatLayers(geometry);
  assert.equal(solved.layers.status,'solved',`${repetitions}×${repetitions} patch: ${solved.layers.message}`);
  assert.equal(solved.layers.solutionCountExact,'1');
  assert.equal(canAdoptTessWithTileLayers(prepared,false,key,input,solved.layers.status),true);
  console.log(`tile patch ${result.stats.tiles} tiles / ${result.stats.faces} faces: global layer order solved`);
}

// The old all-M default passes local checks and closes geometrically, but has
// no global layer solution. Keep this distinction visible in the regression.
const allMParams={...params,tileTwists:twists.map(tile=>({...tile,centralTypes:tile.centralTypes.map(()=> 'M' as const)}))};
const allM=generate(allMParams);
assert.equal(allM.stats.checks.local.status,'passed');
assert.ok((allM.source as {closureError:number}).closureError<1e-8);
const prepared=prepareTessResult(allM,allMParams),key=tessConstructionKey(allMParams);
const graph=tessFlatInput(prepared,prepared.doc,key,true).graph;
const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
assert.equal(geometry.geometry.status,'ready');
assert.equal(recomputeFlatLayers(geometry).layers.status,'no-solution');
assert.equal(canAdoptTessWithTileLayers(prepared,false,key,allMParams,'no-solution'),false);
console.log('tile patch all-M control: local geometry passes, global layer order rejected');

for(const [types,expected] of [
  [['V','M','M','M'],'solved'],
  [['M','M','V','V'],'no-solution'],
] as const){
  const mixed=readTessParams({...base,vertices:[[0,0],[1,0],[1.1,1.4],[-.2,1],[.5,-Math.sqrt(3)/2]],
    faces:[[0,1,2,3],[1,0,4]],repeatX:1,repeatY:1,customOutput:'tile-twists',tileTwists:[
      {width:.15,offset:0,tilt:70,centralTypes:types,construction:'split',baseVertex:1,connection:'M',ccw:true},
      {width:.15,offset:0,tilt:110,centralTypes:['M','M','M']},
    ]});
  assert.ok(mixed&&mixed.family==='custom');
  const mixedResult=generate(mixed),mixedPrepared=prepareTessResult(mixedResult,mixed),mixedKey=tessConstructionKey(mixed);
  const mixedGraph=tessFlatInput(mixedPrepared,mixedPrepared.doc,mixedKey,true).graph;
  const mixedGeometry=computeFlatGeometry(mixedGraph,1e-6,{startingFace:tessFlatRoot(mixedGraph)});
  assert.equal(mixedGeometry.geometry.status,'ready',mixedGeometry.geometry.message);
  const mixedLayers=recomputeFlatLayers(mixedGeometry);
  assert.equal(mixedLayers.layers.status,expected,
    `mixed split + triangle ${types.join('')}: ${mixedLayers.layers.message}`);
  assert.equal(canAdoptTessWithTileLayers(mixedPrepared,false,mixedKey,mixed,mixedLayers.layers.status),expected==='solved');
  console.log(`mixed split + triangle ${types.join('')}: ${expected} global layer order`);
}
