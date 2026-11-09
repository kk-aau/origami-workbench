/** In[3106] 2×2 mother lattice combined with In[3180]'s centered two-face recipe. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {modelOverlapRegions} from '../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../src/app/modelRegionLayers';
import {archimedeanPatchIn3180LatticePreset,archimedeanPatchParams}
  from '../src/app/archimedeanPatchSource';
import {prepareTessResult,readTessParams,tessConstructionKey,
  type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const params=readTessParams(JSON.parse(JSON.stringify(
  archimedeanPatchParams(archimedeanPatchIn3180LatticePreset()))));
assert.ok(params&&params.family==='custom');
assert.deepEqual([params.range1,params.range2],[[0,1],[0,1]]);
assert.deepEqual(params.tileTwists?.map(item=>item.centralTypes.join('')),['MMM','VVV']);
const {archimedeanPatch:_source,...request}=params;
const run=spawnSync(python,[path.join(root,'backend','tessellate.py')],{
  cwd:root,input:JSON.stringify(request),encoding:'utf8',timeout:30000,
  maxBuffer:8*1024*1024,windowsHide:true,
  env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
});
assert.equal(run.status,0,run.error?.message||run.stderr);
const result=JSON.parse(run.stdout) as TessResponse;
assert.equal(result.stats.checks.geometry.status,'passed');
assert.equal(result.stats.checks.local.status,'passed');
assert.deepEqual([result.stats.tiles,result.stats.vertices,result.stats.edges,result.stats.faces],
  [8,64,96,33]);
const expectedCells=[] as number[][],expectedSources=[] as number[];
for(const y of [0,1])for(const x of [0,1])for(const source of [0,1]){
  expectedCells.push([x,y]);expectedSources.push(source);
}
assert.deepEqual(result.mother.zhezhi_lattice_cells,expectedCells);
assert.deepEqual(result.mother.zhezhi_custom_face_index,expectedSources);
const key=tessConstructionKey(params),prepared=prepareTessResult(result,params);
const graph=tessFlatInput(prepared,prepared.doc,key,true).graph;
const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
const layers=recomputeFlatLayers(geometry);
assert.equal(layers.layers.status,'solved',layers.layers.message);
assert.equal(layers.layers.solutionCountExact,'1');
const regions=modelOverlapRegions(layers),regionCounts={} as Record<'front'|'back',number>;
for(const side of ['front','back'] as const){
  const ordered=modelRegionLayers(layers,regions,side);
  assert.ok(ordered.every(region=>region.layers.status==='ordered'),
    `${side} region order incomplete`);
  regionCounts[side]=ordered.length;
}
console.log(JSON.stringify({example:'In[3106]+In[3180]',scope:'2×2 eight-source seam',
  cp:{tiles:result.stats.tiles,vertices:result.stats.vertices,edges:result.stats.edges,
    faces:result.stats.faces},flatGeometry:geometry.geometry.status,
  layerOrder:layers.layers.status,solutions:layers.layers.solutionCountExact,
  regionCounts,message:layers.layers.message}));
