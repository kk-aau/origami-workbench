import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GENERIC_NEAR_WIDTH_PRESET,makeNearWidthEvaluator,parseGenericNearWidthResult,validateGenericNearWidthQuery} from '../../src/app/curvedGenericNearWidth';
const fixture=(name:string)=>JSON.parse(readFileSync(new URL(`../fixtures/origamica-generic-near-width-${name}.json`,import.meta.url),'utf8'));

test('generic near-width reads four backend curves from original coordinate functions',()=>{
  for(const name of ['saved','noncircle','space','tiny']){const r=fixture(name);assert.deepEqual(parseGenericNearWidthResult(r,r.query),r);}
});
test('original symbolic scale and its differential agree with the saved secant identity',()=>{
  const at=makeNearWidthEvaluator(GENERIC_NEAR_WIDTH_PRESET);
  for(const s of [0,.1,.4,Math.PI/3]){const r=at(s);assert.ok(Math.abs(r.scale-1/Math.cos(s))<1e-12);
    assert.ok(Math.abs(r.scaleDerivative-Math.sin(s)/Math.cos(s)**2)<1e-12);assert.ok(Math.abs(r.outer[1]-.5)<1e-12);}
});
test('non-unit director keeps source magnitude and is not misrepresented as exact perpendicular distance',()=>{
  const r=fixture('noncircle');parseGenericNearWidthResult(r,r.query);assert.deepEqual(r.sample.rows[0].director,[.6,1]);
  assert.ok(r.sample.rows[0].localPerpendicularDistance>.5);assert.equal(r.certification.nearestFootDistanceChecked,false);
});
test('generic near-width rejects source swaps and forged paper or interpolation claims',()=>{
  const original=fixture('space');for(const change of [
    (r:any)=>r.query.baseCurve[2]='s/3',(r:any)=>r.source.directorNormalized=true,
    (r:any)=>r.source.wolframInterpolationReproduced=true,(r:any)=>r.certification.paperRegularityChecked=true,
    (r:any)=>r.certification.exactStraightCreaseFOLD=true,(r:any)=>r.proof.cells[0].start=.1,
    (r:any)=>r.proof.cells[0].radicandLowerBound=2,(r:any)=>r.proof.cells[0].scaleUpperBound=.5,
    (r:any)=>r.proof.status='unknown',
  ]){const r=structuredClone(original);change(r);assert.throws(()=>parseGenericNearWidthResult(r,original.query));}
});
test('tiny translated source cannot conceal changes to normalized coordinates or physical derivatives',()=>{
  const original=fixture('tiny');for(const change of [
    (r:any)=>r.sample.rows[10].normalizedOuter[0]+=.001,(r:any)=>r.sample.rows[10].baseDerivative[0]+=1e-10,
    (r:any)=>r.sample.rows[10].rulingLength+=1e-10,(r:any)=>r.sample.rows[10].scaleDerivative+=.001,
  ]){const r=structuredClone(original);change(r);assert.throws(()=>parseGenericNearWidthResult(r,original.query));}
});
test('query preserves safe Wolfram spelling and source direction; rejects executable code and dimensions',()=>{
  const q=validateGenericNearWidthQuery({...GENERIC_NEAR_WIDTH_PRESET,director:['Sin[s]','Cos[s]'],width:0});
  assert.deepEqual(q.director,['Sin[s]','Cos[s]']);assert.equal(q.width,0);
  for(const patch of [{baseCurve:['s']},{director:['0','0','1']},{director:['s.constructor','1']},{director:[null,'1']},
    {width:true},{parameterEnd:0},{segments:2},{fake:1}])assert.throws(()=>validateGenericNearWidthQuery({...GENERIC_NEAR_WIDTH_PRESET,...patch}));
});
test('a small nonzero denominator in a source function remains valid',()=>{
  const at=makeNearWidthEvaluator({...GENERIC_NEAR_WIDTH_PRESET,baseCurve:['s/(1e-8*1e-8)','0'],director:['0','1'],parameterEnd:.25});
  const r=at(.2);assert.equal(r.scale,1);assert.ok(Math.abs(r.outer[1]-.5)<1e-12);
});
