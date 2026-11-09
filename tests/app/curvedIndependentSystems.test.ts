import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateIndependentCurve2DSystem,parseCurve2DSystemsFile,independentConstantSystems} from '../../src/app/curvedCurve2DSystems';
import {parseGenericLinkedResult,validateGenericLinkedQuery,GENERIC_LINKED_PRESET} from '../../src/app/curvedGenericLinked';
const cases=()=>JSON.parse(readFileSync(new URL('../fixtures/origamica-independent-systems-1010.json',import.meta.url),'utf8'));

test('independent original rules preserve raw expressions, unlike-domain and original array order through save/import',()=>{
  for(const c of cases()){
    assert.deepEqual(validateGenericLinkedQuery(c.query),c.query);
    const file={family:'origamica-independent-curve2d-systems-file',systems:c.query.curve2DSystems};
    assert.deepEqual(parseCurve2DSystemsFile(JSON.parse(JSON.stringify(file)),c.query.curves,'independent-external'),c.query.curve2DSystems);
    assert.deepEqual(c.query.curve2DSystems[0].parameterDomain,[-2,3]);
    assert.equal(c.query.curve2DSystems[0].rules[0].key,'TangentVector2D');
  }
});
test('all real raw prefixes pass independent Taylor/root and independent ODE/frame algebra replay',()=>{
  for(const c of cases()){
    const r=parseGenericLinkedResult(c.response,c.query);
    assert.deepEqual(r.independentRules!.initialState,[0,0,0,2,0,0,0,3,0,0,0,1]);
    assert.equal(r.certification.finiteNumericalMetricVerified,false);
    assert.equal(r.certification.allBandsAnalyticLocalIsometry,false);
    assert.equal(r.certification.adoptableCreasePattern,false);
    assert.equal(r.curve2DSystems!.next2DThirdSystemUsed,false);
    assert.ok(r.curve2DSystems!.evaluations.every(n=>n>0));
  }
  assert.deepEqual(cases()[1].response.sample,cases()[2].response.sample);
});
test('third external system affects later Next2D triple and actual third band without inventing first-triple influence',()=>{
  const extra=JSON.parse(readFileSync(new URL('../fixtures/origamica-independent-systems-followup-1010.json',import.meta.url),'utf8'));
  const r=extra.map((c:any)=>parseGenericLinkedResult(c.response,c.query));
  assert.equal(r[0].certification.bandCount,3);assert.equal(r[0].curve2DSystems!.next2DThirdSystemUsed,false);
  for(let i=0;i<r[0].sample.rows.length;i++){
    assert.equal(r[0].sample.rows[i].foldAnglesDeg[1],r[1].sample.rows[i].foldAnglesDeg[1]);
    assert.notEqual(r[0].sample.rows[i].foldAnglesDeg[2],r[1].sample.rows[i].foldAnglesDeg[2]);
    assert.deepEqual(r[0].sample.rows[i].foldedCurves.slice(0,3),r[1].sample.rows[i].foldedCurves.slice(0,3));
    assert.notDeepEqual(r[0].sample.rows[i].foldedCurves[3],r[1].sample.rows[i].foldedCurves[3]);
  }
});
test('default verified mode rejects independent data; independent mode rejects verified identity file',()=>{
  const c=cases()[1];delete c.query.curve2DSystemsMode;
  assert.throws(()=>validateGenericLinkedQuery(c.query));
  assert.throws(()=>parseCurve2DSystemsFile({family:'origamica-independent-curve2d-systems-file',systems:c.response.query.curve2DSystems},c.query.curves));
  assert.throws(()=>parseCurve2DSystemsFile({family:'origamica-curve2d-systems-file',systems:[]},c.query.curves,'independent-external'));
});
test('independent domain, arbitrary order and signed speed stay explicit without identity or normalization tests',()=>{
  const s=independentConstantSystems([[-2,3]])[0];s.rules.reverse();
  s.rules.find(r=>r.key==='Speed2D')!.expressions=['-1'];
  s.rules.find(r=>r.key==='TangentVector2D')!.expressions=['2+u','Sin[u]'];
  assert.deepEqual(validateIndependentCurve2DSystem(s),s);
});
test('duplicate keys, unsafe code, mismatched identity and false same-source claims are rejected',()=>{
  for(const mutate of [(s:any)=>{s.rules[0].key=s.rules[1].key;},(s:any)=>{s.source.function='Curve2DSystem';},
    (s:any)=>{s.source.kind='verified-same-source';},(s:any)=>{s.family='origamica-curve2d-system-description';},
    (s:any)=>{s.parameterDomain=[true,3];},(s:any)=>{s.rules[0].expressions=['alert(1)','0'];}]){
    const s=cases()[1].query.curve2DSystems[0];mutate(s);assert.throws(()=>validateIndependentCurve2DSystem(s));
  }
  assert.throws(()=>validateGenericLinkedQuery({...GENERIC_LINKED_PRESET,curve2DSystemsMode:'independent-external'}));
});
test('altered trajectories, raw initial values, false metric/CP certificates and fabricated proof scope cannot pass readback',()=>{
  for(const mutate of [(r:any)=>{r.sample.rows[2].normalizedFoldedCurves[0][2]+=.001;},
    (r:any)=>{r.sample.rows[2].normalizedFoldedDerivatives[1][0]+=.001;},
    (r:any)=>{r.independentRules.initialState[3]=1;},(r:any)=>{r.independentRules.sourceIdentityAsserted=true;},
    (r:any)=>{r.curve2DSystems.rulesUnnormalized=false;},(r:any)=>{r.curve2DSystems.originalSameSourceRequired=true;},
    (r:any)=>{r.certification.finiteNumericalMetricVerified=true;r.independentRules.metricCompatibilityVerified=true;},
    (r:any)=>{r.certification.adoptableCreasePattern=true;},(r:any)=>{r.diagnostics.maxFrameGramError=0;},
    (r:any)=>{r.diagnostics.maxMetricError=0;},(r:any)=>{r.curve2DSystems.next2DThirdSystemUsed=true;},
    (r:any)=>{r.query.curve2DSystems[0].rules[0].expressions[0]='1';}]){
    const c=cases()[1];mutate(c.response);assert.throws(()=>parseGenericLinkedResult(c.response,c.query));
  }
});
