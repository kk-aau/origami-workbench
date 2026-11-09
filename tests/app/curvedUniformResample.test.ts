import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {uniformLinear} from '../../src/app/curvedUniformResample';
import {parseGenericDarbouxResult,validateGenericDarbouxQuery,GENERIC_DARBOUX_FLATTEN_PRESET} from '../../src/app/curvedNativeGenericDarboux';

const fixtures=()=>JSON.parse(readFileSync(new URL('../fixtures/origamica-flatten-resample-1010.json',import.meta.url),'utf8'));
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<4e-10,`${a} != ${b}`);

test('inclusive uniform order-one scalar/vector interpolation has actual interval derivatives',()=>{
  assert.deepEqual(uniformLinear(-1,1,[[-1,3],[0,2],[1,1]])(.25),{value:[.25,1.75],derivative:[1,-1]});
  const f=uniformLinear(0,1,[[0],[1],[0]]);
  assert.deepEqual(f(.5),{value:[1],derivative:[-2]});assert.deepEqual(f(1),{value:[0],derivative:[-2]});
  assert.throws(()=>f(1.1));assert.throws(()=>uniformLinear(0,1,[[0],[NaN]]));
});
test('actual uniform flatten responses replay the original stages and preserve independent source checks',()=>{
  for(const c of fixtures()){
    const r=parseGenericDarbouxResult(c.response,c.query),stamp=r.resampling!;
    assert.equal(stamp.parameters.length,c.query.interpolationPoints+1);
    assert.deepEqual(r.query,c.query);assert.equal(r.source.interpolationReproduced,false);
    assert.equal(r.certification.formalIsometryCertified,false);assert.equal(r.certification.formalStripRegularityCertified,false);
    assert.equal(r.certification.adoptableCreasePattern,false);assert.equal(r.domain.formalStripRegularity.status,'unknown');
  }
});
test('original In3886 cone with explicit original resampling options follows literal chord net',()=>{
  const r=fixtures().find((c:any)=>c.name==='original-cone').response;
  for(const row of r.sample.rows){const x=row.s*8/Math.PI,j=Math.min(7,Math.floor(x)),w=x-j,
    a=[Math.cos(j*Math.PI/16),Math.sin(j*Math.PI/16)],b=[Math.cos((j+1)*Math.PI/16),Math.sin((j+1)*Math.PI/16)];
    for(let i=0;i<2;i++){near(row.targetBase[i],a[i]+w*(b[i]-a[i]));near(row.targetDirector[i],-a[i]-w*(b[i]-a[i]));
      near(row.targetBaseDerivative[i],(b[i]-a[i])*8/Math.PI);}
  }
  assert.ok(r.diagnostics.maximumRelativeMetricDifference>.09);
});
test('offgrid original seeds remain exact inputs while actual sampled initial residuals stay visible',()=>{
  const r=fixtures().find((c:any)=>c.name==='noncircular-interior').response;
  assert.equal(r.query.initialParameter,.37);assert.deepEqual(r.initial.point,[2,-3]);
  assert.ok(r.resampling.initialNormalizedPointResidual>1e-5);assert.ok(r.resampling.initialTangentResidual>1e-5);
  assert.equal(r.certification.finiteMetricVerified,false);
  const affine=fixtures().find((c:any)=>c.name==='affine-cylinder').response;
  assert.ok(affine.diagnostics.maximumRelativeMetricDifference<1e-12);
});
test('readback rejects altered sample stages, derivatives, initial residuals and false interpolation/isometry claims',()=>{
  for(const mutate of [(r:any)=>{r.resampling.normalizedBase[2][0]+=.01;},(r:any)=>{r.sample.rows[3].targetBaseDerivative[0]+=.01;},
    (r:any)=>{r.resampling.options.InterpolationPoints=7;},(r:any)=>{r.resampling.initialTangentResidual=.5;},
    (r:any)=>{r.source.interpolationReproduced=true;},(r:any)=>{r.certification.formalIsometryCertified=true;},
    (r:any)=>{r.resampling.underlyingAdaptiveInterpolationReproduced=true;}]){
    const r=fixtures()[0].response;mutate(r);assert.throws(()=>parseGenericDarbouxResult(r),/回读/);
  }
});
test('unsupported automatic/above-budget options are rejected instead of ignored',()=>{
  assert.deepEqual(validateGenericDarbouxQuery(GENERIC_DARBOUX_FLATTEN_PRESET),GENERIC_DARBOUX_FLATTEN_PRESET);
  for(const patch of [{resample:true},{resample:1},{interpolationPoints:8},{resample:false,interpolationPoints:8},
    {resample:true,interpolationPoints:8,interpolationOrder:5},{resample:true,interpolationPoints:true,interpolationOrder:1}])
    assert.throws(()=>validateGenericDarbouxQuery({...GENERIC_DARBOUX_FLATTEN_PRESET,...patch}));
});
