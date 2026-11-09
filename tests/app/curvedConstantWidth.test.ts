import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CONSTANT_WIDTH_END,CONSTANT_WIDTH_PRESET,constantWidthAt,
  fetchConstantWidth,fetchConstantWidthWhenIdle,
  parseConstantWidthResult,validateConstantWidthQuery,
  type ConstantWidthQuery} from '../../src/app/curvedConstantWidth';

function backendResponse(query:ConstantWidthQuery){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  const code='import json,sys;sys.path.insert(0,"backend");'+
    'from tessellation_curved_constant_width_query import query_constant_width_circle;'+
    'print(json.dumps(query_constant_width_circle(json.load(sys.stdin))))';
  const run=spawnSync(python,['-c',code],{cwd:root,input:JSON.stringify(query),
    encoding:'utf8',windowsHide:true,timeout:30000,
    env:{...process.env,PYTHONUTF8:'1'}});
  assert.equal(run.status,0,run.stderr||String(run.error));
  return JSON.parse(run.stdout);
}

test('saved circle family accepts a finite width and bounded resampling only',()=>{
  assert.deepEqual(validateConstantWidthQuery({family:CONSTANT_WIDTH_PRESET.family}),
    CONSTANT_WIDTH_PRESET);
  for(const value of [null,{},[],{...CONSTANT_WIDTH_PRESET,formula:'Sin[u]'},
    {...CONSTANT_WIDTH_PRESET,width:true},{...CONSTANT_WIDTH_PRESET,width:'0.1'},
    {...CONSTANT_WIDTH_PRESET,width:NaN},{...CONSTANT_WIDTH_PRESET,width:.11},
    {...CONSTANT_WIDTH_PRESET,segments:257},{...CONSTANT_WIDTH_PRESET,segments:16.5}])
    assert.throws(()=>validateConstantWidthQuery(value));
});

test('real backend response verifies every branch point and unextended foot',()=>{
  const query={...CONSTANT_WIDTH_PRESET,segments:32};
  const result=parseConstantWidthResult(backendResponse(query),query);
  const sample=result.sample;
  assert.equal(sample.parameterValues.length,33);
  assert.equal(result.source.actualEquationUsesUnextendedCurve,true);
  assert.equal(result.source.declaredTangentExtensionUnused,true);
  assert.equal(result.source.machineReadableWolframOut,false);
  assert.equal(result.certification.sampledBandExactFOLD,false);
  assert.equal(result.certification.adoptableCreasePattern,false);
  assert.ok(result.diagnostic.leftEndFootParameter>CONSTANT_WIDTH_END);
  assert.ok(result.diagnostic.rightEndFootParameter<CONSTANT_WIDTH_END);
  assert.ok(result.diagnostic.actualCircleEndpointWidth-
    result.diagnostic.unusedTangentEndpointWidth>.1);
  assert.ok(Math.abs(sample.leftWidthValues[0]-.1)<1e-12);
  assert.ok(Math.abs(sample.rightWidthValues[0]+.1)<1e-12);
  assert.deepEqual(sample.leftBoundary[16],constantWidthAt(CONSTANT_WIDTH_END/2,.1).point);
});

test('response readback rejects provenance, engineering overclaim and changed geometry',()=>{
  const query={...CONSTANT_WIDTH_PRESET,segments:16},raw=backendResponse(query);
  assert.throws(()=>parseConstantWidthResult({...raw,
    source:{...raw.source,savedCell:'In[3880]'}},query),/来源/);
  assert.throws(()=>parseConstantWidthResult({...raw,
    source:{...raw.source,declaredTangentExtensionUnused:false}},query),/来源/);
  assert.throws(()=>parseConstantWidthResult({...raw,
    certification:{...raw.certification,sampledBandExactFOLD:true}},query),/FOLD/);
  assert.throws(()=>parseConstantWidthResult({...raw,
    certification:{...raw.certification,adoptableCreasePattern:true}},query),/折痕/);
  assert.throws(()=>parseConstantWidthResult({...raw,
    diagnostic:{...raw.diagnostic,unusedTangentEndpointWidth:0}},query),/诊断/);
  assert.throws(()=>parseConstantWidthResult({...raw,
    sample:{...raw.sample,leftBoundary:[[9,9],...raw.sample.leftBoundary.slice(1)]}},query),/方程/);
  assert.throws(()=>parseConstantWidthResult({...raw,vertices_coords:[]},query),/格式/);
  assert.throws(()=>parseConstantWidthResult(raw,{...query,width:.07}),/参数/);
});

test('request goes through its dedicated read-only route',async()=>{
  const old=globalThis.fetch,query={...CONSTANT_WIDTH_PRESET,segments:16};
  const raw=backendResponse(query),controller=new AbortController();
  let url='',body:unknown,signal:AbortSignal|undefined;
  try{
    globalThis.fetch=(async(input,init)=>{
      url=String(input);body=JSON.parse(String(init?.body));signal=init?.signal??undefined;
      return new Response(JSON.stringify(raw),{status:200,
        headers:{'Content-Type':'application/json'}});
    }) as typeof fetch;
    const result=await fetchConstantWidth(query,controller.signal);
    assert.equal(url,'/api/tessellation/curved-constant-width');
    assert.deepEqual(body,query);
    assert.equal(signal,controller.signal);
    assert.equal(result.source.savedCell,'In[3879]');
  }finally{globalThis.fetch=old;}
});

test('busy startup worker is retried without relaxing response validation',async()=>{
  const old=globalThis.fetch,query={...CONSTANT_WIDTH_PRESET,segments:16};
  const raw=backendResponse(query);
  let calls=0;
  try{
    globalThis.fetch=(async()=>{
      calls++;
      if(calls<=2)return new Response(JSON.stringify({
        error:'已有镶嵌计算正在进行，请等待或取消后重试。'}),{status:429,
        headers:{'Content-Type':'application/json'}});
      return new Response(JSON.stringify(raw),{status:200,
        headers:{'Content-Type':'application/json'}});
    }) as typeof fetch;
    const result=await fetchConstantWidthWhenIdle(query);
    assert.equal(calls,3);
    assert.equal(result.source.savedCell,'In[3879]');
  }finally{globalThis.fetch=old;}
});
