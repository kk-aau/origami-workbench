import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  HUFFMAN_PARABOLA_PRESET,fetchHuffmanParabola,parseHuffmanParabolaResult,
  validateHuffmanParabolaQuery,type HuffmanParabolaQuery,
} from '../../src/app/huffmanParabola';

function actual(query:HuffmanParabolaQuery){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  const code='import json,sys;sys.path.insert(0,"backend");'+
    'from tessellation_huffman_parabola_query import query_huffman_parabola;'+
    'print(json.dumps(query_huffman_parabola(json.load(sys.stdin)),allow_nan=False))';
  const run=spawnSync(python,['-c',code],{cwd:root,input:JSON.stringify(query),
    encoding:'utf8',windowsHide:true,timeout:30000,
    env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
  assert.equal(run.status,0,run.stderr||String(run.error));
  return JSON.parse(run.stdout);
}

test('parabola query accepts only the bounded saved input',()=>{
  assert.deepEqual(validateHuffmanParabolaQuery({family:'huffman-parabola-in4060'}),
    HUFFMAN_PARABOLA_PRESET);
  for(const input of [null,{},[],
    {...HUFFMAN_PARABOLA_PRESET,expression:'Sin[t]'},
    {...HUFFMAN_PARABOLA_PRESET,divisions:true},
    {...HUFFMAN_PARABOLA_PRESET,divisions:7},
    {...HUFFMAN_PARABOLA_PRESET,divisions:65},
    {...HUFFMAN_PARABOLA_PRESET,divisions:'25'},
  ])assert.throws(()=>validateHuffmanParabolaQuery(input));
});

test('actual saved parabola sample preserves explicit incomplete-status evidence',()=>{
  const result=parseHuffmanParabolaResult(actual(HUFFMAN_PARABOLA_PRESET),
    HUFFMAN_PARABOLA_PRESET);
  assert.equal(result.sample.rows.length,26);
  assert.equal(result.source.samplingStatus,'saved-input');
  assert.equal(result.source.originalCompletionStatus,'partially-worked-out');
  assert.deepEqual(result.source.savedParametersDeg,[5,85,60,-90]);
  assert.equal(result.certification.thirdRulingOffset,1e-6);
  assert.equal(result.certification.completeBlockExactIsometry,false);
  assert.equal(result.certification.exactStraightCreaseFOLD,false);
  assert.equal(result.certification.adoptableCreasePattern,false);
  assert.equal(result.source.machineReadableWolframOut,false);
});

test('reader rejects false certification, changed parabola or paired geometry',()=>{
  const query={...HUFFMAN_PARABOLA_PRESET,divisions:8};
  const raw=actual(query);
  assert.equal(parseHuffmanParabolaResult(raw,query).sample.rows.length,9);
  const falseFold=structuredClone(raw);
  falseFold.certification.exactStraightCreaseFOLD=true;
  assert.throws(()=>parseHuffmanParabolaResult(falseFold,query));
  const falseSource=structuredClone(raw);
  falseSource.source.originalCompletionStatus='fully-worked-out';
  assert.throws(()=>parseHuffmanParabolaResult(falseSource,query));
  const wrongParabola=structuredClone(raw);
  wrongParabola.sample.rows[4].flat[2][0]+=.01;
  assert.throws(()=>parseHuffmanParabolaResult(wrongParabola,query));
  const wrongGap=structuredClone(raw);
  wrongGap.sample.rows[4].foldedThirdRulingLength+=.001;
  assert.throws(()=>parseHuffmanParabolaResult(wrongGap,query));
  const wrongMirror=structuredClone(raw);
  wrongMirror.sample.rows[4].flatMirror[0][0]+=.01;
  assert.throws(()=>parseHuffmanParabolaResult(wrongMirror,query));
  const wrongSpatialMirror=structuredClone(raw);
  wrongSpatialMirror.sample.rows[4].foldedMirror[0][1]+=.01;
  assert.throws(()=>parseHuffmanParabolaResult(wrongSpatialMirror,query));
  assert.throws(()=>parseHuffmanParabolaResult(raw,HUFFMAN_PARABOLA_PRESET));
});

test('request uses dedicated read-only route and abort signal',async()=>{
  const query={...HUFFMAN_PARABOLA_PRESET,divisions:8},reply=actual(query);
  const old=globalThis.fetch,controller=new AbortController();
  let url='',body:unknown,signal:AbortSignal|undefined;
  try{
    globalThis.fetch=(async(input,init)=>{
      url=String(input);body=JSON.parse(String(init?.body));signal=init?.signal??undefined;
      return new Response(JSON.stringify(reply),{status:200,
        headers:{'Content-Type':'application/json'}});
    }) as typeof fetch;
    const result=await fetchHuffmanParabola(query,controller.signal);
    assert.equal(url,'/api/tessellation/huffman-parabola');
    assert.deepEqual(body,query);
    assert.ok(signal);
    assert.equal(signal.aborted,false);
    controller.abort();
    assert.equal(signal.aborted,true);
    assert.equal(result.source.display2DCell,'In[4062]');
  }finally{globalThis.fetch=old;}
});
