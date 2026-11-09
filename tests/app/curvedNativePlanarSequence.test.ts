import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {NATIVE_PLANAR_SEQUENCE_PRESET,validateNativePlanarSequenceQuery,parseNativePlanarSequenceResult,fetchNativePlanarSequenceWhenIdle,
 type NativePlanarSequenceResult} from '../../src/app/curvedNativePlanarSequence';
const fixtures=JSON.parse(readFileSync('tests/fixtures/curved-planar-sequence-native-20261001.json','utf8'));
const get=(name:string)=>fixtures.find((c:{name:string})=>c.name===name);
const reject=(name:string,f:(r:NativePlanarSequenceResult)=>void)=>{const c=get(name),r=structuredClone(c.response);f(r);assert.throws(()=>parseNativePlanarSequenceResult(r,c.query));};
test('13 actual native sequences preserve arbitrary six sources, mirror lists and both literal ComposeReflections orders',()=>{
 assert.equal(fixtures.length,13);for(const f of fixtures)parseNativePlanarSequenceResult(f.response,f.query);
 assert.notDeepEqual(get('noncircular').response.sample.rows[0].stages.at(-1).base,get('compose-false').response.sample.rows[0].stages.at(-1).base);
});
test('raw nonunit and almost-unit mirror normals never produce repaired geometry or fake conditional isometry',()=>{
 for(const name of ['nonunit-normal','raw-near-normal']){const r=get(name).response;assert.equal(r.certification.mirrorNormalsCompatible,false);
  assert.equal(r.certification.conditionalReflectionIsometryCertified,false);assert.deepEqual(r.effectiveMirrors[0].normal,r.query.mirrors[0].normal);}
 assert.equal(get('nonunit-normal').response.certification.finiteMetricVerified,false);
 reject('nonunit-normal',r=>{r.diagnostics.maximumRelativeMetricDifference=0;r.certification.finiteMetricVerified=true;});
 reject('raw-near-normal',r=>{r.certification.mirrorNormalsCompatible=true;r.certification.conditionalReflectionIsometryCertified=true;});
});
test('binding every original intersection, reflection derivative and tiny physical EFG rejects plausible forged results',()=>{
 reject('noncircular',r=>{r.sample.rows[3].stages[1].parameter+=.01;});reject('noncircular',r=>{r.sample.rows[3].stages[2].normalizedDirectorDerivative[0]+=.01;});
 reject('compose-false',r=>{r.effectiveMirrors[1].normal[2]*=-1;});reject('noncircular',r=>{r.grid[3].stages[2].normalizedPoints[1][0]+=.01;});
 reject('tiny',r=>{r.sample.rows[3].stages[1].directorDerivative[0]+=1e-9;});reject('tiny',r=>{r.grid[3].stages[1].EFG[1][0]*=2;});
 reject('tiny',r=>{r.grid[3].stages[1].EFG[1][2]*=2;});
});
test('original empty mirror list, cone apex, nonordered cuts and genuine interval unknown remain valid literal outputs',()=>{
 const empty=get('empty').response;assert.equal(empty.sample.rows[0].stages.length,1);assert.deepEqual(empty.sample.rows[0].stages[0].base,empty.sample.rows[0].stages[0].fold);
 const cone=get('cone-symbolic').response;assert.deepEqual(cone.sample.rows[0].stages[0].base,[0,0,0]);
 const unknown=get('unknown').response;assert.equal(unknown.domain.certified,false);assert.equal(unknown.domain.evaluations,1024);
 assert.equal(unknown.sample.rows.at(-1).s,unknown.query.parameterEnd);assert.equal(unknown.certification.cutOrderVerified,false);
 reject('unknown',r=>{r.certification.sourceDomainCertified=true;});reject('noncircular',r=>{r.domain.cells[0].normalizedDenominatorBounds[0]=[-1,1];});
});
test('query rejects foreign fields, unsafe sources, forged mirror data and invalid display domains',()=>{
 assert.deepEqual(validateNativePlanarSequenceQuery(NATIVE_PLANAR_SEQUENCE_PRESET),NATIVE_PLANAR_SEQUENCE_PRESET);
 for(const change of [{baseCurve:['eval(s)','0','0']},{composeReflections:1},{mirrors:[{point:[0,0,0],normal:[1,2]}]},
  {mirrors:[{point:[0,0,0],normal:[0,0,1],normalize:true}]},{parameterEnd:-.5},{rulingSegments:33},{initialTangent:[1,0]}])
  assert.throws(()=>validateNativePlanarSequenceQuery({...NATIVE_PLANAR_SEQUENCE_PRESET,...change}));
});
test('busy analysis transport keeps all source functions and the raw mirror list unchanged',async()=>{
 const original=globalThis.fetch,r=get('nonunit-normal').response;let calls=0;
 globalThis.fetch=async(input,init)=>{assert.equal(String(input),'/api/tessellation/curved-planar-sequence-generic');assert.deepEqual(JSON.parse(String(init?.body)),r.query);
  return new Response(JSON.stringify(++calls===1?{error:'已有镶嵌计算正在进行，请稍后重试。'}:r),{status:calls===1?429:200,headers:{'Content-Type':'application/json'}});};
 try{const result=await fetchNativePlanarSequenceWhenIdle(r.query,AbortSignal.timeout(5000));assert.equal(calls,2);assert.deepEqual(result.effectiveMirrors[0].normal,[0,0,2]);}
 finally{globalThis.fetch=original;}
});
