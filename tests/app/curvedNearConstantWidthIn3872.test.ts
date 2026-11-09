import test from 'node:test';
import assert from 'node:assert/strict';
import {NEAR_WIDTH_SAVED,nearWidthRowAt,nearWidthStripAt,sampleNearWidthSaved}
  from '../../src/app/curvedNearConstantWidthIn3872';

const near=(actual:number,expected:number,tol=1e-12)=>
  assert.ok(Math.abs(actual-expected)<tol,`${actual} ≠ ${expected}`);

test('In[3872]/In[3875] fixed inputs and saved symbolic/numeric provenance',()=>{
  assert.equal(NEAR_WIDTH_SAVED.analyticCell,'In[3872]');
  assert.equal(NEAR_WIDTH_SAVED.numericCell,'In[3875]');
  near(NEAR_WIDTH_SAVED.parameterEnd,Math.PI/3);
  assert.throws(()=>nearWidthRowAt(-.01));
  assert.throws(()=>nearWidthRowAt(Math.PI/3+.01));
  assert.throws(()=>nearWidthStripAt(.1,1.01));
});

test('source scale is sec(u), giving exactly horizontal upper boundary',()=>{
  for(const u of [0,.1,.4,.8,Math.PI/3]){
    const row=nearWidthRowAt(u);
    near(row.scale,1/Math.cos(u));
    near(row.rulingLength,.5/Math.cos(u));
    near(row.outer[0],u+.5*Math.tan(u));
    near(row.outer[1],.5);
    near(Math.hypot(row.director[0],row.director[1]),1);
    for(const s of [0,.25,.5,1]){
      const p=nearWidthStripAt(u,s);
      near(p[0],u+s*row.rulingLength*row.director[0]);
      near(p[1],s*row.rulingLength*row.director[1]);
      const jac=.5*(1+.5*s/(Math.cos(u)**2));
      assert.ok(jac>=.5);
    }
  }
});

test('both saved calls share the fixed analytic input but no fake Wolfram interpolation or FOLD',()=>{
  const symbolic=sampleNearWidthSaved('In[3872]');
  const numeric=sampleNearWidthSaved('In[3875]');
  assert.deepEqual(symbolic.rows,numeric.rows);
  assert.equal(symbolic.rows.length,97);
  near(symbolic.rows.at(-1)!.scale,2);
  for(const result of [symbolic,numeric]){
    assert.ok(result.diagnostics.scaleIdentityMaximumResidual<1e-12);
    assert.ok(result.diagnostics.outerHeightMaximumResidual<1e-12);
    assert.equal(result.diagnostics.globalStripInjective,true);
    assert.equal(result.wolframInterpolationReproduced,false);
    assert.equal(result.machineReadableWolframOut,false);
    assert.equal(result.exactStraightCreaseFOLD,false);
    assert.equal(result.adoptableCreasePattern,false);
  }
});
