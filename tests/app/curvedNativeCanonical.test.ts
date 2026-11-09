import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {connect} from '../../src/app/api';
import {CANONICAL_NATIVE_PRESETS,validateGenericCanonicalQuery,parseGenericCanonicalResult,fetchGenericCanonicalWhenIdle,
  type GenericCanonicalQuery,type GenericCanonicalResult} from '../../src/app/curvedNativeCanonical';

const fixtures=JSON.parse(fs.readFileSync(new URL('../fixtures/curved-canonical-native-20261001.json',import.meta.url),'utf8')) as
  {name:string;query:GenericCanonicalQuery;response:GenericCanonicalResult}[];
const fixture=(name:string)=>fixtures.find(c=>c.name===name)!;
const clone=<T>(x:T):T=>structuredClone(x);
const rejects=(name:string,mutate:(r:GenericCanonicalResult)=>void)=>{const c=fixture(name),r=clone(c.response);mutate(r);
  assert.throws(()=>parseGenericCanonicalResult(r,c.query),/回读不一致|原来源|参数域/);};

test('四原函数与十一条独立来源均保留完整原源与两个v域，并从安全Taylor与自适应弧长独立回读',()=>{
  assert.equal(fixtures.length,15);
  for(const c of fixtures){assert.deepEqual(validateGenericCanonicalQuery(c.query),c.query);assert.equal(parseGenericCanonicalResult(c.response,c.query),c.response);
    assert.equal(c.response.certification.adoptableCreasePattern,false);assert.equal(c.response.source.flatDevelopmentReturnedByOriginal,false);}
  for(const q of Object.values(CANONICAL_NATIVE_PRESETS))validateGenericCanonicalQuery(q);
  const raw=clone(CANONICAL_NATIVE_PRESETS.tangent);raw.baseCurve[0]=' sqrt(3)/2 * Cos[s] ';
  assert.equal(validateGenericCanonicalQuery(raw).baseCurve[0],raw.baseCurve[0]);
});

test('严格字段、真constant-AST柱面、tangent禁director与三个独立域不可混淆',()=>{
  const c=CANONICAL_NATIVE_PRESETS.cylinder,t=CANONICAL_NATIVE_PRESETS.tangent;
  for(const director of [['0','0','1+s'],['0','0','1+s-s']])assert.throws(()=>validateGenericCanonicalQuery({...c,director}),/不得含/);
  assert.throws(()=>validateGenericCanonicalQuery({...t,director:['1','0','0']}),/切线来源/);
  for(const patch of [{unknown:1},{parameterEnd:Infinity},{parameterStart:0,parameterEnd:.001},{crossParameterStart:2,crossParameterEnd:1},
    {rulingStart:-1000001},{segments:7},{rulingSegments:33},{baseCurve:['s','Function(s)','0']}])assert.throws(()=>validateGenericCanonicalQuery({...c,...patch}));
  assert.throws(()=>validateGenericCanonicalQuery({family:c.family,operation:c.operation}),/完整/);
  assert.throws(()=>parseGenericCanonicalResult(fixture('polynomial-tangent').response,{...fixture('polynomial-tangent').query,crossParameterEnd:1.9}),/回读不一致/);
});

test('三个世界与归一网格、原导数和单位方向均独立核对，不能以自洽伪输出替代来源',()=>{
  for(const key of ['rawGrid','canonicalGrid','crossGrid','normalizedRawGrid','normalizedCanonicalGrid','normalizedCrossGrid'] as const)
    rejects('polynomial-tangent',r=>{r[key][10][3][1]+=.005;});
  for(const key of ['rawBase','rawDirector','canonicalBase','canonicalDirector','canonicalBaseDerivative','canonicalDirectorDerivative'] as const)
    rejects('noncircular-cylinder',r=>{r.samples[4][key][0]+=.005;});
  rejects('original-general',r=>{r.samples.pop();});
  rejects('original-general',r=>{r.crossParameterValues[1]+=.005;});
  rejects('noncircular-cylinder',r=>{r.normalization.scale*=2;});
  rejects('general-cone',r=>{r.normalization.rawDirectorScale*=2;});
  rejects('tiny-translated-tangent',r=>{r.normalization.rawOrigin[0]+=1;});
  rejects('tiny-translated-tangent',r=>{r.normalizedCrossGrid[5][2][0]=0;});
});

test('微小非零D′、跨幅母线及微曲线G使用自身量纲相对阈值，不能被单位阈值吞没',()=>{
  for(const name of ['general-small-nonzero-Dprime','general-small-nonzero-variable-amplitude-Dprime']){
    const r=fixture(name).response;assert.equal(r.source.canonicalBranch,'tangent');assert.equal(r.certification.cylinderBranchIdentity.status,'nonzero');
    assert.ok(Math.abs(r.samples[0].canonicalDirectorDerivative[1])>0);
    rejects(name,r=>{r.samples[0].canonicalDirectorDerivative[1]=0;});
    rejects(name,r=>{r.samples[5].crossEFG[2].normalizedArea*=2;});
  }
  const r=fixture('tiny-translated-tangent').response;assert.ok(r.samples[0].crossEFG[0].G<1e-15);
  rejects('tiny-translated-tangent',r=>{r.samples[0].crossEFG[0].G*=2;});
  rejects('tiny-translated-tangent',r=>{r.samples[0].crossEFG[0].G=0;});
});

test('反向母线保字面Cross非零F，真实非可展不能被升级为恒等可展或回归边',()=>{
  const r=fixture('general-reversed-tangent').response,m=r.samples[0].crossEFG[0];
  assert.ok(m.F< -2);assert.equal(m.normalizedArea,0);assert.equal(m.regular,false);
  rejects('general-reversed-tangent',r=>{r.samples[0].crossEFG[0].F=0;});
  rejects('general-reversed-tangent',r=>{r.samples[0].crossEFG[0].regular=true;});
  for(const name of ['cone-nondevelopable-literal','general-nondevelopable-literal']){
    assert.equal(fixture(name).response.certification.developabilityIdentity.status,'nonzero');
    rejects(name,r=>{r.certification.developabilityIdentity={status:'zero',analyticIdentity:true,method:'bounded-safe-symbolic-identity'};});
    rejects(name,r=>{r.certification.adoptableCreasePattern=true as false;});
  }
  rejects('general-nondevelopable-literal',r=>{r.certification.edgeOfRegressionIdentity={status:'zero',analyticIdentity:true,method:'bounded-safe-symbolic-identity'};});
});

test('恒等branch/source引用、cone原bb检查、未返回二维和积分证据均严格回读',()=>{
  rejects('general-small-nonzero-Dprime',r=>{r.source.canonicalBranch='cylinder';r.source.crossParameterMeaning='signed-unit-ruling-length';
    r.source.generalBaseShiftFraction=null;r.certification.cylinderBranchIdentity={status:'zero',analyticIdentity:true,method:'bounded-safe-symbolic-identity'};});
  rejects('general-cone',r=>{r.source.canonicalBranch='tangent';});
  rejects('cone-nondevelopable-literal',r=>{r.source.coneOriginalUnassignedBbCheck=false;});
  rejects('original-cylinder',r=>{r.source.definitionCell='In[3836]';});
  rejects('original-cylinder',r=>{r.source.flatDevelopmentReturnedByOriginal=true as false;});
  rejects('polynomial-tangent',r=>{r.integration!.errorIntervalCertified=true as false;});
  rejects('polynomial-tangent',r=>{r.integration!.evaluations=24001;});
  rejects('polynomial-tangent',r=>{r.source.generalBaseShiftFraction='v-u';});
  rejects('general-cone',r=>{r.certification.apexIdentity={status:'zero',analyticIdentity:false,method:'bounded-safe-symbolic-identity'};});
});

test('完整源域覆盖、区间下界与unknown/正则/奇异三态不能互相伪造',()=>{
  rejects('polynomial-tangent',r=>{r.certification.sourceDomain.cells[0].start+=.01;});
  rejects('polynomial-tangent',r=>{const c=r.certification.sourceDomain.cells[0];if('areaBounds' in c)c.areaBounds=[10,20];});
  rejects('polynomial-tangent',r=>{r.certification.sourceDomain.crossRegularity.minimumNormalizedJacobianLowerBound!*=2;});
  rejects('original-tangent',r=>{r.certification.sourceDomain.canonicalRegularity={status:'verified',minimumNormalizedJacobianLowerBound:1e-8};});
  rejects('cone-nondevelopable-literal',r=>{r.certification.sourceDomain.crossRegularity={status:'verified',minimumNormalizedJacobianLowerBound:1e-8};});
  const c=fixture('original-cone'),r=clone(c.response),d=r.certification.sourceDomain;
  d.certified=false;d.unresolved=d.cells.map(x=>[x.start,x.end]);d.cells=[];d.verifiedCells=0;
  d.reason='complete source interval subdivision budget unresolved; original domains retained';
  assert.equal(parseGenericCanonicalResult(r,c.query).certification.sourceDomain.certified,false);
  assert.deepEqual(r.query,c.query);assert.equal(r.canonicalGrid.length,c.query.segments+1);
  d.certified=true;assert.throws(()=>parseGenericCanonicalResult(r,c.query),/回读不一致/);
});

test('api token认证、busy重试和abort均保原operation与请求绑定',async()=>{
  const old=globalThis.fetch,c=fixture('polynomial-tangent');let posts=0;
  try{globalThis.fetch=async (input,init)=>{
    if(String(input)==='/api/health')return new Response(JSON.stringify({token:'canonical-test-token'}));
    assert.equal(String(input),'/api/tessellation/curved-canonical-generic');assert.equal((init!.headers as Record<string,string>)['X-Zhezhi-Token'],'canonical-test-token');
    assert.deepEqual(JSON.parse(init!.body as string),c.query);posts++;
    return posts===1?new Response(JSON.stringify({error:'已有镶嵌计算正在进行，请稍后重试。'}),{status:429}):new Response(JSON.stringify(c.response));};
    await connect();assert.deepEqual(await fetchGenericCanonicalWhenIdle(c.query),c.response);assert.equal(posts,2);
    const controller=new AbortController();controller.abort();await assert.rejects(fetchGenericCanonicalWhenIdle(c.query,controller.signal),{name:'AbortError'});
    globalThis.fetch=async()=>new Response(JSON.stringify({error:'原源母线在完整域未定义。'}),{status:422});
    await assert.rejects(fetchGenericCanonicalWhenIdle(c.query),/原源母线/);
  }finally{globalThis.fetch=old;}
});
