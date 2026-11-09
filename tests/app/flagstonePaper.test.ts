import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {canAdoptTessWithTileLayers,prepareTessResult,tessConstructionKey,tessPreset,type TessGraph,type TessResponse} from '../../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../../src/app/tessellationFlat';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';

test('flagstone paper extends complete molecules while preserving its interior core',{timeout:60000},()=>{
 for(const paper of [{shape:'square' as const,margin:.1},{shape:'rectangle' as const,aspect:1.5,margin:.1},{shape:'regular' as const,sides:6,margin:.1}]){
  const params={...tessPreset('flagstone'),paper};
  const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',"import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps(generate(json.load(sys.stdin))))"],{
    input:JSON.stringify(params),encoding:'utf8',windowsHide:true,timeout:50000,maxBuffer:30*1024*1024,
    env:{...process.env,OPENBLAS_NUM_THREADS:'1'},
  });
  assert.equal(run.status,0,run.stderr);
  const response=JSON.parse(run.stdout) as TessResponse;
  assert.equal(response.source.paperMethod,'extended-pattern-clip-v1');
  assert.equal(response.stats.checks.geometry.status,'passed');
  assert.equal(response.stats.checks.local.status,'passed');
  const fold=response.fold as TessGraph;
  assert.ok(fold.faces_vertices.length>113);
  const result=prepareTessResult(response,params);
  const input=tessFlatInput(result,result.doc,'flagstone-paper',true);
  const geometry=computeFlatGeometry(input.graph,2e-6,{startingFace:tessFlatRoot(input.graph)});
  assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
  const layers=recomputeFlatLayers(geometry);
  assert.equal(layers.layers.status,'solved',`${paper.shape}: ${layers.layers.message}`);
  assert.equal(canAdoptTessWithTileLayers(result,false,tessConstructionKey(params),params,layers.layers.status),true);
 }
});
