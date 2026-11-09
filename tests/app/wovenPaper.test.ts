import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {canAdoptTessWithTileLayers,prepareTessResult,tessConstructionKey,tessPreset,type TessResponse} from '../../src/app/tessellation';

test('unverified paper extensions reject corrected woven CPs and cannot adopt a prior candidate',{timeout:30000},()=>{
 const cases=[];
 for(const weave of ['plain','basket','twill'] as const)
  for(const paper of [{shape:'square' as const,margin:.1},{shape:'rectangle' as const,aspect:1.5,margin:.1},{shape:'regular' as const,sides:6,margin:.1}])
   cases.push({...tessPreset('woven'),weave,paper});
 const code=`import sys,json
sys.path.insert(0,'backend')
from tessellate import generate
attempts=[]
for params in json.load(sys.stdin):
    try:
        attempts.append(generate(params))
    except ValueError as exc:
        attempts.append({'error':str(exc)})
print(json.dumps({'core':generate({'family':'woven'}),'attempts':attempts}))`;
 const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',code],{
   input:JSON.stringify(cases),encoding:'utf8',windowsHide:true,timeout:25000,maxBuffer:4*1024*1024,
   env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
 });
 assert.equal(run.status,0,run.stderr);
 const {core,attempts}=JSON.parse(run.stdout) as {core:TessResponse;attempts:{error?:string;fold?:unknown}[]};
 const original=tessPreset('woven'),prepared=prepareTessResult(core,original),key=tessConstructionKey(original);
 for(let i=0;i<cases.length;i++){
  const attempt=attempts[i],params=cases[i];
  assert.match(attempt.error??'',/盒褶编织.*沿用原边界/,`${params.weave} ${params.paper.shape}`);
  assert.equal(attempt.fold,undefined,'a rejected extension must not return partial or unverified creases');
  assert.equal(canAdoptTessWithTileLayers(null,false,tessConstructionKey(params),params,'solved'),false);
  assert.equal(canAdoptTessWithTileLayers(prepared,false,key,params,'solved'),false,
    'a valid prior core cannot be adopted for the unsupported paper parameters');
 }
});
