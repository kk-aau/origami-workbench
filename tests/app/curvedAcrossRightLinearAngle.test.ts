import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LINEAR_ACROSS_SAVED,linearAcrossFrame,linearAcrossSignedJacobian,
  sampleLinearAcross,validateLinearAcrossParams,
} from '../../src/app/curvedAcrossRightLinearAngle';

const close=(actual:number,expected:number,tol=1e-11)=>
  assert.ok(Math.abs(actual-expected)<=tol,`${actual} != ${expected}`);

test('In[3984] source-derived saved endpoint and fold angle',()=>{
  const p=LINEAR_ACROSS_SAVED;
  const at=linearAcrossFrame(p,Math.PI/2);
  const t=Math.SQRT2-1,d=Math.hypot(.5,t);
  close(at.crease[0],0);
  close(at.crease[1],1);
  close(at.rightRuling[0],.5/d);
  close(at.rightRuling[1],t/d);
  close(at.foldAngleRad,Math.PI/4);
  close(Math.hypot(...at.rightRuling),1);
  assert.ok(linearAcrossFrame(p,.001).rightLeftNormalCoefficient<0);
});

test('right ruling has source coefficients and both strips stay before their focal sets',()=>{
  for(const u of [.001,.1,.6,Math.PI/2]){
    const f=linearAcrossFrame(LINEAR_ACROSS_SAVED,u);
    const t=Math.tan(u/4),d=Math.hypot(.5,t);
    close(f.rightTangentCoefficient,-.5/d);
    close(f.rightLeftNormalCoefficient,-t/d);
    for(const v of [0,.2,.7]){
      assert.ok(linearAcrossSignedJacobian(LINEAR_ACROSS_SAVED,'left',u,v)>0);
      assert.ok(linearAcrossSignedJacobian(LINEAR_ACROSS_SAVED,'right',u,v)<0);
    }
  }
});

test('In[3987] reference uses 64 interpolation points, while local samples are exact formula evaluations',()=>{
  const sample=sampleLinearAcross({...LINEAR_ACROSS_SAVED,curveSegments:64});
  assert.equal(sample.originalNumericInterpolationPoints,64);
  assert.deepEqual(sample.sourceCells,['In[3984]','In[3987]']);
  assert.equal(sample.frames.length,65);
  assert.equal(sample.frames[0].u,.001);
  assert.equal(sample.frames.at(-1)!.u,Math.PI/2);
  assert.equal(sample.leftBoundary.length,65);
  assert.equal(sample.rightBoundary.length,65);
  assert.equal(sample.exactStraightCreaseFOLD,false);
  assert.equal(sample.pairedThreeDimensionalSurface,false);
});

test('zero-angle point, focal width, malformed and unsupported parameters are rejected',()=>{
  for(const patch of [
    {parameterStart:0},{angleSlope:0},{angleSlope:1.1},
    {parameterEnd:2},{leftWidth:1},{leftWidth:0},
    {rightWidth:0},{rightWidth:3},{curveSegments:1},
    {curveSegments:64.5},{curveSegments:true},
    {parameterStart:NaN},{unsupported:1},
  ])assert.throws(()=>validateLinearAcrossParams({...LINEAR_ACROSS_SAVED,...patch}));
  assert.throws(()=>linearAcrossFrame(LINEAR_ACROSS_SAVED,0));
  assert.throws(()=>linearAcrossSignedJacobian(LINEAR_ACROSS_SAVED,'left',.2,1));
});
