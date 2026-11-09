import test from 'node:test';
import assert from 'node:assert/strict';
import {proveUncurlStraightIdentity,UNCURL_STRAIGHT_IDENTITY_LIMITS} from '../../src/app/curvedUncurlStraightIdentity';

test('exact source algebra proves nonuniform straight curves independently of all sampled parameter values',()=>{
  for(const curve of [
    ['s**2','2*s**2','3*s**2'],
    ['1e12+s**2','-1e12+2*s**2','3*s**2+.7'],
    ['.1*s+.3*s**2','-.2*s-.6*s**2','.5*(.1*s+.3*s**2)'],
    ['(s+s**2)/(1+s**2)','-3*(s+s**2)/(1+s**2)','.17*(s+s**2)/(1+s**2)+12'],
    ['s**-2','2*s**-2','3*s**-2'],['1','2','3'],
  ])assert.equal(proveUncurlStraightIdentity(curve),true,JSON.stringify(curve));
});
test('same analytic call subtrees and symbolic chain derivatives prove arbitrary constant-multiple lines',()=>{
  for(const f of ['sin(s)','cos(s*s)','exp(s)','atan(s)','log(1+s)','sqrt(1+s*s)','sin(s)/(2+cos(s))'])
    assert.equal(proveUncurlStraightIdentity([f,'2*('+f+')','-.3*('+f+')+1e9']),true,f);
  assert.equal(proveUncurlStraightIdentity(['Sin[s]','2Sin[s]','3Sin[s]']),true);
  // This proof is conditional on source derivatives being defined. Recovery at
  // s=0 still requires the caller's original C/C'/C'' and positive-speed gates.
  assert.equal(proveUncurlStraightIdentity(['sqrt(s)','2*sqrt(s)','3*sqrt(s)']),true);
});
test('a genuine arbitrarily small bend is never erased by an epsilon or zero sampled jets',()=>{
  for(const tiny of ['1e-140','1e-220','1e-320'])assert.equal(proveUncurlStraightIdentity(['s',tiny+'*s**2','0']),false,tiny);
  for(const curve of [['s','s**2','0'],['s','s**3','s**4'],['s','s**2/(1+s*s)','0']])assert.equal(proveUncurlStraightIdentity(curve),false);
});
test('maximal compensated constant folding keeps real tiny coefficients and domain failures',()=>{
  assert.equal(proveUncurlStraightIdentity(['s','(1e9+1e-8-1e9)*s**2','0']),false);
  assert.equal(proveUncurlStraightIdentity(['(1e9+1e-8-1e9)*s**2','2*s**2','3*s**2']),true);
  for(const source of ['sqrt(-1)','1/0','log(-1)','exp(1e12)'])assert.equal(proveUncurlStraightIdentity(['s',source,'0']),null,source);
});
test('opaque analytic relations and hard proof budgets remain unknown without guessed certificates',()=>{
  assert.equal(proveUncurlStraightIdentity(['sin(s)','cos(s)','0']),null);
  const f='((s+1)**8)**8';assert.equal(proveUncurlStraightIdentity([f,'2*('+f+')','3*('+f+')']),null);
  assert.equal(proveUncurlStraightIdentity(['process.exit()','s','0']),null);
  assert.equal(proveUncurlStraightIdentity(['s','0']),null);
  assert.deepEqual(UNCURL_STRAIGHT_IDENTITY_LIMITS,{terms:256,degree:64,coefficientBits:4096,multiplicationSteps:32768,derivedNodes:8192,offsetProducts:262144});
});
