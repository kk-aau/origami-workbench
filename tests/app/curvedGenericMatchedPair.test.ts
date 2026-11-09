import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {GENERIC_MATCHED_PRESET,makeGenericMatchedEvaluator,parseGenericMatchedResult,validateGenericMatchedQuery,
  type GenericMatchedResult} from '../../src/app/curvedGenericMatchedPair';
import {compileGenericExpression,GenericTaylor} from '../../src/app/curvedGenericLinked';

const fixtures=JSON.parse(readFileSync(new URL('../fixtures/curved-generic-matched-pair.json',import.meta.url),'utf8')) as Record<string,GenericMatchedResult>;
const clone=<T,>(x:T):T=>structuredClone(x);
const near=(a:number,b:number,tolerance=2e-9)=>assert.ok(Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);

test('MatchCurvesPair accepts original Wolfram syntax and preserves all five source strings',()=>{
  const q=validateGenericMatchedQuery(GENERIC_MATCHED_PRESET);assert.deepEqual(q,GENERIC_MATCHED_PRESET);
  const e=makeGenericMatchedEvaluator(q),p=e(0);
  assert.deepEqual(p.c,[2,0]);assert.deepEqual(p.cc,[1,0,1]);near(p.flatSpeed,1);near(p.spaceSpeed,1);
  near(p.flatCurvature,.5);near(p.spaceCurvature,1.6);near(p.curvatureGap,2.31);
  assert.equal(q.flatCurve[0],'2-4 Log[1+s^2/16]');assert.equal(q.spaceCurve[0],'0.5+0.5 Cos[4s/Sqrt[5]]');
  const tinyDenominator=compileGenericExpression('2e-16/(1e-16)+s','s')(new GenericTaylor([.3,1,0,0,0]));
  near(tinyDenominator.c[0],2.3);near(tinyDenominator.c[1],1);
  assert.throws(()=>compileGenericExpression('1/(1e-320)','s')(new GenericTaylor([.3,1,0,0,0])));
});

test('MatchCurvesPair rejects unsafe source, ambiguous signs and invalid physical domains',()=>{
  for(const source of ["__import__('os')",'process.exit(s)','Math.sin(s)','Sin[s,s]','s^0.5','u','s;1'])
    assert.throws(()=>validateGenericMatchedQuery({...GENERIC_MATCHED_PRESET,flatCurve:[source,'s']}));
  for(const patch of [{psi:0},{sigma:2},{rulingSegments:3},{segments:7},{parameterEnd:14},
    {transverseStart:1,transverseEnd:-1},{spaceCurve:['s','s']},{unexpected:1}])
    assert.throws(()=>validateGenericMatchedQuery({...GENERIC_MATCHED_PRESET,...patch}));
  const missing=clone(GENERIC_MATCHED_PRESET) as any;delete missing.psi;assert.throws(()=>validateGenericMatchedQuery(missing));
  assert.doesNotThrow(()=>validateGenericMatchedQuery({...GENERIC_MATCHED_PRESET,transverseStart:-1e-8,transverseEnd:2e-8}));
});

test('MatchCurvesPair strictly rereads actual Python fixtures for all four psi/sigma branches and saved circle',()=>{
  for(const name of ['noncircle_1_1','noncircle_1_-1','noncircle_-1_1','noncircle_-1_-1','circle']){
    const r=fixtures[name];assert.equal(parseGenericMatchedResult(r,r.query),r);
    const p=makeGenericMatchedEvaluator(r.query)(.7);
    for(const w of [-.83,-.11,.39,.94]){const metric=p.canonicalMetric(w);metric.flat.forEach((x,k)=>near(x,metric.space[k]));}
    assert.equal(r.certification.exactStraightCreaseFOLD,false);assert.equal(r.certification.adoptableCreasePattern,false);
  }
  const a=fixtures.noncircle_1_1.sample.rows[2],b=fixtures['noncircle_1_-1'].sample.rows[2];
  a.d.forEach((x,k)=>near(x,-b.d[k]));a.ddPrime.forEach((x,k)=>near(x,-b.ddPrime[k]));
});

test('MatchCurvesPair source jets follow nonlinear common s and nonzero original initial positions',()=>{
  const r=fixtures.nonlinear_common_s;parseGenericMatchedResult(r,r.query);
  const evaluate=makeGenericMatchedEvaluator(r.query),p=evaluate(.7),h=2e-5,left=evaluate(.7-h),right=evaluate(.7+h);
  near(p.flatSpeed,1+.05*Math.cos(.7));near(p.spaceSpeed,p.flatSpeed);assert.notDeepEqual(r.sample.rows[0].c,[2,0]);
  for(const key of ['d','dd'] as const)p[`${key}Prime`].forEach((x,k)=>near(x,(right[key][k]-left[key][k])/(2*h),1e-8));
  for(const w of [-.17,.13,.28])p.canonicalMetric(w).flat.forEach((x,k)=>near(x,p.canonicalMetric(w).space[k]));
  assert.deepEqual(r.query.flatCurve,clone(r.query).flatCurve);
});

test('MatchCurvesPair small physical scale with large translation is checked through stable normalized fields',()=>{
  const r=fixtures.small_scale_large_translation;parseGenericMatchedResult(r,r.query);
  near(r.diagnostics.parameterDomain.coordinateNormalization.scale/1e-8,1,1e-11);
  const q={...r.query,flatCurve:GENERIC_MATCHED_PRESET.flatCurve,spaceCurve:GENERIC_MATCHED_PRESET.spaceCurve,
    transverseStart:r.query.transverseStart/1e-8,transverseEnd:r.query.transverseEnd/1e-8},a=makeGenericMatchedEvaluator(r.query)(.8),b=makeGenericMatchedEvaluator(q)(.8);
  for(const key of ['normalizedC','normalizedCC','normalizedCPrime','normalizedCCPrime','unitD','unitDD','unitDPrime','unitDDPrime'] as const)
    a[key].forEach((x,k)=>near(x,b[key][k],2e-9));
  const wrong=clone(r);wrong.sample.rows[3].normalizedC[0]+=.01;assert.throws(()=>parseGenericMatchedResult(wrong,r.query));
  const wrongWidth=clone(r);wrongWidth.sample.grid[3][2].w+=1e-13;assert.throws(()=>parseGenericMatchedResult(wrongWidth,r.query));
  const tiny={...q,flatCurve:q.flatCurve.map(x=>`1e-16*(${x})`) as [string,string],spaceCurve:q.spaceCurve.map(x=>`1e-16*(${x})`) as [string,string,string],
    transverseStart:q.transverseStart*1e-16,transverseEnd:q.transverseEnd*1e-16},t=makeGenericMatchedEvaluator(tiny)(.8);
  t.normalizedC.forEach((x,k)=>near(x,b.normalizedC[k]));t.canonicalMetric(.13e-16).flat.forEach((x,k)=>near(x,t.canonicalMetric(.13e-16).space[k]));
});

test('MatchCurvesPair rejects source, geometry, branch, derivative, metric and normalization tampering',()=>{
  const original=fixtures.noncircle_1_1;
  const mutations=[(r:GenericMatchedResult)=>{r.query.flatCurve[0]+='+0.1';},
    (r:GenericMatchedResult)=>{r.source.notebookCells=[3865];},
    (r:GenericMatchedResult)=>{r.sample.rows[1].d[0]+=.01;},
    (r:GenericMatchedResult)=>{r.sample.rows[1].normalizedDDPrime[1]+=.01;},
    (r:GenericMatchedResult)=>{r.sample.rows[1].ccPrime[1]+=.01;},
    (r:GenericMatchedResult)=>{r.sample.grid[1][1].normalizedSpace[1]+=.01;},
    (r:GenericMatchedResult)=>{r.sample.grid[1][1].w+=.001;},
    (r:GenericMatchedResult)=>{r.diagnostics.parameterDomain.coordinateNormalization.flatOrigin[0]+=.01;},
    (r:GenericMatchedResult)=>{r.diagnostics.parameterDomain.coordinateNormalization.scale*=1.001;}];
  for(const mutation of mutations){const r=clone(original);mutation(r);assert.throws(()=>parseGenericMatchedResult(r,original.query));}
});

test('MatchCurvesPair rejects forged domain coverage, certificate dependencies and unsupported exact FOLD flags',()=>{
  const original=fixtures.noncircle_1_1;
  const mutations=[(r:GenericMatchedResult)=>{r.certification.exactStraightCreaseFOLD=true;},
    (r:GenericMatchedResult)=>{r.certification.selfCollisionChecked=true;},
    (r:GenericMatchedResult)=>{r.certification.fullIntervalRegularityCertified=false;},
    (r:GenericMatchedResult)=>{r.diagnostics.speedEquality.method='interval-relative-tolerance';},
    (r:GenericMatchedResult)=>{r.diagnostics.parameterDomain.intervals[0].end-=.0001;},
    (r:GenericMatchedResult)=>{r.diagnostics.parameterDomain.minimumCurvatureGapLowerBound=100;},
    (r:GenericMatchedResult)=>{r.diagnostics.parameterDomain.paperAxes=[[1,0],[1,0]];},
    (r:GenericMatchedResult)=>{(r.diagnostics as any).unknown=1;}];
  for(const mutation of mutations){const r=clone(original);mutation(r);assert.throws(()=>parseGenericMatchedResult(r,original.query));}
});

test('MatchCurvesPair preserves complete real geometry when global paper or interval certificate is unknown',()=>{
  const actual=fixtures.real_interval_unknown;parseGenericMatchedResult(actual,actual.query);assert.equal(actual.diagnostics.parameterDomain.certified,false);
  assert.equal(actual.certification.analyticSpeedEquality,true);assert.equal(actual.certification.fullIntervalRegularityCertified,false);
  assert.equal(actual.sample.rows.length,actual.query.segments+1);assert.equal(actual.sample.grid[0].length,actual.query.rulingSegments+1);
  const numerical=fixtures.numerical_speed;parseGenericMatchedResult(numerical,numerical.query);assert.equal(numerical.diagnostics.speedEquality.status,'numerical');
  assert.equal(numerical.certification.analyticLocalIsometry,false);assert.equal(numerical.certification.numericalIsometryToleranceCertified,true);
  const reverse=fixtures.negative_common_direction;parseGenericMatchedResult(reverse,reverse.query);
  const source=makeGenericMatchedEvaluator(reverse.query)(.4);assert.ok(source.normalizedFlatCurvature<0);source.canonicalMetric(.13).flat.forEach((x,k)=>near(x,source.canonicalMetric(.13).space[k]));
  const r=clone(fixtures.noncircle_1_1);assert.equal(r.certification.planarPaperInjectivityCertified,false);
  assert.equal(parseGenericMatchedResult(r,r.query).sample.grid.length,r.query.segments+1);
  const domain=r.diagnostics.parameterDomain;domain.certified=false;domain.reason='interval regularity subdivision budget unresolved; original domain retained';
  domain.minimumSpeedLowerBound=domain.minimumCurvatureLowerBound=domain.minimumCurvatureGapLowerBound=domain.minimumUDerivativeLowerBound=domain.minimumJacobianLowerBound=null;
  domain.minimumPaperSymmetricDeterminantLowerBound=null;domain.intervals=[];domain.verifiedCells=0;
  r.certification.fullIntervalRegularityCertified=r.certification.analyticLocalIsometry=r.certification.numericalIsometryToleranceCertified=false;
  const read=parseGenericMatchedResult(r,r.query);assert.equal(read.sample.rows.length,r.query.segments+1);assert.equal(read.sample.grid[0].length,r.query.rulingSegments+1);
});
