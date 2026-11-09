import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fetchGenericAcross,GENERIC_ACROSS_PRESET,makeGenericAcrossEvaluator,parseGenericAcrossResult,validateGenericAcrossQuery} from '../../src/app/curvedGenericAcross';
const cases=JSON.parse(readFileSync(new URL('../fixtures/curved-generic-across.json',import.meta.url),'utf8'));
const copy=<T>(x:T):T=>structuredClone(x);

test('真实原函数三模式、非恒折角、非线共同参数和未知完整曲面严格回读',()=>{
 for(const c of cases){const r=parseGenericAcrossResult(c.result,c.query);assert.equal(r.query.mode,c.query.mode,c.name);
  assert.equal(r.sample.rows.length,c.query.segments+1);assert.equal(r.sample.grid[0].length,2*(c.query.rulingSegments+1));}
 const both=cases[0].result;assert.equal(both.diagnostics.parameterDomain.certified,false);assert.equal(both.certification.finitePairMetricVerified,true);
 const short=cases.find((c:any)=>c.name==='short-certified');assert.equal(short.result.diagnostics.parameterDomain.certified,true);
});
test('原左母线幅度保留，不相容/非可展左输入保留真实只读曲面',()=>{
 const nonunit=cases.find((c:any)=>c.name==='nonunit-original'),r=parseGenericAcrossResult(nonunit.result,nonunit.query);
 assert.deepEqual(r.sample.rows[0].flat!.rL,[0,2]);assert.deepEqual(r.sample.rows[0].space!.rL,[0,2,0]);
 for(const name of ['negative-left-source-incompatible','left-amplitude-mismatch']){const c=cases.find((x:any)=>x.name===name);
  const r=parseGenericAcrossResult(c.result,c.query);assert.equal(r.certification.finitePairMetricVerified,false);assert.equal(r.diagnostics.pairStatus,'incompatible');assert.ok(r.sample.rows[0].space);}
 const dev=cases.find((x:any)=>x.name==='left-not-developable');assert.equal(parseGenericAcrossResult(dev.result,dev.query).certification.leftInputDevelopabilityVerifiedAtNodes,false);
});
test('原源文字、模式与未启用合法语法保留，不执行其奇异函数',()=>{
 const inactive=cases.find((c:any)=>c.name==='inactive-source-domain');assert.deepEqual(validateGenericAcrossQuery(inactive.query),inactive.query);
 assert.equal(parseGenericAcrossResult(inactive.result,inactive.query).sample.rows[0].space,null);
 assert.throws(()=>validateGenericAcrossQuery({...GENERIC_ACROSS_PRESET,spaceCurve:['__import__(s)','s','s']}));
 assert.throws(()=>validateGenericAcrossQuery({...GENERIC_ACROSS_PRESET,evil:0}));
 assert.throws(()=>validateGenericAcrossQuery({...GENERIC_ACROSS_PRESET,leftWidth:0}));
});
test('曲线、原rL、rR和一阶jets不能通过一致篡改结果冒充源',()=>{
 const c=cases[0];for(const field of ['c','rL','rR','cPrime','rLPrime','rRPrime','normalizedC','normalizedRL','normalizedRR','normalizedCPrime','normalizedRLPrime','normalizedRRPrime']){
  const r=copy(c.result);r.sample.rows[3].space[field][1]+=.01;assert.throws(()=>parseGenericAcrossResult(r,c.query),field);}
 const r=copy(c.result);r.sample.rows[0].flat.rL=[0,1.1];r.sample.rows[0].flat.normalizedRL=r.sample.rows[0].flat.rL.map((x:number)=>x/r.diagnostics.parameterDomain.coordinateNormalization.scale);
 assert.throws(()=>parseGenericAcrossResult(r,c.query));
});
test('网格同索引、双侧原系数及inactive null结构严格核验',()=>{
 const c=cases[0];for(const change of [(r:any)=>r.sample.grid[2][4].normalizedSpace[0]+=.01,(r:any)=>r.sample.grid[0][0].v=.01,
  (r:any)=>r.sample.grid[0][0].side='right',(r:any)=>r.sample.grid[0].pop(),(r:any)=>r.sample.rows[0].s+=.01]){
  const r=copy(c.result);change(r);assert.throws(()=>parseGenericAcrossResult(r,c.query));}
 const one=cases.find((x:any)=>x.query.mode==='2d'),r=copy(one.result);r.sample.grid[0][0].space=[0,0,0];assert.throws(()=>parseGenericAcrossResult(r,one.query));
});
test('来源、分支、数值和全区间标签不可互相冒充',()=>{
 const c=cases[0];for(const change of [(r:any)=>r.source.notebookCells=[3983,3986],(r:any)=>r.sample.rows[0].branch.sign=-1,
  (r:any)=>r.certification.analyticPairIsometry=true,(r:any)=>r.certification.fullIntervalRegularityCertified=true,
  (r:any)=>r.diagnostics.pairStatus='incompatible',(r:any)=>r.diagnostics.parameterDomain.reason=null,
  (r:any)=>r.diagnostics.parameterDomain.intervals[1].start=.1]){
  const r=copy(c.result);change(r);assert.throws(()=>parseGenericAcrossResult(r,c.query));}
 const certified=cases.find((x:any)=>x.name==='short-certified');for(const key of ['minimumAreaProjectionLowerBound','minimumBranchSelectorLowerBound']){
  const r=copy(certified.result);r.diagnostics.parameterDomain[key]=100;assert.throws(()=>parseGenericAcrossResult(r,certified.query));}
});
test('小尺度加大平移采用normalized来源，保留原左幅度和单位右母线',()=>{
 const c=cases.find((x:any)=>x.name==='tiny-translated'),r=parseGenericAcrossResult(c.result,c.query),base=makeGenericAcrossEvaluator(GENERIC_ACROSS_PRESET),tiny=makeGenericAcrossEvaluator(c.query);
 for(const s of [.2,.37,.8,1])for(const side of ['flat','space'] as const){const a=base(s)[side]!,b=tiny(s)[side]!;
  for(const key of ['normalizedC','normalizedCPrime','normalizedRL','normalizedRLPrime'] as const)a[key].forEach((x,i)=>assert.ok(Math.abs(x-b[key][i])<2e-12));
  a.rR.forEach((x,i)=>assert.ok(Math.abs(x-b.rR[i])<2e-12));}
 assert.equal(r.sample.rows[0].space!.rL[1],1e-8);assert.ok(Math.abs(Math.hypot(...r.sample.rows[0].space!.rR)-1)<1e-12);
});
test('真实API调用沿公共token接口发送原query并严格回读',async()=>{
 const previous=globalThis.fetch,c=cases[0];let called=false;
 globalThis.fetch=(async(url,options)=>{called=true;assert.equal(url,'/api/tessellation/curved-generic-across-right');
  assert.equal(options?.method,'POST');assert.deepEqual(JSON.parse(options?.body as string),c.query);return new Response(JSON.stringify(c.result),{status:200});}) as typeof fetch;
 try{assert.deepEqual((await fetchGenericAcross(c.query)).query,c.query);assert.ok(called);}finally{globalThis.fetch=previous;}
});
