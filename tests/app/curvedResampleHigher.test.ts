import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {uniformPolynomial} from '../../src/app/curvedUniformResample';
import {parseGenericDarbouxResult,validateGenericDarbouxQuery,GENERIC_DARBOUX_FLATTEN_PRESET} from '../../src/app/curvedNativeGenericDarboux';
const fixtures=()=>JSON.parse(readFileSync(new URL('../fixtures/origamica-flatten-resample-higher-1010.json',import.meta.url),'utf8'));
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<6e-12,`${a} != ${b}`);

test('independent Newton interpolation reproduces the original In125 cubic and explicit degree2/4 polynomials',()=>{
  for(const degree of [2,3,4]){
    const f=degree===3?(x:number)=>1+.5*x*x-.5*x**3:(x:number)=>x**degree+.3*x+.2,
      df=degree===3?(x:number)=>x-1.5*x*x:(x:number)=>degree*x**(degree-1)+.3,
      samples=Array.from({length:9},(_,j)=>[f(j/8),2*f(j/8)]),interpolate=uniformPolynomial(0,1,samples,degree);
    for(const s of [.013,.19,.37,.71,.995]){const r=interpolate(s);near(r.value[0],f(s));near(r.derivative[0],df(s));near(r.value[1],2*f(s));}
    for(let j=0;j<=8;j++)assert.deepEqual(interpolate(j/8).value,samples[j]);
    assert.throws(()=>interpolate(1.1));
  }
});
test('nonlinear knot values remain exact and actual left/right derivatives can differ',()=>{
  const samples=Array.from({length:9},(_,j)=>[Math.sin(j/8)]),f=uniformPolynomial(0,1,samples,3),a=f(.5,'left'),b=f(.5,'right');
  assert.deepEqual(a.value,samples[4]);assert.deepEqual(a.value,b.value);assert.ok(Math.abs(a.derivative[0]-b.derivative[0])>1e-5);
});
test('actual degree2/3/4 and original-cone outputs replay all four stages and both knot derivatives',()=>{
  for(const c of fixtures()){
    const r=parseGenericDarbouxResult(c.response,c.query),p=r.resampling!.polynomial!;
    assert.equal(p.degree,c.query.interpolationOrder);assert.equal(p.auditedKnotSides,14);
    assert.equal(p.wolframDefaultAlgorithmReproduced,false);assert.equal(p.originalAutomaticPointsReproduced,false);
    assert.equal(r.certification.formalIsometryCertified,false);assert.equal(r.certification.adoptableCreasePattern,false);
    assert.deepEqual(r.query,c.query);assert.equal(r.source.interpolationReproduced,false);
  }
  const errors=fixtures().slice(0,3).map((c:any)=>c.response.diagnostics.maximumRelativeMetricDifference);
  assert.ok(errors[0]>errors[1]&&errors[1]>errors[2]&&errors[2]<1e-6);
});
test('altered polynomial degree/stencil/jump/sides/default claims or false actual derivative cannot pass readback',()=>{
  for(const mutate of [(r:any)=>{r.resampling.polynomial.degree=1;},(r:any)=>{r.resampling.polynomial.stencil='Spline';},
    (r:any)=>{r.resampling.polynomial.normalizedBaseDerivativeJump=.1;},(r:any)=>{r.resampling.polynomial.auditedKnotSides=0;},
    (r:any)=>{r.resampling.polynomial.wolframDefaultAlgorithmReproduced=true;},(r:any)=>{r.resampling.polynomial.originalAutomaticPointsReproduced=true;},
    (r:any)=>{r.sample.rows[3].targetBaseDerivative[0]+=.001;}]){
    const c=fixtures()[1];mutate(c.response);assert.throws(()=>parseGenericDarbouxResult(c.response,c.query),/回读/);
  }
});
test('explicit supported degree is preserved while unresolved Automatic defaults are rejected',()=>{
  for(const degree of [1,2,3,4])assert.equal(validateGenericDarbouxQuery({...GENERIC_DARBOUX_FLATTEN_PRESET,resample:true,interpolationPoints:8,interpolationOrder:degree}).interpolationOrder,degree);
  for(const changes of [{interpolationPoints:'Automatic'},{interpolationOrder:'Automatic'},{interpolationOrder:5},{interpolationOrder:0},{interpolationOrder:true}])
    assert.throws(()=>validateGenericDarbouxQuery({...GENERIC_DARBOUX_FLATTEN_PRESET,resample:true,interpolationPoints:8,interpolationOrder:3,...changes}));
});
