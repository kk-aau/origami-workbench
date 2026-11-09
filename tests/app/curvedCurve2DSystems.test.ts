import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseCurve2DSystemsResult,validateCurve2DSystems,parseCurve2DSystemsFile} from '../../src/app/curvedCurve2DSystems';
import {parseGenericLinkedResult,validateGenericLinkedQuery,GENERIC_LINKED_PRESET} from '../../src/app/curvedGenericLinked';
const fixture=()=>JSON.parse(readFileSync(new URL('../fixtures/origamica-curve2d-systems-1010.json',import.meta.url),'utf8'));

test('precomputed ordered source-bound systems serialize and import without changing any expression or native domain',()=>{
  const f=fixture(),r=parseCurve2DSystemsResult(f.precomputed,GENERIC_LINKED_PRESET.curves);
  assert.deepEqual(r,f.precomputed);assert.equal(r.proof.numericalInterpolationReproduced,false);
  for(const count of [1,2,3]){
    const systems=r.systems.slice(0,count),file=JSON.parse(JSON.stringify({family:'origamica-curve2d-systems-file',systems}));
    assert.deepEqual(parseCurve2DSystemsFile(file,GENERIC_LINKED_PRESET.curves),systems);
  }
});
test('all actual external prefixes independently replay angles, roots, geometry and provenance',()=>{
  for(const c of fixture().cases){const r=parseGenericLinkedResult(c.response,c.query),stamp=r.curve2DSystems!;
    assert.deepEqual(validateGenericLinkedQuery(c.query),c.query);assert.deepEqual(stamp.systems,c.query.curve2DSystems);
    assert.ok(stamp.evaluations.every(n=>n>0));assert.equal(stamp.next2DThirdSystemUsed,false);
    assert.equal(stamp.originalArbitrarySystemContractReproduced,false);assert.equal(r.certification.adoptableCreasePattern,false);
  }
  assert.equal(validateCurve2DSystems('Automatic',GENERIC_LINKED_PRESET.curves),'Automatic');
  assert.deepEqual(validateCurve2DSystems([],GENERIC_LINKED_PRESET.curves),[]);
});
test('wrong source, reordered systems/rules, mismatched domain and incompatible raw frame are rejected',()=>{
  for(const mutate of [(x:any)=>{x.source.function='NCurve2DSystem';},(x:any)=>{x.source.definitionCell='In[3632]';},
    (x:any)=>{x.parameterDomain[1]=1;},(x:any)=>{x.curve.y='0.3*u**2+0.2';},(x:any)=>{x.rules.reverse();},
    (x:any)=>{x.rules[2].expressions[0]='1.01*('+x.rules[2].expressions[0]+')';}]){
    const system=fixture().precomputed.systems[0];mutate(system);assert.throws(()=>validateCurve2DSystems([system],GENERIC_LINKED_PRESET.curves));
  }
  const systems=fixture().precomputed.systems;assert.throws(()=>validateCurve2DSystems([systems[1],systems[0]],GENERIC_LINKED_PRESET.curves));
});
test('false replacement usage, fabricated proof scope and altered supplied coefficients cannot pass geometry readback',()=>{
  for(const mutate of [(r:any)=>{r.curve2DSystems.evaluations[0]=0;},(r:any)=>{r.curve2DSystems.next2DThirdSystemUsed=true;},
    (r:any)=>{r.curve2DSystems.replacementIndices.reverse();},(r:any)=>{r.curve2DSystems.originalArbitrarySystemContractReproduced=true;},
    (r:any)=>{r.curve2DSystems.identityProof='finite-sampling';},(r:any)=>{r.query.curve2DSystems[0].rules[0].expressions[0]='2';},
    (r:any)=>{r.sample.rows[2].qValues[2]+=.01;}]){
    const c=fixture().cases[2];mutate(c.response);assert.throws(()=>parseGenericLinkedResult(c.response,c.query),/回读|字段/);
  }
});
