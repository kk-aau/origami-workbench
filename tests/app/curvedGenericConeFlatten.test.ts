import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchGenericConeFlatten,fetchGenericConeFlattenWhenIdle,
  GENERIC_CONE_FLATTEN_PRESET,
  genericConePoints,parseGenericConeFlattenResult,projectGenericConePoint,
  validateGenericConeFlattenQuery,type GenericConeFlattenQuery} from
  '../../src/app/curvedGenericConeFlatten';

function backendResponse(query:GenericConeFlattenQuery){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  const code='import json,sys;sys.path.insert(0,"backend");'+
    'from tessellation_curved_generic_cone_flatten_query import query_generic_cone_flatten;'+
    'print(json.dumps(query_generic_cone_flatten(json.load(sys.stdin))))';
  const run=spawnSync(python,['-c',code],{cwd:root,input:JSON.stringify(query),
    encoding:'utf8',windowsHide:true,timeout:30000,env:{...process.env,PYTHONUTF8:'1'}});
  assert.equal(run.status,0,run.stderr||String(run.error));
  return JSON.parse(run.stdout);
}

test('saved cone family has closed finite bounds',()=>{
  assert.deepEqual(validateGenericConeFlattenQuery({
    family:GENERIC_CONE_FLATTEN_PRESET.family}),GENERIC_CONE_FLATTEN_PRESET);
  for(const value of [null,[],{},
    {...GENERIC_CONE_FLATTEN_PRESET,expression:'Cos[u]'},
    {...GENERIC_CONE_FLATTEN_PRESET,angleDeg:NaN},
    {...GENERIC_CONE_FLATTEN_PRESET,angleDeg:14},
    {...GENERIC_CONE_FLATTEN_PRESET,angleDeg:true},
    {...GENERIC_CONE_FLATTEN_PRESET,rulingEnd:1.01},
    {...GENERIC_CONE_FLATTEN_PRESET,curveSegments:257},
    {...GENERIC_CONE_FLATTEN_PRESET,rulingSegments:1}])
    assert.throws(()=>validateGenericConeFlattenQuery(value));
});

test('real Python result matches every sampled flat and space point',()=>{
  const query={...GENERIC_CONE_FLATTEN_PRESET,curveSegments:32,rulingSegments:4};
  const result=parseGenericConeFlattenResult(backendResponse(query),query);
  assert.equal(result.sample.parameterValues.length,33);
  assert.equal(result.sample.rulingValues.length,5);
  assert.deepEqual(result.sample.flatSamples[0][0],[2,0]);
  assert.deepEqual(result.sample.flatSamples[0][4],[0,0]);
  assert.ok(result.sample.foldedSamples[0][4].every(value=>Math.abs(value)<1e-15));
  assert.equal(result.certification.apexAtVOneSingular,true);
  assert.equal(result.certification.regularExactlyForVLessThanOne,true);
  assert.equal(result.certification.sampledSurfaceExactFOLD,false);
  assert.equal(result.certification.adoptableCreasePattern,false);
  assert.equal(result.source.machineReadableWolframOut,false);
  const anchor=genericConePoints(Math.PI/2,0,30);
  assert.ok(Math.abs(anchor.flat[0]-Math.SQRT1_2)<1e-14);
  assert.deepEqual(projectGenericConePoint([1,0,0],0),[1,0]);
});

test('response readback rejects altered source, apex claims and coordinates',()=>{
  const query={...GENERIC_CONE_FLATTEN_PRESET,curveSegments:16,rulingSegments:2};
  const raw=backendResponse(query);
  assert.throws(()=>parseGenericConeFlattenResult({...raw,
    source:{...raw.source,savedCell:'In[3887]'}},query),/来源/);
  assert.throws(()=>parseGenericConeFlattenResult({...raw,
    initial:{...raw.initial,flatTangent:[1,0]}},query),/初值/);
  assert.throws(()=>parseGenericConeFlattenResult({...raw,
    certification:{...raw.certification,apexAtVOneSingular:false}},query),/锥顶/);
  assert.throws(()=>parseGenericConeFlattenResult({...raw,
    certification:{...raw.certification,sampledSurfaceExactFOLD:true}},query),/FOLD/);
  assert.throws(()=>parseGenericConeFlattenResult({...raw,
    invariants:{...raw.invariants,commonMetric:{...raw.invariants.commonMetric,E:'1'}}},query),/第一基本形式/);
  assert.throws(()=>parseGenericConeFlattenResult({...raw,
    sample:{...raw.sample,flatSamples:[[[9,9],...raw.sample.flatSamples[0].slice(1)],
      ...raw.sample.flatSamples.slice(1)]}},query),/对应点/);
  assert.throws(()=>parseGenericConeFlattenResult({...raw,vertices_coords:[]},query),/格式/);
  assert.throws(()=>parseGenericConeFlattenResult(raw,{...query,angleDeg:40}),/参数/);
});

test('shortened ruling excludes sampled apex but still identifies v=1 singularity',()=>{
  const query={...GENERIC_CONE_FLATTEN_PRESET,rulingEnd:.8,curveSegments:16,
    rulingSegments:4};
  const result=parseGenericConeFlattenResult(backendResponse(query),query);
  assert.equal(result.certification.sampleIncludesApex,false);
  assert.equal(result.certification.apexAtVOneSingular,true);
  assert.equal(result.sample.rulingValues.at(-1),.8);
  assert.notDeepEqual(result.sample.flatSamples[0].at(-1),[0,0]);
});

test('request uses separate read-only route and passes abort signal',async()=>{
  const old=globalThis.fetch,query={...GENERIC_CONE_FLATTEN_PRESET,
    curveSegments:16,rulingSegments:2};
  const raw=backendResponse(query),controller=new AbortController();
  let url='',body:unknown,signal:AbortSignal|undefined;
  try{
    globalThis.fetch=(async(input,init)=>{
      url=String(input);body=JSON.parse(String(init?.body));signal=init?.signal??undefined;
      return new Response(JSON.stringify(raw),{status:200,
        headers:{'Content-Type':'application/json'}});
    }) as typeof fetch;
    const result=await fetchGenericConeFlatten(query,controller.signal);
    assert.equal(url,'/api/tessellation/curved-generic-cone-flatten');
    assert.deepEqual(body,query);
    assert.equal(signal,controller.signal);
    assert.equal(result.source.savedCell,'In[3886]');
  }finally{globalThis.fetch=old;}
});

test('temporary busy worker recovers without accepting an altered result',async()=>{
  const old=globalThis.fetch,query={...GENERIC_CONE_FLATTEN_PRESET,
    curveSegments:16,rulingSegments:2};
  const raw=backendResponse(query);let calls=0;
  try{
    globalThis.fetch=(async()=>{
      calls++;
      if(calls===1)return new Response(JSON.stringify({
        error:'已有镶嵌计算正在进行，请等待或取消后重试。'}),{status:429,
        headers:{'Content-Type':'application/json'}});
      return new Response(JSON.stringify(raw),{status:200,
        headers:{'Content-Type':'application/json'}});
    }) as typeof fetch;
    const result=await fetchGenericConeFlattenWhenIdle(query);
    assert.equal(calls,2);
    assert.equal(result.certification.apexAtVOneSingular,true);
  }finally{globalThis.fetch=old;}
});
