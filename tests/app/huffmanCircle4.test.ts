import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  HUFFMAN_CIRCLE4_PRESET,fetchHuffmanCircle4,parseHuffmanCircle4Result,
  validateHuffmanCircle4Query,type HuffmanCircle4Query,
} from '../../src/app/huffmanCircle4';

function actual(query:HuffmanCircle4Query){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  const code='import json,sys;sys.path.insert(0,"backend");'+
    'from tessellation_huffman_circle4_query import query_huffman_circle4;'+
    'print(json.dumps(query_huffman_circle4(json.load(sys.stdin)),allow_nan=False))';
  const run=spawnSync(python,['-c',code],{cwd:root,input:JSON.stringify(query),
    encoding:'utf8',windowsHide:true,timeout:30000,
    env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
  assert.equal(run.status,0,run.stderr||String(run.error));
  return JSON.parse(run.stdout);
}

test('Huffman query accepts only bounded saved-family sampling',()=>{
  assert.deepEqual(validateHuffmanCircle4Query({family:'huffman-circle4-in4072'}),
    HUFFMAN_CIRCLE4_PRESET);
  for(const input of [null,{},[],
    {...HUFFMAN_CIRCLE4_PRESET,expression:'Sin[t]'},
    {...HUFFMAN_CIRCLE4_PRESET,divisions:true},
    {...HUFFMAN_CIRCLE4_PRESET,divisions:7},
    {...HUFFMAN_CIRCLE4_PRESET,divisions:65},
    {...HUFFMAN_CIRCLE4_PRESET,divisions:'25'},
  ])assert.throws(()=>validateHuffmanCircle4Query(input));
});

test('actual saved pair preserves closure and explicit third-ruling mismatch',()=>{
  const result=parseHuffmanCircle4Result(actual(HUFFMAN_CIRCLE4_PRESET),HUFFMAN_CIRCLE4_PRESET);
  assert.equal(result.sample.rows.length,26);
  assert.equal(result.source.samplingStatus,'saved-input');
  assert.ok(result.closure.maximumAbsoluteResidual<2e-6);
  assert.equal(result.certification.thirdRulingOffset,1e-6);
  assert.equal(result.certification.completeBlockExactIsometry,false);
  assert.equal(result.certification.exactStraightCreaseFOLD,false);
  assert.equal(result.certification.adoptableCreasePattern,false);
  assert.equal(result.source.machineReadableWolframOut,false);
});

test('reader rejects a false exact-fold claim or altered paired geometry',()=>{
  const query={...HUFFMAN_CIRCLE4_PRESET,divisions:8};
  const raw=actual(query);
  assert.equal(parseHuffmanCircle4Result(raw,query).sample.rows.length,9);
  const changed=structuredClone(raw);
  changed.certification.completeBlockExactIsometry=true;
  assert.throws(()=>parseHuffmanCircle4Result(changed,query));
  const wrongGap=structuredClone(raw);
  wrongGap.sample.rows[4].foldedThirdRulingLength+=.001;
  assert.throws(()=>parseHuffmanCircle4Result(wrongGap,query));
  const wrongMirror=structuredClone(raw);
  wrongMirror.sample.rows[4].flatMirror[0][0]+=.01;
  assert.throws(()=>parseHuffmanCircle4Result(wrongMirror,query));
  const wrongSpatialMirror=structuredClone(raw);
  wrongSpatialMirror.sample.rows[4].foldedMirror[0][1]+=.01;
  assert.throws(()=>parseHuffmanCircle4Result(wrongSpatialMirror,query));
  const wrongSource=structuredClone(raw);
  wrongSource.source.machineReadableWolframOut=true;
  assert.throws(()=>parseHuffmanCircle4Result(wrongSource,query));
  assert.throws(()=>parseHuffmanCircle4Result(raw,HUFFMAN_CIRCLE4_PRESET));
});

test('request uses the dedicated read-only route and abort signal',async()=>{
  const query={...HUFFMAN_CIRCLE4_PRESET,divisions:8},reply=actual(query);
  const old=globalThis.fetch,controller=new AbortController();
  let url='',body:unknown,signal:AbortSignal|undefined;
  try{
    globalThis.fetch=(async(input,init)=>{
      url=String(input);body=JSON.parse(String(init?.body));signal=init?.signal??undefined;
      return new Response(JSON.stringify(reply),{status:200,
        headers:{'Content-Type':'application/json'}});
    }) as typeof fetch;
    const result=await fetchHuffmanCircle4(query,controller.signal);
    assert.equal(url,'/api/tessellation/huffman-circle4');
    assert.deepEqual(body,query);
    assert.ok(signal);
    assert.equal(signal.aborted,false);
    controller.abort();
    assert.equal(signal.aborted,true);
    assert.equal(result.source.displayCell,'In[4072]');
  }finally{globalThis.fetch=old;}
});
