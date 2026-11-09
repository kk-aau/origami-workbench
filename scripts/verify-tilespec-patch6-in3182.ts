/** In[3182] mixed named TileSpec source through the real CP/FF/layer pipeline. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {archimedeanPatchIn3182Preset,archimedeanPatchParams} from '../src/app/archimedeanPatchSource';
import {archimedeanPatch6TileSpecs} from '../src/app/tileSpecs';
import {changeTessParams,prepareTessResult,readTessParams,tessConstructionKey,type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {modelOverlapRegions} from '../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../src/app/modelRegionLayers';

const workspace=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(workspace,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const original=archimedeanPatchParams(archimedeanPatchIn3182Preset());
const specs=archimedeanPatch6TileSpecs(original.faces.map(face=>face.map(index=>original.vertices[index])));
assert.ok(specs);
const withSpecs=changeTessParams(original,{tileSpecs:specs});
assert.equal(withSpecs.family,'custom');
const restored=readTessParams(JSON.parse(JSON.stringify(withSpecs)));
assert.deepEqual(restored,withSpecs);
assert.equal(tessConstructionKey(withSpecs),tessConstructionKey(original));
const {tileSpecs:_tilespec,archimedeanPatch:_source,...request}=restored! as typeof original&{tileSpecs:unknown};
const processResult=spawnSync(python,[path.join(workspace,'backend','tessellate.py')],{
  cwd:workspace,input:JSON.stringify(request),encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,
  windowsHide:true,env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
});
assert.equal(processResult.status,0,processResult.error?.message||processResult.stderr);
const response=JSON.parse(processResult.stdout) as TessResponse;
assert.equal(response.stats.checks.geometry.status,'passed');
assert.equal(response.stats.checks.local.status,'passed');
assert.deepEqual([response.stats.vertices,response.stats.edges,response.stats.faces],[32,48,17]);
const prepared=prepareTessResult(response,withSpecs),key=tessConstructionKey(withSpecs);
const graph=tessFlatInput(prepared,prepared.doc,key,true).graph;
const computed=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
assert.equal(computed.geometry.status,'ready',computed.geometry.message);
let maximumFaceDistanceError=0;
for(const face of graph.faces_vertices??[])for(let i=0;i<face.length;i++)for(let j=i+1;j<face.length;j++){
  const a=face[i],b=face[j];
  const before=Math.hypot(graph.vertices_coords[a][0]-graph.vertices_coords[b][0],
    graph.vertices_coords[a][1]-graph.vertices_coords[b][1]);
  const after=Math.hypot(computed.geometry.vertices[a][0]-computed.geometry.vertices[b][0],
    computed.geometry.vertices[a][1]-computed.geometry.vertices[b][1]);
  maximumFaceDistanceError=Math.max(maximumFaceDistanceError,Math.abs(before-after));
}
assert.ok(maximumFaceDistanceError<1e-6,`face distance error ${maximumFaceDistanceError}`);
const solved=recomputeFlatLayers(computed);
assert.equal(solved.layers.status,'solved',solved.layers.message);
assert.equal(solved.layers.solutionCountExact,'1');
const regions=modelOverlapRegions(solved);
const count={front:0,back:0};
for(const side of ['front','back'] as const){
  const rows=modelRegionLayers(solved,regions,side);
  assert.ok(rows.every(row=>row.layers.status==='ordered'));
  count[side]=rows.length;
}
console.log(JSON.stringify({source:'In[3124–3126]/In[3182] numeric local reconstruction',
  namedTiles:specs!.map(spec=>spec.sides),joins:specs!.slice(1).map(spec=>spec.join),
  cp:[response.stats.vertices,response.stats.edges,response.stats.faces],
  geometry:response.stats.checks.geometry.status,local:response.stats.checks.local.status,
  flatGeometry:computed.geometry.status,maximumFaceDistanceError,
  layers:solved.layers.status,solutions:solved.layers.solutionCountExact,regions:count,
  projectRoundTrip:true}));
