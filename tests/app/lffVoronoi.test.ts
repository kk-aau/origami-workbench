import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {prepareTessResult,type TessParams,type TessResponse} from '../../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../../src/app/tessellationFlat';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';

test('default Voronoi corrects BLB assignments and has an actual flat layer order',{timeout:30000},()=>{
  const params:TessParams={family:'nonperiodic',kind:'voronoi',count:9,seed:1,depth:2,angle:36,scale:.3};
  const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',"import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps(generate(json.load(sys.stdin))))"],{
    input:JSON.stringify(params),encoding:'utf8',windowsHide:true,
    env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},timeout:30000,
  });
  assert.equal(run.status,0,run.stderr);
  const response=JSON.parse(run.stdout) as TessResponse;
  assert.equal(response.stats.checks.geometry.status,'passed');
  assert.equal(response.stats.checks.local.status,'passed');
  assert.equal(response.stats.checks.lff?.status,'passed');
  assert.match(String(response.source.assignmentMethod),/BLB/);
  const source=prepareTessResult(response,params),input=tessFlatInput(source,source.doc,'lff-voronoi',true);
  const flat=recomputeFlatLayers(computeFlatGeometry(input.graph,2e-6,{startingFace:tessFlatRoot(input.graph)}));
  assert.equal(flat.geometry.status,'ready',flat.geometry.message);
  assert.equal(flat.layers.status,'solved',flat.layers.message);
});
