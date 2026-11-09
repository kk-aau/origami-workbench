import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {parseLinkedFirstBandResult,validateLinkedFirstBandQuery} from
  '../../src/app/curvedLinkedFirstBand';

// This is the project's own backend sample, not a saved Wolfram numerical Out.
const fixture=JSON.parse(readFileSync(fileURLToPath(new URL(
  '../fixtures/origamica-linked-first-band8.json',import.meta.url)),'utf8'));
const query={family:'linked-concentric-first-band' as const,segments:8};

test('saved linked-circle first band parses only a local-isometry read-only sample',()=>{
  const result=parseLinkedFirstBandResult(fixture,query);
  assert.equal(result.sample.rows.length,9);
  assert.equal(result.certification.firstBandAnalyticLocalIsometry,true);
  assert.equal(result.certification.wholeFiveFoldChainCertified,false);
  assert.equal(result.certification.exactStraightCreaseFOLD,false);
  assert.equal(result.certification.adoptableCreasePattern,false);
  assert.equal(result.sample.rows[2].s,Math.PI/4);
});

test('linked first-band contract rejects altered source, false FOLD and mismatched rulings',()=>{
  for(const change of [
    (value:typeof fixture)=>{value.source.savedNumericalOut=true;},
    (value:typeof fixture)=>{value.certification.wholeFiveFoldChainCertified=true;},
    (value:typeof fixture)=>{value.certification.adoptableCreasePattern=true;},
    (value:typeof fixture)=>{value.sample.rows[3].flatSecond[0]+=.1;},
    (value:typeof fixture)=>{value.sample.rows[4].foldedSecond[2]+=.1;},
  ]){
    const value=structuredClone(fixture);change(value);
    assert.throws(()=>parseLinkedFirstBandResult(value,query));
  }
  assert.throws(()=>validateLinkedFirstBandQuery({family:query.family,segments:129}));
  assert.throws(()=>validateLinkedFirstBandQuery({family:query.family,segments:8,gamma1:120}));
});
