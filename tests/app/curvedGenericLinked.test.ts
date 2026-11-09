import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compileGenericExpression,GenericTaylor,parseGenericLinkedResult,validateGenericLinkedQuery} from '../../src/app/curvedGenericLinked';

const load=(name:string)=>JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`,import.meta.url),'utf8'));
const fixture=load('origamica-generic-linked8');

test('native source q0/q1/gamma0 and actual all-band geometry strictly read back',()=>{
  const out=parseGenericLinkedResult(fixture,fixture.query);assert.equal(out.certification.bandCount,2);
  assert.equal(out.query.gamma0Expression,'1.8+0.1*sin(s)');assert.equal(out.certification.integrationErrorIntervalCertified,false);
  assert.ok(out.diagnostics.maxMetricError<1e-9);assert.ok(out.diagnostics.parameterDomain.seamChecks>0);
});
test('all six actual noncircle curves preserve nonlinear q and nonconstant gamma with five bands',()=>{
  const input=load('origamica-generic-linked-five8'),out=parseGenericLinkedResult(input,input.query);
  assert.equal(out.certification.bandCount,5);assert.equal(out.sample.rows[2].foldedCurves.length,6);
  assert.match(out.query.q0Expression,/Sin/);assert.match(out.query.gamma0Expression,/Sin/);
});
test('Wolfram scalar spelling implicit products and independent Taylor derivatives',()=>{
  const native=compileGenericExpression('2 Sin[u] + 0.3u^2 + ArcTan[u]','u'),u=.2,jet=native(new GenericTaylor([u,1,0,0,0]));
  assert.ok(Math.abs(jet.c[0]-(2*Math.sin(u)+.3*u*u+Math.atan(u)))<1e-14);
  assert.ok(Math.abs(jet.c[1]-(2*Math.cos(u)+.6*u+1/(1+u*u)))<1e-14);
  for(const source of ['u.__class__','import(u)','[u,1]','sin(u,2)','u**u','u**9','true','window.alert(u)'])assert.throws(()=>compileGenericExpression(source,'u'));
});
test('source parameter storage exact round trip and rejected unknown fields',()=>{
  const q=validateGenericLinkedQuery(fixture.query);assert.deepEqual(validateGenericLinkedQuery(JSON.parse(JSON.stringify(q))),q);
  for(const patch of [{rootSeeds:[]},{segments:true},{q0Expression:'u'},{curves:q.curves.slice(0,2)},{injected:1}])assert.throws(()=>validateGenericLinkedQuery({...q,...patch}));
});
test('small native curves with very large translations retain independent geometry',()=>{
  for(const name of ['origamica-generic-linked8-scale1e-6','origamica-generic-linked8-scale1e-8','origamica-generic-linked-trig-origin8']){
    const input=load(name),out=parseGenericLinkedResult(input,input.query);assert.ok(out.diagnostics.maxMetricError<1e-9);
    assert.equal(out.certification.bandCount,2);
  }
});
test('conservative paper certificate unknown leaves real local isometric read-only result visible',()=>{
  const input=load('origamica-generic-linked-unknown8'),out=parseGenericLinkedResult(input,input.query);
  assert.equal(out.certification.planarPaperInjectivityCertified,false);assert.equal(out.certification.globalBoundaryInjectivityChecked,false);
  assert.equal(out.certification.fullIntervalRegularityCertified,true);assert.equal(out.sample.rows.length,9);
});
test('tampered sources dropped bands false certificates roots points angles and normalization are rejected',()=>{
  const mutations=[
    (o:any)=>o.query.gamma0Expression='1.8',
    (o:any)=>o.source.savedNumericalOut=true,
    (o:any)=>o.certification.adoptableCreasePattern=true,
    (o:any)=>o.certification.integrationErrorIntervalCertified=true,
    (o:any)=>o.diagnostics.parameterDomain.seamChecks--,
    (o:any)=>o.diagnostics.parameterDomain.roundingModel='exact real proof',
    (o:any)=>o.diagnostics.parameterDomain.coordinateNormalization.scale*=2,
    (o:any)=>o.sample.rows[1].foldedCurves.pop(),
    (o:any)=>o.sample.rows[2].qValues[2]+=.01,
    (o:any)=>o.sample.rows[3].foldAnglesDeg[1]+=1,
    (o:any)=>o.sample.rows[4].normalizedFlatCurves[2][0]+=.01,
    (o:any)=>o.sample.rows[5].normalizedFoldedDerivatives[2][0]+=.01,
    (o:any)=>{for(const r of o.sample.rows){r.normalizedFoldedCurves=r.normalizedFlatCurves.map((p:number[])=>[...p,0]);r.normalizedFoldedDerivatives=r.normalizedFlatDerivatives.map((p:number[])=>[...p,0]);r.foldedCurves=r.flatCurves.map((p:number[])=>[...p,0]);r.foldedDerivatives=r.flatDerivatives.map((p:number[])=>[...p,0]);}},
    (o:any)=>{for(const r of o.sample.rows)for(const p of r.normalizedFoldedCurves)p[0]+=1;},
  ];
  for(const change of mutations){const data=structuredClone(fixture);change(data);assert.throws(()=>parseGenericLinkedResult(data,fixture.query));}
});
