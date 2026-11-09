import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constantWidthAt} from '../../src/app/curvedConstantWidth';
import {GENERIC_CONSTANT_WIDTH_PRESET,makeConstantWidthEvaluator,parseGenericConstantWidthResult,validateGenericConstantWidthQuery} from '../../src/app/curvedGenericConstantWidth';
const fixture=(name:string)=>JSON.parse(readFileSync(new URL(`../fixtures/origamica-generic-constant-width-${name}.json`,import.meta.url),'utf8'));

test('generic constant-width literal equation retains the saved foot beyond the interpolation domain',()=>{
  for(const offset of [.1,-.1,0]){
    const q={...GENERIC_CONSTANT_WIDTH_PRESET,signedOffset:offset},at=makeConstantWidthEvaluator(q);
    for(const s of [0,.4,.8,q.parameterEnd]){
      const root=constantWidthAt(s,offset),r=at.evaluate(s,root.foot,root.width);
      assert.ok(r.residual<2e-15);assert.ok(Math.abs(r.normalDistance-offset)<2e-15);assert.equal(r.sign,1);
    }
    if(offset>0)assert.ok(constantWidthAt(q.parameterEnd,offset).foot>q.parameterEnd);
  }
});
test('the original sign is evaluated at the foot rather than at the queried source parameter',()=>{
  const u=.8,c=Math.cos(u),s=Math.sin(u),d=[.9*c-1,.9*s],end=[-c,-s];
  const director=d.map((x,i)=>`${x}+(${end[i]-x})*s/${u}`) as [string,string],
    at=makeConstantWidthEvaluator({...GENERIC_CONSTANT_WIDTH_PRESET,director}),r=at.evaluate(0,u,1);
  assert.ok(r.residual<2e-15);assert.equal(r.sign,1);assert.ok(r.foot.normal.reduce((v,x,i)=>v+x*r.at.director[i],0)<0);
  assert.ok(Math.abs(r.normalDistance-.1)<2e-15);
});
test('constant-width queries preserve source spelling and separate the finite foot evaluation domain',()=>{
  const q=validateGenericConstantWidthQuery({...GENERIC_CONSTANT_WIDTH_PRESET,director:['-2','0'],signedOffset:-.1});
  assert.deepEqual(q.director,['-2','0']);assert.equal(q.signedOffset,-.1);
  for(const patch of [{baseCurve:['s']},{director:['eval(s)','0']},{signedOffset:true},{parameterEnd:0},
    {footEvaluationStart:-100},{footEvaluationEnd:-1},{segments:129},{fake:true}])
    assert.throws(()=>validateGenericConstantWidthQuery({...GENERIC_CONSTANT_WIDTH_PRESET,...patch}));
});
test('six actual backend fixtures are independently read back from original source jets and implicit derivatives',()=>{
  for(const name of ['circle','parabola','sign','tiny','unknown','zero']){
    const r=fixture(name);assert.deepEqual(parseGenericConstantWidthResult(r,r.query),r);
  }
});
test('the saved analytic branch agrees with the general source-seeded circle root',()=>{
  const r=fixture('circle');for(const row of r.sample.rows){const old=constantWidthAt(row.s,r.query.signedOffset);
    assert.ok(Math.abs(row.scale-old.width)<2e-11);assert.ok(Math.abs(row.footParameter-old.foot)<2e-11);}
  assert.ok(r.sample.rows.at(-1).footParameter>r.query.parameterEnd);
  assert.equal(r.source.declaredTangentExtensionUnused,true);
});
test('returned feet, derivatives and root-box identities cannot be exchanged or forged',()=>{
  const original=fixture('parabola');for(const change of [
    (r:any)=>r.query.director[1]='2',(r:any)=>r.sample.rows[4].footParameter+=.02,
    (r:any)=>r.sample.rows[4].scaleDerivative+=.01,(r:any)=>r.sample.rows[4].footParameterDerivative+=.01,
    (r:any)=>r.proof.cells[0].footBounds=[.8,.9],(r:any)=>r.proof.cells[0].start+=.02,
    (r:any)=>r.proof.minimumSeamRootDerivativeLowerBound=0,
    (r:any)=>r.diagnostics.paperRegularity.minimumAbsoluteJacobianLowerBound=1,
    (r:any)=>r.source.findRootOptionsForwarded=true,(r:any)=>r.source.interpolationReproduced=true,
  ]){const r=structuredClone(original);change(r);assert.throws(()=>parseGenericConstantWidthResult(r,original.query));}
});
test('tiny translated coordinates do not conceal physical derivative or distance corruption',()=>{
  const original=fixture('tiny');for(const change of [
    (r:any)=>r.sample.rows[4].normalizedFoot[0]+=.001,(r:any)=>r.sample.rows[4].outerDerivative[0]+=1e-10,
    (r:any)=>r.sample.rows[4].scaleDerivative+=1e-10,(r:any)=>r.sample.rows[4].perpendicularDistance+=1e-10,
  ]){const r=structuredClone(original);change(r);assert.throws(()=>parseGenericConstantWidthResult(r,original.query));}
});
test('finite zero distance and budget unknown are distinct from regular paper and global nearest-foot claims',()=>{
  const z=fixture('zero'),u=fixture('unknown'),s=fixture('sign');
  assert.equal(z.diagnostics.paperRegularity.status,'degenerate');assert.equal(z.certification.paperRegularityCertified,false);
  assert.ok(z.sample.rows.every((r:any)=>r.scale===0&&r.footParameter===r.s));
  assert.equal(u.proof.status,'unknown');assert.equal(u.certification.fullIntervalDistanceCertified,false);
  assert.equal(u.sample.rows.length,u.query.segments+1);assert.equal(u.sample.rows[0].s,u.query.parameterStart);
  assert.equal(u.sample.rows.at(-1).s,u.query.parameterEnd);assert.ok(s.sample.rows.every((r:any)=>r.branchSign===-1&&r.scale<0));
  for(const key of ['continuousRootBranchCertified','nearestFootDistanceChecked','selfCollisionChecked','adoptableCreasePattern']){
    const r=structuredClone(u);r.certification[key]=true;assert.throws(()=>parseGenericConstantWidthResult(r,u.query));
  }
});
