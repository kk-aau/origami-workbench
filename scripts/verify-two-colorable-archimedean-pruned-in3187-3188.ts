/** Whole-sheet audit of saved Origamica In[3187] and In[3188]. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {prepareTessResult,readTessParams,tessConstructionKey,tessPreset,
  type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const runPython=(input:string):TessResponse=>{
  const run=spawnSync(python,[path.join(root,'backend','tessellate.py')],{
    cwd:root,input,encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024,
    windowsHide:true,env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
  });
  assert.equal(run.status,0,run.error?.message||run.stderr);
  return JSON.parse(run.stdout) as TessResponse;
};
const base=tessPreset('custom');
assert.equal(base.family,'custom');
const square:[number,number][]=[[0,0],[1,0],[1,1],[0,1],[2,0],[2,1]];
const boundary:[number,number][]=[[.1,.1],[3.9,.1],[3.9,3.9],[.1,3.9]];
const cases=[
  {example:'In[3187] two-colorable centered Alt',tileTwists:[
    {width:.2,offset:0,angleMode:'twist' as const,twistAngle:30,
      centralTypes:['M','M','M','M'] as ('M'|'V')[]},
    {width:.2,offset:0,angleMode:'twist' as const,twistAngle:30,
      centralTypes:['V','V','V','V'] as ('M'|'V')[]}]},
  {example:'In[3188] two-colorable offset',tileTwists:[
    {width:.2,offset:.1001,tilt:90,centralTypes:['M','M','M','M'] as ('M'|'V')[]},
    {width:.2,offset:-.1001,tilt:90,centralTypes:['M','M','M','M'] as ('M'|'V')[]}]},
];
const output=[];
for(const item of cases){
  const params=readTessParams({...base,vertices:square,faces:[[0,1,2,3],[1,4,5,2]],
    repeatX:1,repeatY:1,lattice:[[2,0],[1,1]],range1:[-2,2],range2:[0,3],
    pruneBoundary:boundary,customOutput:'tile-twists',tileTwists:item.tileTwists,
    monolithicOptions:{mergedEdges:'delete',samePtTolerance:1e-8,
      collinearCleanup:true,collinearTolerance:1e-8}});
  assert.ok(params&&params.family==='custom');
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  const result=runPython(JSON.stringify(params));
  assert.deepEqual([result.stats.tiles,result.stats.vertices,result.stats.edges,
    result.stats.faces],[16,100,180,81]);
  assert.equal(result.stats.checks.geometry.status,'passed');
  assert.equal(result.stats.checks.local.status,'passed');
  const sourceIndices=(result.mother as {zhezhi_custom_face_index:number[]})
    .zhezhi_custom_face_index;
  assert.deepEqual([sourceIndices.filter(index=>index===0).length,
    sourceIndices.filter(index=>index===1).length],[8,8]);
  const key=tessConstructionKey(params),prepared=prepareTessResult(result,params);
  const graph=tessFlatInput(prepared,prepared.doc,key,true).graph;
  const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
  assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
  const layers=recomputeFlatLayers(geometry);
  output.push({example:item.example,sourceTiles:40,prunedTiles:16,
    cp:{vertices:result.stats.vertices,edges:result.stats.edges,
      faces:result.stats.faces},flatGeometry:geometry.geometry.status,
    layerOrder:layers.layers.status,solutions:layers.layers.solutionCountExact,
    faceOrderLength:layers.layers.faceOrder?.length,message:layers.layers.message});
}
console.log(JSON.stringify(output));
