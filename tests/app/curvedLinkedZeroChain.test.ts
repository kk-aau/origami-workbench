import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {parseLinkedZeroChainResult,validateLinkedZeroChainQuery} from
  '../../src/app/curvedLinkedZeroChain';

// Locally computed source-equation sample, not a saved Mathematica Out.
const fixture=JSON.parse(readFileSync(fileURLToPath(new URL(
  '../fixtures/origamica-linked-zero-chain8.json',import.meta.url)),'utf8'));
const query={family:'linked-concentric-first-band' as const,
  variant:'zero-chain' as const,segments:8};

test('zero-perturbation four-band sample stays read-only and locally isometric',()=>{
  const result=parseLinkedZeroChainResult(fixture,query);
  assert.equal(result.sample.rows.length,9);
  assert.equal(result.sample.rows[0].foldedCurves.length,5);
  assert.equal(result.certification.fourBandsAnalyticLocalIsometry,true);
  assert.equal(result.certification.singleSheetContinuous,true);
  assert.equal(result.certification.boundaryEndContact,true);
  assert.equal(result.certification.globalLayerOrderChecked,false);
  assert.equal(result.certification.adoptableCreasePattern,false);
  assert.equal(result.source.savedQ1Perturbation,.1);
  assert.equal(result.source.subdomainQ1Perturbation,0);
});

test('zero-perturbation contract rejects forged source, layer claims and geometry',()=>{
  for(const change of [
    (value:typeof fixture)=>{value.source.subdomainQ1Perturbation=.1;},
    (value:typeof fixture)=>{value.certification.globalLayerOrderChecked=true;},
    (value:typeof fixture)=>{value.certification.adoptableCreasePattern=true;},
    (value:typeof fixture)=>{value.sample.rows[2].flatCurves[3][0]+=.1;},
    (value:typeof fixture)=>{value.sample.rows[4].foldedCurves[3][2]+=.1;},
    (value:typeof fixture)=>{value.sample.rows[8].foldedCurves[4][0]+=.1;},
  ]){
    const value=structuredClone(fixture);change(value);
    assert.throws(()=>parseLinkedZeroChainResult(value,query));
  }
  assert.throws(()=>validateLinkedZeroChainQuery({...query,segments:129}));
  assert.throws(()=>validateLinkedZeroChainQuery({...query,q1Perturbation:.1}));
});
