import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileSurfaceExpression,makeGenericSurfaceSystemReference,parseGenericSurfaceSystemResult,
  SURFACE_SYSTEM_NATIVE_PRESET,SURFACE_BASIC_RULES,SurfaceJet,validateGenericSurfaceSystemQuery,
  fetchGenericSurfaceSystemWhenIdle,fetchGenericSurfaceNormalWhenIdle,SurfaceInterval} from '../../src/app/curvedNativeSurfaceSystem';
const fixtures=JSON.parse(fs.readFileSync('tests/fixtures/curved-surface-system-native-20261001.json','utf8')).cases,
  fixture=(name:string)=>fixtures.find((c:{name:string})=>c.name===name),copy=<T>(x:T):T=>JSON.parse(JSON.stringify(x));

test('both public surface queries retry the actual Chinese busy response and cancel superseded waiting inputs',async()=>{
  const previous=globalThis.fetch,normal=JSON.parse(fs.readFileSync('tests/fixtures/curved-surface-normal-native-20261001.json','utf8')).cases[0];
  const targets=[{call:fetchGenericSurfaceSystemWhenIdle,source:fixtures[0]},{call:fetchGenericSurfaceNormalWhenIdle,source:normal}];
  try{for(const {call,source} of targets){
    let calls=0;const busy=()=>new Response(JSON.stringify({error:'已有镶嵌计算正在进行，请等待或取消后重试。'}),{status:429});
    globalThis.fetch=async()=>++calls===1?busy():new Response(JSON.stringify(source.response),{status:200});
    assert.deepEqual(await call(source.query),source.response);assert.equal(calls,2);
    const controller=new AbortController();calls=0;globalThis.fetch=async()=>{calls++;return busy();};
    const pending=call(source.query,controller.signal);setTimeout(()=>controller.abort(),20);
    await assert.rejects(pending,(error:any)=>error.name==='AbortError');assert.equal(calls,1);
    calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:'原曲面参数退化'}),{status:422});};
    await assert.rejects(()=>call(source.query),/参数退化/);assert.equal(calls,1);
  }}finally{globalThis.fetch=previous;}
});

test('43 actual two-variable SurfaceSystem sources strictly replay every rule and full rectangle',()=>{
  assert.equal(fixtures.length,43);
  for(const c of fixtures)assert.doesNotThrow(()=>parseGenericSurfaceSystemResult(c.response,c.query),c.name);
  assert.equal(fixture('unresolved-off-grid-rank').response.domain.certified,false);
  assert.equal(fixture('sphere-without-principal').response.source.ruleOrder.length,12);
});
test('bounded exact zero identities preserve mixed derivatives against independent 80-digit literal formulas',()=>{
  const refs=JSON.parse(fs.readFileSync('tests/fixtures/origamica-surface-zero-identities-independent-80digit.json','utf8'));
  assert.equal(refs.productionImported,false);assert.equal(refs.precision,80);
  const numbers=(x:any):any=>Array.isArray(x)?x.map(numbers):Number(x),
    close=(actual:any,expected:any)=>{if(Array.isArray(expected)){assert.equal(actual.length,expected.length);expected.forEach((x:any,i:number)=>close(actual[i],x));}
      else assert.ok(Math.abs(actual-expected)<=4e-14*Math.max(Math.abs(expected),1),`${actual} != ${expected}`);};
  for(const c of refs.cases){const q={...SURFACE_SYSTEM_NATIVE_PRESET,surface:c.surface,uStart:c.uStart,uEnd:1,vEnd:1,uSegments:8,vSegments:8},k=makeGenericSurfaceSystemReference(q),scale=k.normalization.scale;
    for(const row of c.rows){const own=k.evaluate(row.uv[0],row.uv[1]);
      close(own.point.map((x,i)=>x*scale+k.normalization.sourceOrigin[i]),numbers(row.point));
      close([own.su,own.sv].map(a=>a.map(x=>x*scale)),numbers(row.tangents));
      close([own.suu,own.suv,own.svv].map(a=>a.map(x=>x*scale)),numbers(row.second));
      close(own.rules.SurfaceNormal,numbers(row.normal));close(own.rules.CurvatureMatrix.map(a=>a.map(x=>x/scale)),numbers(row.A));
      close(own.rules.MeanCurvature/scale,numbers(row.H));close(own.rules.GaussianCurvature/(scale*scale),numbers(row.K));}
    if(c.uStart===0&&!c.name.endsWith('tiny-domain')){
      const j=compileSurfaceExpression('sqrt('+c.zeroArgument+')').evaluate(new SurfaceInterval(0,.5),new SurfaceInterval(0,.5));
      assert.ok(j.c.every(x=>x instanceof SurfaceInterval&&x.lo===0&&x.hi===0),c.name);}}
});
test('proved cancellation checks every original denominator, negative power, logarithm and root domain',()=>{
  for(const source of ['sqrt(1/u-1/u)','sqrt(u**-1-u**-1)','sqrt((1/u)**0-1)','sqrt(0*(1/u))',
    'sqrt(log(u)-log(u))','sqrt(0*log(-1))','sqrt(0*sqrt(-1))','sqrt(1/(u-u)-1/(u-u))',
    'sqrt(tan(pi/2)-tan(pi/2))','sqrt(exp(log(u))*exp(-log(u))-1)','sqrt(u**3)','sqrt(u**2)'])
    assert.throws(()=>compileSurfaceExpression(source).evaluate(0,0),source);
  assert.throws(()=>compileSurfaceExpression('sqrt(sqrt(-u)-sqrt(-u))').evaluate(.1,0));
  for(const source of ['sqrt(1/u-1/u)','sqrt(u**-2-1/(u*u))','sqrt(log(u)-log(u))','sqrt((1/u)**0-1)']){
    assert.deepEqual(compileSurfaceExpression(source).evaluate(.2,.3).c,[0,0,0,0,0,0],source);
    assert.throws(()=>compileSurfaceExpression(source).evaluate(new SurfaceInterval(0,1),new SurfaceInterval(0,1)),source);}
  assert.deepEqual(compileSurfaceExpression('sqrt(1/u-1/u)').evaluate(1e-320,0).c,[0,0,0,0,0,0]);
  assert.deepEqual(compileSurfaceExpression('sqrt(1/(sin(1e-220)+1-1)-1/(sin(1e-220)+1-1))').evaluate(0,0).c,[0,0,0,0,0,0]);
  assert.deepEqual(compileSurfaceExpression('sqrt(sqrt(u*u)-sqrt(u*u))').evaluate(0,0).c,[0,0,0,0,0,0]);
  for(const source of ['sqrt(tan(pi*u/2)-tan(pi*u/2))','sqrt(1/cos(pi*u/2)-1/cos(pi*u/2))','sqrt(log(sin(pi*u))-log(sin(pi*u)))'])
    assert.throws(()=>compileSurfaceExpression(source).evaluate(1,0),source);
});
test('zero identity sources reject fabricated mixed jets, normals and undefined replacement ASTs',()=>{
  for(const name of ['identity-variable-difference','identity-mixed-cubic','identity-pythagorean','identity-rational-copy','identity-exponential-product']){
    const c=fixture(name);for(const change of [(r:any)=>{r.sample.rows[3].sourceSecondDerivatives[1][2]=0;},
      (r:any)=>{r.grid.rows[3][4].rules.SurfaceNormal=[0,0,1];},(r:any)=>{r.sample.rows[5].rules.MeanCurvature=0;}]){
      const r=copy(c.response);change(r);assert.throws(()=>parseGenericSurfaceSystemResult(r,c.query),name);}}
  const c=fixture('identity-variable-difference');
  for(const source of ['sqrt(u**3)','sqrt(1/u-1/u)','sqrt((1/u)**0-1)','sqrt(0*sqrt(-1))']){
    const r=copy(c.response);r.query.surface[2]='u*v+.3*v**2+'+source;assert.throws(()=>parseGenericSurfaceSystemResult(r,r.query),source);}
});
test('tiny nonzero second derivatives and original ill-conditioned UV matrix cannot be erased or replaced',()=>{
  const tiny=fixture('boundary-smooth-tiny-root');
  for(const change of [(r:any)=>{r.grid.rows[1][0].sourceSecondDerivatives[0][2]=0;},
    (r:any)=>{r.grid.rows[1][0].normalizedSecondDerivatives[0][2]=0;},
    (r:any)=>{r.grid.rows[1][0].rules.MeanCurvature=0;}]){const r=copy(tiny.response);change(r);assert.throws(()=>parseGenericSurfaceSystemResult(r,tiny.query));}
  const near=fixture('boundary-near-parallel-1e-8'),r=copy(near.response);
  r.sample.rows[6].rules.CurvatureMatrix=[[-2.2731254575829833,-2.2731254575829833],[2.9802322387695312,2.980232238769531]];
  assert.throws(()=>parseGenericSurfaceSystemResult(r,near.query));
});
test('independent mixed jets include uv product and both composition derivatives',()=>{
  const e=compileSurfaceExpression('exp(u*v)+sin(u+v)'),j=e.evaluate(.2,.3).c as number[];
  assert.ok(Math.abs(j[4]-(1+.06)*Math.exp(.06)+Math.sin(.5))<1e-14);
  const expression=compileSurfaceExpression('u*v'),parts=expression.parts(SurfaceJet.variable(.2,0),SurfaceJet.variable(.3,1));
  assert.equal(parts.dynamic!.c[4],1);assert.equal(parts.dynamic!.c[3],0);assert.equal(parts.dynamic!.c[5],0);
  const r=makeGenericSurfaceSystemReference(SURFACE_SYSTEM_NATIVE_PRESET).evaluate(.2,.3).rules;
  assert.ok(Math.abs(r.FundamentalFormE*9-4)<1e-14);assert.ok(Math.abs(r.MeanCurvature/3-.25)<1e-14);
});
test('complete strict two-axis query rejects one-variable placeholders, source code and invented orientation',()=>{
  for(const [key,value] of [['surface',['u','s','0']],['surface',['u','v','v.__class__']],['surface',['u','v','u**9']],
    ['uStart',1],['vEnd',0],['uSegments',7],['principalAnalysis',1],['orientation',-1]])assert.throws(()=>validateGenericSurfaceSystemQuery({...SURFACE_SYSTEM_NATIVE_PRESET,[key as string]:value}));
  assert.throws(()=>validateGenericSurfaceSystemQuery({family:'surface-system-generic-native'}));
});
test('physical and normalized rules, mixed jets, tiny G and real principal mapping cannot be forged',()=>{
  const c=fixture('skew-saddle');for(const where of ['sample','grid'])for(const layer of ['rules','normalizedRules'])for(const key of SURFACE_BASIC_RULES){
    const r=copy(c.response),row=where==='sample'?r.sample.rows[5]:r.grid.rows[3][2],x=row[layer][key];
    if(Array.isArray(x)){if(Array.isArray(x[0]))x[0][0]+=.02;else x[0]+=.02;}else row[layer][key]+=.02;
    assert.throws(()=>parseGenericSurfaceSystemResult(r,c.query),where+layer+key);}
  for(const change of [(r:any)=>{r.sample.rows[4].normalizedSecondDerivatives[1][2]+=.1;},
    (r:any)=>{r.grid.rows[3][2].sourceSecondDerivatives[1][2]+=.1;},
    (r:any)=>{r.sample.rows[4].rules.PrincipalDirectionsUV[0]=[1,0];},
    (r:any)=>{r.sample.rows[4].rules.PrincipalDirections[0]=[1,0,0];},
    (r:any)=>{r.source.principalUmbilicIdentity=true;},
    (r:any)=>{r.sample.rows[4].rules.PrincipalCurvatures.reverse();}]){const r=copy(c.response);change(r);assert.throws(()=>parseGenericSurfaceSystemResult(r,c.query));}
  const tiny=fixture('tiny-v-metric');const r=copy(tiny.response);r.sample.rows[3].rules.FundamentalFormG=0;
  assert.throws(()=>parseGenericSurfaceSystemResult(r,tiny.query),'G~1e-20 must not be swallowed by E or max1');
});
test('rectangle holes, altered interval bounds, branch promotion and wrong source binding reject',()=>{
  const c=fixture('rational-mixed');for(const change of [(r:any)=>{r.query.surface[2]='u+v';},
    (r:any)=>{r.domain.cells.pop();r.domain.verifiedCells--;},(r:any)=>{r.domain.cells[0].rectangle[1]-=.01;},
    (r:any)=>{r.domain.cells[0].normalizedBasicRuleBounds[14]=[10,11];},
    (r:any)=>{r.domain.cells[0].normalizedAreaSquaredBounds[0]*=2;},
    (r:any)=>{r.certification.principalDirectionsContinuousCertified=true;},
    (r:any)=>{r.certification.adoptableCreasePattern=true;}]){const r=copy(c.response);change(r);assert.throws(()=>parseGenericSurfaceSystemResult(r,c.query));}
  const unknown=fixture('unresolved-off-grid-rank');const r=copy(unknown.response);r.domain.unresolved=[];r.domain.certified=true;r.domain.reason=null;
  r.certification.fullRectangleRegularityCertified=true;assert.throws(()=>parseGenericSurfaceSystemResult(r,unknown.query));
});
