import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DISCRETIZATION_NATIVE_PRESETS,parseNativeDiscretizationResult,validateNativeDiscretizationQuery,fetchNativeDiscretizationWhenIdle} from '../../src/app/curvedNativeDiscretization';
const fixtures=JSON.parse(fs.readFileSync('tests/fixtures/curved-discretization-native-20261001.json','utf8'));
const reference=JSON.parse(fs.readFileSync('tests/fixtures/curved-discretization-generic-reference-20261001.json','utf8'));
const fixture=(name:string)=>fixtures.find((f:any)=>f.name===name),copy=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
test('busy waits are bounded and cancellable, while numerical failures never retry',async()=>{
 const originalFetch=globalThis.fetch,originalTimer=globalThis.setTimeout,f=fixture('system');let calls=0;
 const busy=()=>new Response(JSON.stringify({error:'busy 429 计算器繁忙'}),{status:429});
 try{
  globalThis.setTimeout=((fn:()=>void)=>originalTimer(fn,0)) as typeof setTimeout;
  globalThis.fetch=async()=>++calls===1?busy():new Response(JSON.stringify(f.response));assert.deepEqual(await fetchNativeDiscretizationWhenIdle(f.query),f.response);assert.equal(calls,2);
  calls=0;globalThis.fetch=async()=>{calls++;return busy();};await assert.rejects(()=>fetchNativeDiscretizationWhenIdle(f.query),/busy/);assert.equal(calls,241);
  calls=0;const controller=new AbortController();controller.abort();await assert.rejects(()=>fetchNativeDiscretizationWhenIdle(f.query,controller.signal));assert.equal(calls,0);
  globalThis.setTimeout=originalTimer;const next=new AbortController(),pending=fetchNativeDiscretizationWhenIdle(f.query,next.signal);originalTimer(()=>next.abort(),5);await assert.rejects(pending);assert.equal(calls,1);
  calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:'original-kawasaki-abort'}),{status:422});};await assert.rejects(()=>fetchNativeDiscretizationWhenIdle(f.query),/kawasaki/);assert.equal(calls,1);
 }finally{globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimer;}
});
test('23 frozen response witnesses independently replay all three literal contracts',()=>{
 for(const f of fixtures)assert.doesNotThrow(()=>parseNativeDiscretizationResult(f.response,f.query),f.name);
});
test('finite high-dimensional origins cannot turn an overflowing norm into infinite tolerance',()=>{
 const f=fixture('overflowing-origin-norm');assert.equal(Math.hypot(...f.response.sample.normalization.origin),Infinity);assert.doesNotThrow(()=>parseNativeDiscretizationResult(f.response,f.query));
 const r=copy(f.response);r.sample.normalization.origin[0]=0;assert.throws(()=>parseNativeDiscretizationResult(r,f.query));
});
test('pure constant radicals differentiate to zero while source coordinates remain literal',()=>{
 const f=fixture('constant-radical'),r=parseNativeDiscretizationResult(f.response,f.query);assert.deepEqual((r.sample as any).parameters,[0,.25,.5,.75,1]);
 assert.deepEqual((r.sample as any).equations.map((e:any)=>e.derivative),[[1,1],[1,1],[1,1]]);
 const forged=copy(f.response);forged.sample.equations[0].derivative[0]=0;assert.throws(()=>parseNativeDiscretizationResult(forged,f.query));
 const dynamic=copy(f.response);dynamic.query.curve[0]='s+sqrt(s-s)';assert.throws(()=>parseNativeDiscretizationResult(dynamic,dynamic.query));
});
test('source safety and finite dimensional input constraints reject unsafe or unused data',()=>{
 for(const q of Object.values(DISCRETIZATION_NATIVE_PRESETS))assert.deepEqual(validateNativeDiscretizationQuery(q),q);
 const q=DISCRETIZATION_NATIVE_PRESETS.uniform;
 for(const patch of [{curve:['s.__class__']},{curve:['sin(s,2)']},{curve:['s**9']},{curve:['s**s']},{curve:['(s']},{curve:['0x10']},{curve:Array(65).fill('s')},{parameterStart:Infinity},{divisions:65},{extra:0}])assert.throws(()=>validateNativeDiscretizationQuery({...q,...patch}));
 const reordered=Object.fromEntries(Object.entries(q).reverse());assert.deepEqual(validateNativeDiscretizationQuery(reordered),q);
});
test('system preserves duplicate keys, irregular and repeated parameters, nested shape and null atoms',()=>{
 const f=fixture('ragged');assert.deepEqual(f.response.sample.rules.map((r:any)=>r.key),['A','A','B']);
 for(const edit of [(r:any)=>r.sample.parameters.sort(),(r:any)=>r.sample.rules.reverse(),(r:any)=>r.sample.rules[1].values[1][0].reverse(),(r:any)=>r.sample.rules[2].values[0].push(0),(r:any)=>r.sample.budget.scalarEvaluations++]){const r=copy(f.response);edit(r);assert.throws(()=>parseNativeDiscretizationResult(r,f.query));}
 const u=fixture('undefined');assert.deepEqual(u.response.sample.rules[0].values,[[null,0],[-1,null],[1,1]]);
 for(const edit of [(r:any)=>r.sample.rules[0].values[0][0]=0,(r:any)=>r.sample.undefined[0].path=[1],(r:any)=>r.sample.undefined.reverse(),(r:any)=>r.certification.allSampledValuesFinite=true]){const r=copy(u.response);edit(r);assert.throws(()=>parseNativeDiscretizationResult(r,u.query));}
});
test('independent 80-digit original equations retain non-arc-length and unconstrained root branches',()=>{
 for(const [name,key] of [['parabola','parabola'],['oscillatory','oscillatoryUnconstrained']]){const f=fixture(name);const result=parseNativeDiscretizationResult(f.response,f.query);for(const [i,p] of (result.sample as any).parameters.entries())assert.ok(Math.abs(p-Number(reference[key].parameters[i]))<1e-10);}
 const p=fixture('parabola').response.sample.normalizedChordLengths;assert.ok(Math.max(...p)/Math.min(...p)>3);
 const r=fixture('oscillatory').response;assert.equal(r.sample.strictlyOrderedAlongRequestedInterval,false);assert.deepEqual(r.sample.outsideRequestedInterval,[2]);assert.equal(r.certification.rootBranchEquivalentToWolfram,false);
});
test('curve endpoints, raw root order, normalized tiny geometry and original equations cannot be forged',()=>{
 for(const name of ['parabola','oscillatory','tiny','reverse-5d']){const f=fixture(name);for(const edit of [(r:any)=>r.sample.parameters[0]+=.1,(r:any)=>r.sample.parameters[1]+=.01,(r:any)=>r.sample.normalizedPoints[1][0]+=.01,(r:any)=>r.sample.normalization.scale*=1.01,(r:any)=>r.sample.equations[0].derivative[0]+=.01,(r:any)=>r.sample.equations[0].directionResidual=.001,(r:any)=>r.sample.outsideRequestedInterval.push(0),(r:any)=>r.sample.solver.nfev++]){const r=copy(f.response);edit(r);assert.throws(()=>parseNativeDiscretizationResult(r,f.query),name);}}
 const f=fixture('oscillatory'),r=copy(f.response);r.sample.parameters.sort((a:number,b:number)=>a-b);assert.throws(()=>parseNativeDiscretizationResult(r,f.query));
});
test('stationary and endpoint-only contracts remain valid without an artificial regularity gate',()=>{
 assert.deepEqual(fixture('stationary').response.sample.stationaryVertices,[2]);
 for(const name of ['stationary','constant','sqrt-endpoint','line-1d','line-64d']){const f=fixture(name);assert.doesNotThrow(()=>parseNativeDiscretizationResult(f.response,f.query));}
 const f=fixture('stationary'),r=copy(f.response);r.sample.equations[0].stationaryDerivative=false;assert.throws(()=>parseNativeDiscretizationResult(r,f.query));
});
test('signed sector quotients match independent reference and bind raw directions, not normalized copies',()=>{
 const f=fixture('multipliers');for(const [i,p] of f.response.sample.multipliers.entries())assert.ok(Math.abs(p-Number(reference.kink.multipliers[i]))<1e-12);
 for(const edit of [(r:any)=>r.sample.leftRulings[0][0]*=2,(r:any)=>r.sample.sectors[1].a1+=.01,(r:any)=>r.sample.kawasaki[0].choppedAngle=1e-12,(r:any)=>r.sample.quotients[0].denominator+=.01,(r:any)=>r.sample.quotients[0].value*=1.01,(r:any)=>r.sample.multipliers[1]*=-1,(r:any)=>r.sample.chopAppliedToDenominator=true]){const r=copy(f.response);edit(r);assert.throws(()=>parseNativeDiscretizationResult(r,f.query));}
});
test('exact zero denominator remains undefined while tiny nonzero denominator remains finite',()=>{
 const f=fixture('zero-denominator');assert.equal(f.response.sample.multipliers[0],null);assert.equal(f.response.sample.quotients[0].state,'original-zero-denominator');
 const r=copy(f.response);r.sample.multipliers[0]=0;r.sample.quotients[0].value=0;assert.throws(()=>parseNativeDiscretizationResult(r,f.query));
 const tiny=fixture('small-denominator');assert.ok(Math.abs(tiny.response.sample.multipliers[0])>1e12);assert.doesNotThrow(()=>parseNativeDiscretizationResult(tiny.response,tiny.query));
});
test('actual offset Cartesian work is bounded before allocation and never recast as undefined',()=>{
 const f=fixture('offset-product'),r=copy(f.response);r.query.parameters=Array(5).fill(0);r.sample.parameters=r.query.parameters;r.sample.rules[0].values=Array(5).fill(65536);
 assert.throws(()=>parseNativeDiscretizationResult(r,r.query),/补偿常数乘积预算/);
});
test('request identity, origin and numerical certification scope cannot be promoted',()=>{
 const f=fixture('parabola');for(const edit of [(r:any)=>r.source.definitionCell='In[0]',(r:any)=>r.limits.maximumDivisions=999,(r:any)=>r.certification.rootBranchEquivalentToWolfram=true,(r:any)=>r.certification.adoptableCreasePattern=true,(r:any)=>r.certification.continuousDomainCertified=true]){const r=copy(f.response);edit(r);assert.throws(()=>parseNativeDiscretizationResult(r,f.query));}
 assert.throws(()=>parseNativeDiscretizationResult(f.response,{...f.query,parameterEnd:2}));
});
