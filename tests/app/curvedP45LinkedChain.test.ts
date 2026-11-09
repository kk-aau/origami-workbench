import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {parseP45LinkedChainResult,validateP45LinkedChainQuery} from
  '../../src/app/curvedP45LinkedChain';

const fixture=JSON.parse(readFileSync(fileURLToPath(new URL(
  '../fixtures/origamica-p45-linked-chain8.json',import.meta.url)),'utf8'));
const ip64=JSON.parse(readFileSync(fileURLToPath(new URL(
  '../fixtures/origamica-p45-linked-chain8-ip64.json',import.meta.url)),'utf8'));
const query={family:'linked-concentric-first-band' as const,
  variant:'saved-chain' as const,segments:8};

test('saved nonzero-perturbation five curves retain local numerical limits',()=>{
  const result=parseP45LinkedChainResult(fixture,query);
  assert.equal(result.sample.rows.length,9);
  assert.equal(result.sample.rows[0].foldedCurves.length,5);
  assert.equal(result.source.interpolationIntervals,32);
  assert.equal(result.certification.wolframNumericalOutputReproduced,false);
  assert.equal(result.certification.secondBandIsometric,false);
  assert.equal(result.certification.adoptableCreasePattern,false);
  assert.ok(result.diagnostics.q4EndpointExtrapolation>.006);
  assert.ok(result.diagnostics.maxNodeRootResidual<1e-10);
});

test('saved five-curve contract rejects adoption claims and distorted coordinates',()=>{
  for(const change of [
    (value:typeof fixture)=>{value.source.interpolationIntervals=64;},
    (value:typeof fixture)=>{value.certification.secondBandIsometric=true;},
    (value:typeof fixture)=>{value.certification.adoptableCreasePattern=true;},
    (value:typeof fixture)=>{value.diagnostics.secondBandGeodesicMismatchAtZero=0;},
    (value:typeof fixture)=>{value.sample.rows[4].qValues[1]+=.1;},
    (value:typeof fixture)=>{value.sample.rows[4].flatCurves[3][0]+=.1;},
    (value:typeof fixture)=>{value.sample.rows[4].foldedCurves[3][2]+=.1;},
  ]){
    const value=structuredClone(fixture);change(value);
    assert.throws(()=>parseP45LinkedChainResult(value,query));
  }
  assert.throws(()=>validateP45LinkedChainQuery({...query,segments:129}));
  assert.throws(()=>validateP45LinkedChainQuery({...query,epsilon:0}));
});

test('changing source interpolation points re-solves the finite diagram',()=>{
  const alternate={...query,interpolationPoints:64};
  const result=parseP45LinkedChainResult(ip64,alternate);
  assert.equal(result.source.interpolationIntervals,64);
  assert.ok(result.diagnostics.maxNodeRootResidual<1e-10);
  assert.ok(result.diagnostics.q4EndpointExtrapolation<
    fixture.diagnostics.q4EndpointExtrapolation);
  assert.ok(Math.abs(result.sample.rows[0].qValues[4]-
    fixture.sample.rows[0].qValues[4])>.003);
  assert.equal(result.certification.adoptableCreasePattern,false);
  for(const change of [
    (value:typeof ip64)=>{value.source.interpolationIntervals=32;},
    (value:typeof ip64)=>{value.diagnostics.q4EndpointExtrapolation=.0064;},
    (value:typeof ip64)=>{value.sample.rows[0].qValues[4]=.0064;},
  ]){
    const value=structuredClone(ip64);change(value);
    assert.throws(()=>parseP45LinkedChainResult(value,alternate));
  }
  assert.throws(()=>validateP45LinkedChainQuery({...query,interpolationPoints:7}));
  assert.throws(()=>validateP45LinkedChainQuery({...query,interpolationPoints:129}));
});
