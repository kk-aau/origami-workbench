/** Full-sheet flat-fold audit of saved In[3186], without inventing a layer order. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {modelOverlapRegions} from '../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../src/app/modelRegionLayers';
import {prepareTessResult,tessPreset,type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const code=[
  'import json,sys',
  "sys.path.insert(0,'backend')",
  'from tessellation_archimedean_patch8_in3186 import build_archimedean_patch8_in3186',
  'print(json.dumps(build_archimedean_patch8_in3186(),allow_nan=False))',
].join(';');
const run=spawnSync(python,['-c',code],{cwd:root,encoding:'utf8',timeout:30000,
  maxBuffer:8*1024*1024,windowsHide:true,
  env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
assert.equal(run.status,0,run.error?.message||run.stderr);
const audited=JSON.parse(run.stdout) as {
  counts:{sourceTiles:number;retainedTiles:number;vertices:number;edges:number;faces:number};
  checks:{geometry:{status:string};local:{status:string}};
  fold:TessResponse['fold'];mother:NonNullable<TessResponse['mother']>;
};
assert.deepEqual(audited.counts,{sourceTiles:120,retainedTiles:21,
  vertices:152,edges:260,faces:109});
assert.equal(audited.checks.geometry.status,'passed');
assert.equal(audited.checks.local.status,'passed');
const params=tessPreset('custom');
const response={fold:audited.fold,mother:audited.mother,warnings:[],
  source:{output:'tile-twists',savedNotebookCell:'In[3186]'},
  stats:{...audited.counts,tiles:audited.counts.retainedTiles,
    checks:audited.checks}} as TessResponse;
const prepared=prepareTessResult(response,params);
const graph=tessFlatInput(prepared,prepared.doc,'saved-in3186',true).graph;
const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
const topology=geometry.geometry.graph!;
let topologyHash=0xcbf29ce484222325n;
for(const code of JSON.stringify([topology.edges_vertices,topology.edges_assignment,
  topology.faces_vertices])){
  topologyHash=BigInt.asUintN(64,(topologyHash^BigInt(code.charCodeAt(0)))*0x100000001b3n);
}
const layers=recomputeFlatLayers(geometry);
let visibleRegions:null|{front:number;back:number;allOrdered:boolean}=null;
if(layers.layers.status==='solved'){
  const regions=modelOverlapRegions(layers);
  const front=modelRegionLayers(layers,regions,'front');
  const back=modelRegionLayers(layers,regions,'back');
  visibleRegions={front:front.length,back:back.length,
    allOrdered:[...front,...back].every(region=>region.layers.status==='ordered')};
  assert.ok(visibleRegions.allOrdered,'A solved sheet must order both sides.');
}
console.log(JSON.stringify({example:'Origamica In[3186] full pruned sheet',
  sourceTiles:audited.counts.sourceTiles,retainedTiles:audited.counts.retainedTiles,
  cp:{vertices:audited.counts.vertices,edges:audited.counts.edges,
    faces:audited.counts.faces},geometry:geometry.geometry.status,
  topologyHash:topologyHash.toString(16),
  triangleCount:geometry.geometry.faces.reduce((sum,face)=>sum+face.length-2,0),
  layerOrder:layers.layers.status,solutionCountExact:layers.layers.solutionCountExact??null,
  visibleRegions,layerMessage:layers.layers.message}));
