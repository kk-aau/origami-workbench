import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {prepareTessResult,type TessParams,type TessResponse} from '../../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../../src/app/tessellationFlat';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';

// A local BLB repair is a necessary-condition correction, not a general Cairo
// layer-order algorithm. These two nearby examples prevent treating it as one.
test('Cairo local M/V repair solves one patch but not all nearby patches',{timeout:30000},()=>{
  const params:TessParams[]=[61,70].map(cairoAngle=>({
    family:'archimedean',tiling:'cairo',cairoAngle,repeatX:2,repeatY:2,
    cairoOutput:'twist',rings:1,angle:45,scale:.3,
  }));
  const code=`import sys,json,copy
sys.path.insert(0,'backend')
from tessellate import generate
from tessellation_advanced import assign_local_mv
from tessellation_lff import analyze_lff_graph
out=[]
for p in json.load(sys.stdin):
    result=generate(p)
    fixed=assign_local_mv(copy.deepcopy(result['fold']),preferred=result['fold']['edges_assignment'].copy())
    out.append({'result':result,'fixed':fixed,'fixedLff':analyze_lff_graph(fixed,geometry_status='passed')})
print(json.dumps(out))`;
  const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',code],{
    input:JSON.stringify(params),encoding:'utf8',windowsHide:true,
    env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},timeout:30000,
  });
  assert.equal(run.status,0,run.stderr);
  const cases=JSON.parse(run.stdout) as {result:TessResponse;fixed:TessResponse['fold'];fixedLff:{status:string}}[];
  const layers=(response:TessResponse,fold:unknown,param:TessParams)=>{
    const source=prepareTessResult({...response,fold},param),input=tessFlatInput(source,source.doc,'cairo-lff-check',true);
    const geometry=computeFlatGeometry(input.graph,2e-6,{startingFace:tessFlatRoot(input.graph)});
    assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
    return recomputeFlatLayers(geometry).layers.status;
  };
  for(let i=0;i<cases.length;i++){
    const item=cases[i];
    assert.equal(item.result.stats.checks.geometry.status,'passed');
    assert.equal(item.result.stats.checks.local.status,'passed');
    assert.equal(item.result.stats.checks.lff?.status,'failed');
    assert.equal(item.fixedLff.status,'passed');
    assert.equal(layers(item.result,item.result.fold,params[i]),'no-solution');
    assert.equal(layers(item.result,item.fixed,params[i]),i===1?'solved':'no-solution');
  }
});
