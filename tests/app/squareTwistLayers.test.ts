import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {tessPreset,prepareTessResult,type TessResponse} from '../../src/app/tessellation';
import {tessFlatInput,type TessFlatInput} from '../../src/app/tessellationFlat';
import {computeTessFlatGeometry} from '../../src/app/tessellationFlatGeometry';
import {recomputeFlatLayers} from '../../src/core/flatFold';
import {computeModelSurface} from '../../src/app/modelSurfaceAnalysis';
import {hasCompleteModelSurface,modelRenderMode} from '../../src/app/modelRenderMode';
import {flatPresentation} from '../../src/app/flatPresentation';

test('default square twist fixes the assignment conflict without changing its geometry and produces certified paper on both sides',()=>{
 const legacy=JSON.parse(readFileSync(new URL('../fixtures/square-twist-legacy-layer-conflict.json',import.meta.url),'utf8')) as TessFlatInput;
 const legacyBefore=structuredClone(legacy);
 assert.equal(recomputeFlatLayers(computeTessFlatGeometry(legacy)).layers.status,'no-solution');
 const params=[tessPreset('twist'),{...tessPreset('twist'),angle:-36},{...tessPreset('twist'),scale:.35,offsetX:.1}];
 const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',"import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps([generate(p) for p in json.load(sys.stdin)]))"],{input:JSON.stringify(params),encoding:'utf8',windowsHide:true,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
 assert.equal(run.status,0,run.stderr);
 const responses=JSON.parse(run.stdout) as TessResponse[];
 responses.forEach((response,i)=>{
  const generated=prepareTessResult(response,params[i]);
  const input=tessFlatInput(generated,generated.doc,JSON.stringify(params[i]),true);
  if(i===0){
   for(const key of ['vertices_coords','edges_vertices','faces_vertices'] as const)assert.deepEqual(input.graph[key],legacy.graph[key]);
   assert.notDeepEqual(input.graph.edges_assignment,legacy.graph.edges_assignment);
  }
  const result=recomputeFlatLayers(computeTessFlatGeometry(input));
  assert.equal(result.geometry.status,'ready');
  assert.equal(result.layers.status,'solved',JSON.stringify({params:params[i],layers:result.layers}));
  for(const side of ['front','back'] as const){
   const reply=computeModelSurface({result,side,shadows:false});
   assert.equal(reply.status,'complete',JSON.stringify(reply));
   assert.ok(hasCompleteModelSurface(reply));
   assert.notEqual(modelRenderMode(result,flatPresentation(result,side,0).hasOrder,{xray:false,regionsReady:true}),'wire');
  }
 });
 assert.deepEqual(legacy,legacyBefore,'legacy projects must not be rewritten');
});
