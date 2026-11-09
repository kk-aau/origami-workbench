import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {brocardPreset,BROCARD_NAMES,type BrocardKind} from '../../src/app/brocardParams';
import {readTessParams,prepareTessResult,type TessResponse} from '../../src/app/tessellation';
import {computeFlatFold} from '../../src/core/flatFold';

test('Brocard parameter variants preserve edited values and reject stale fields and invalid geometry',()=>{
  for(const kind of Object.keys(BROCARD_NAMES) as BrocardKind[]){
    const initial=brocardPreset(kind),p={...initial,...('scale' in initial?{scale:.6}:{}),clockwise:true};
    assert.deepEqual(readTessParams(p),p);
    assert.equal(readTessParams({...p,angle:45}),null);
  }
  assert.deepEqual(readTessParams({...brocardPreset('angles'),angles:[65,120,100,0]}),{...brocardPreset('angles'),angles:[65,120,100,75]});
  for(const patch of [{clockwise:1},{scale:NaN},{angle1:170,angle2:50},{kind:'cyclic',index1:0,index2:0},{kind:'triangle-vertices',vertices:[[0,0],[1,1],[2,2]]}])assert.equal(readTessParams({...brocardPreset(),...patch}),null);
});

test('all Brocard variants reach consistent flat geometry and a valid layer order in both directions',()=>{
  const params=(Object.keys(BROCARD_NAMES) as BrocardKind[]).flatMap(kind=>[false,true].map(clockwise=>({...brocardPreset(kind),clockwise})));
  const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',"import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps([generate(p) for p in json.load(sys.stdin)]))"],{input:JSON.stringify(params),encoding:'utf8',windowsHide:true,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},timeout:30000});
  assert.equal(run.status,0,run.stderr);
  (JSON.parse(run.stdout) as TessResponse[]).forEach((response,i)=>{
    const result=prepareTessResult(response,params[i]),folded=computeFlatFold(result.doc);
    assert.equal(folded.geometry.status,'ready',JSON.stringify(params[i]));
    assert.equal(folded.layers.status,'solved',JSON.stringify(params[i])+JSON.stringify(folded.layers));
    assert.deepEqual(readTessParams((result.doc.metadata?.tessellation as {parameters:unknown}).parameters),params[i]);
  });
});
