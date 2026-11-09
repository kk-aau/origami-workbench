import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MATCH_SPEED_NATIVE_PRESET,validateNativeMatchSpeedQuery,parseNativeMatchSpeedResult,makeNativeMatchSpeedReference} from '../../src/app/curvedNativeMatchSpeed';
const fixtures=JSON.parse(fs.readFileSync('tests/fixtures/curved-match-speed-native-20261001.json','utf8')),
  fixture=(name:string)=>fixtures.find((r:{name:string})=>r.name===name),copy=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
test('nine literal square-speed fixtures replay independently in both directions, including optional undefined original preview',()=>{
  for(const f of fixtures)assert.doesNotThrow(()=>parseNativeMatchSpeedResult(f.response,f.query),f.name);
  const f=fixture('original-speed-counterexample'),r=makeNativeMatchSpeedReference(f.query,[-.5,0,1]);
  assert.ok(Math.abs(r.sample(1).mappedParameter-.25)<1e-12);assert.equal(r.sample(1).matchedTargetSpeed,.5);
  assert.equal(f.response.certification.finiteActualSpeedMatchVerified,false);
  const m=fixture('mapped-only-domain');assert.equal(m.response.sample.rows[0].originalTargetPoint,null);
});
test('complete independent vector dimensions, raw ui and expression contract are enforced',()=>{
  for(const f of fixtures)assert.deepEqual(validateNativeMatchSpeedQuery(f.query),f.query);
  for(const extra of [{sourceCurve:[]},{targetCurve:['eval(s)']},{sourceCurve:Array(9).fill('s')},{initialParameter:2},
    {segments:129},{parameterStart:-11},{parameterEnd:-.5},{extra:1}])assert.throws(()=>validateNativeMatchSpeedQuery({...MATCH_SPEED_NATIVE_PRESET,...extra}));
  assert.throws(()=>validateNativeMatchSpeedQuery({family:'match-curve-speed-native'}));
});
test('independent integral trajectory catches coherent f and derivative corruption and keeps tiny translated geometry',()=>{
  const f=fixture('two-variable-speeds');
  for(const key of ['mappedParameter','mappedParameterDerivative','sourceSpeed','targetSpeedAtMappedParameter','matchedTargetSpeed']){
    const r=copy(f.response);r.sample.rows[3][key]+=.03;assert.throws(()=>parseNativeMatchSpeedResult(r,f.query),key);}
  for(const key of ['sourcePoint','sourceDerivative','originalTargetPoint','matchedTargetPoint','matchedTargetDerivative',
    'normalizedSourcePoint','normalizedOriginalTargetPoint','normalizedMatchedTargetPoint']){
    const r=copy(f.response);r.sample.rows[3][key][0]+=.03;assert.throws(()=>parseNativeMatchSpeedResult(r,f.query),key);}
  const tiny=fixture('tiny-translated'),r=copy(tiny.response);r.sample.rows[3].normalizedMatchedTargetPoint=[0,0];
  assert.throws(()=>parseNativeMatchSpeedResult(r,tiny.query));
});
test('returned speed difference, original formula provenance, nullable preview and non-certified global scope cannot be forged',()=>{
  const f=fixture('original-speed-counterexample');
  for(const change of [(r:any)=>{r.certification.finiteActualSpeedMatchVerified=true;},(r:any)=>{r.source.speedEquationRepaired=true;},
    (r:any)=>{r.source.equation='fPrime*norm(c2Prime)=norm(c1Prime)';},(r:any)=>{r.initial.mappedParameter=.1;},
    (r:any)=>{r.normalization.scale*=2;},(r:any)=>{r.query.targetCurve=['s','0'];},
    (r:any)=>{r.diagnostics.maximumRelativeActualSpeedDifference=0;},(r:any)=>{r.diagnostics.maximumRelativeSquaredTransportResidual=-1;},
    (r:any)=>{r.certification.adoptableCreasePattern=true;},(r:any)=>{r.certification.integrationErrorIntervalCertified=true;}]){
    const r=copy(f.response);change(r);assert.throws(()=>parseNativeMatchSpeedResult(r,f.query));}
  const m=fixture('mapped-only-domain'),r=copy(m.response);r.sample.rows[0].originalTargetPoint=[0,0];
  assert.throws(()=>parseNativeMatchSpeedResult(r,m.query));
});
