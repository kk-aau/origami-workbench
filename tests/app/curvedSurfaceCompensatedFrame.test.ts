import test from 'node:test';
import assert from 'node:assert/strict';
import {surfaceCompensatedRoundTrip,compensatedSurfaceFrame} from '../../src/app/curvedSurfaceCompensatedFrame';
import {compileSurfaceExpression} from '../../src/app/curvedNativeSurfaceSystem';
test('binary big-float conversion retains representable subnormals without intermediate exponent underflow',()=>{
  for(const value of [Number.MIN_VALUE,1e-320,1e-310,1e-300,1e-110,1,Number.MAX_VALUE])
    for(const sign of [1,-1])assert.equal(surfaceCompensatedRoundTrip(value*sign),value*sign);
});
test('structural constant roots are zero but sampled zero jets cannot regularize sqrt(u cubed)',()=>{
  for(const source of ['sqrt(0)','sqrt(sin(0))','sqrt(1-1)','sqrt(0*u)'])
    assert.deepEqual(compileSurfaceExpression(source).evaluate(0,0).c,[0,0,0,0,0,0]);
  for(const source of ['sqrt(u**3)','sqrt(u**2)','sqrt(-1)'])assert.throws(()=>compileSurfaceExpression(source).evaluate(0,0));
  assert.equal(compileSurfaceExpression('sqrt((1e-220)**2)').evaluate(0,0).c[0],1e-220); // A positive exact ground AST is never promoted to zero.
});
test('implicit and compensated source chains preserve both 1e110 and nonzero 1e-220 second derivatives',()=>{
  const e=compileSurfaceExpression('sqrt(1e-220+u**2)');assert.ok(Math.abs((e.evaluate(0,0).c[3] as number)/1e110-1)<1e-13);
  for(const u of [.125,.5,1]){const actual=e.evaluate(u,0).c[3] as number,expected=1e-220/(u*u*u);
    assert.ok(actual>0);assert.ok(Math.abs(actual/expected-1)<1e-12);}
});
test('independent compensation solves original nonorthogonal UV operator instead of rounded frame congruence',()=>{
  for(const epsilon of [1e-8,1e-10,1e-12,1e-24])for(const t of [.5,1.25,1.4]){
    const r=compensatedSurfaceFrame([1,0,2*t],[1,epsilon,2*t],[0,0,2],[0,0,2],[0,0,2],epsilon/Math.hypot(1,2*t)),k=2/(1+4*t*t)**1.5;
    assert.ok(Math.abs(r.A[0][0]/k-1)<1e-13);assert.ok(Math.abs(r.A[0][1]/k-1)<1e-13);
    assert.equal(r.A[1][0],0);assert.equal(r.A[1][1],0);assert.equal(r.K,0);
  }
});
