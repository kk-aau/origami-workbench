import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ALT_MOSELY_SAVED,fetchAltMoselyReference,parseAltMoselyResult,
  validateAltMoselyQuery,type AltMoselyQuery} from '../../src/app/altMoselyPotReference';

function backendResponse(query:AltMoselyQuery){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  const code='import json,sys;sys.path.insert(0,"backend");'+
    'from tessellation_alt_mosely_pot_query import query_alt_mosely_pot;'+
    'print(json.dumps(query_alt_mosely_pot(json.load(sys.stdin))))';
  const run=spawnSync(python,['-c',code],{cwd:root,input:JSON.stringify(query),
    encoding:'utf8',windowsHide:true,timeout:30000,env:{...process.env,PYTHONUTF8:'1'}});
  assert.equal(run.status,0,run.stderr||String(run.error));
  return JSON.parse(run.stdout);
}

test('saved inputs and positive-even m are a closed read-only query domain',()=>{
  assert.deepEqual(validateAltMoselyQuery({family:'alt-mosely-pot-reference'}),
    ALT_MOSELY_SAVED[0]);
  assert.deepEqual(validateAltMoselyQuery({family:'alt-mosely-pot-reference',
    example:3558}),ALT_MOSELY_SAVED[1]);
  for(const invalid of [null,{},[],
    {...ALT_MOSELY_SAVED[0],expression:'1+1'},
    {...ALT_MOSELY_SAVED[0],example:3559},
    {...ALT_MOSELY_SAVED[0],sectors:3},
    {...ALT_MOSELY_SAVED[0],sectors:17},
    {...ALT_MOSELY_SAVED[0],sectors:8.5},
    {...ALT_MOSELY_SAVED[0],sectors:true}])
    assert.throws(()=>validateAltMoselyQuery(invalid));
});

test('both saved geometric displays read back with alternating line/face transforms',()=>{
  const first=parseAltMoselyResult(backendResponse(ALT_MOSELY_SAVED[0]),ALT_MOSELY_SAVED[0]);
  const second=parseAltMoselyResult(backendResponse(ALT_MOSELY_SAVED[1]),ALT_MOSELY_SAVED[1]);
  assert.deepEqual(first.profile.axisCompleted.at(-1),[0,3.0001]);
  assert.equal(second.profile.axisPointAdded,false);
  assert.equal(first.display.flatLines.length,272);
  assert.equal(second.display.flatLines.length,180);
  assert.equal(first.display.foldedFaces.length,160);
  assert.equal(second.display.foldedFaces.length,120);
  assert.equal(first.source.classDeprecated,true);
  assert.equal(first.source.machineReadableWolframOut,false);
  assert.equal(first.certification.exactFOLD,false);
  assert.equal(first.certification.selfIntersectionChecked,false);
});

test('readback rejects false FOLD claims, changed source and damaged transforms',()=>{
  const query=ALT_MOSELY_SAVED[0],raw=backendResponse(query);
  assert.throws(()=>parseAltMoselyResult({...raw,
    certification:{...raw.certification,exactFOLD:true}},query),/FOLD/);
  assert.throws(()=>parseAltMoselyResult({...raw,
    source:{...raw.source,classDeprecated:false}},query),/来源/);
  assert.throws(()=>parseAltMoselyResult({...raw,
    profile:{...raw.profile,heightFromOriginal:3.0001}},query),/剖面/);
  const lines=structuredClone(raw.display.flatLines);
  lines[1].points[0][0]+=.1;
  assert.throws(()=>parseAltMoselyResult({...raw,
    display:{...raw.display,flatLines:lines}},query),/平移/);
  const faces=structuredClone(raw.display.foldedFaces);
  faces[1].vertices[0][1]+=.1;
  assert.throws(()=>parseAltMoselyResult({...raw,
    display:{...raw.display,foldedFaces:faces}},query),/旋转/);
  assert.throws(()=>parseAltMoselyResult(raw,ALT_MOSELY_SAVED[1]),/读回/);
});

test('dedicated API remains a read-only query and forwards cancellation',async()=>{
  const query=ALT_MOSELY_SAVED[1],raw=backendResponse(query);
  const old=globalThis.fetch,controller=new AbortController();
  let url='',body:unknown,signal:AbortSignal|undefined;
  try{
    globalThis.fetch=(async(input,init)=>{
      url=String(input);body=JSON.parse(String(init?.body));signal=init?.signal??undefined;
      return new Response(JSON.stringify(raw),{status:200,
        headers:{'Content-Type':'application/json'}});
    }) as typeof fetch;
    const result=await fetchAltMoselyReference(query,controller.signal);
    assert.equal(url,'/api/tessellation/alt-mosely-pot-reference');
    assert.deepEqual(body,query);
    assert.equal(signal,controller.signal);
    assert.equal(result.source.savedCell,'In[3558]');
  }finally{globalThis.fetch=old;}
});
