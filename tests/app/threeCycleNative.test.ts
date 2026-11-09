import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readThreeCycleQuery,readThreeCycleResult,type ThreeCycleQuery,type ThreeCycleResult} from '../../src/app/threeCycleNative';
import {threeCycleCriticalAngles,polygonCriticalAngles} from '../../src/app/twistAnalysis';
const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/three-cycle-checkhalfplane-20261010.json',import.meta.url),'utf8')) as {cases:{name:string;query:ThreeCycleQuery;response:ThreeCycleResult}[];polygons:{name:string;points:[number,number][];ranges:{true:[number,number]|null;false:[number,number]|null}}[]};
const close=(a:number,b:number,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
test('all 22 backend original branch results and source traces independently read back',()=>{
 for(const c of fixture.cases){assert.deepEqual(readThreeCycleQuery(c.query),c.query);assert.deepEqual(readThreeCycleResult(c.response,c.query),c.response);if(!c.query.checkHalfPlane){const result=threeCycleCriticalAngles(...c.query.edges,{checkHalfPlane:false});if(c.response.data.status==='evaluated'){assert.ok(result);result.forEach((a,i)=>close(a,c.response.data.anglesDeg[i]!,1e-6));}else assert.equal(result,null);}}
});
test('the same original edges expose distinct True early-return and False algebraic ranges',()=>{
 const a=fixture.cases.find(c=>c.name==='halfplane-0-true')!,b=fixture.cases.find(c=>c.name==='halfplane-0-false')!;assert.deepEqual(a.response.data.anglesDeg,[90,270]);close(b.response.data.anglesDeg[0]!,39.8055710922652);close(b.response.data.anglesDeg[1]!,101.30993247402021);assert.equal(a.response.data.evaluations[0].halfPlaneEarlyReturnUsed,true);assert.equal(b.response.data.evaluations[0].halfPlaneEarlyReturnUsed,false);assert.deepEqual(threeCycleCriticalAngles(...a.query.edges),[90,270]);
});
test('False keeps clockwise triangle signs rather than the old positive-only closed shortcut',()=>{
 const c=fixture.cases.find(c=>c.name==='cw-triangle-false')!;assert.ok(c.response.data.anglesDeg[0]!<0);assert.ok(c.response.data.anglesDeg[1]!>180);const result=threeCycleCriticalAngles(...c.query.edges,{checkHalfPlane:false})!;close(result[0],-26.56505117707799);close(result[1],206.56505117707798);
});
test('polygon aggregate passes the option into each original triple and preserves source filtering',()=>{
 for(const p of fixture.polygons)for(const checkHalfPlane of [true,false]){const actual=polygonCriticalAngles(p.points,{checkHalfPlane}).threeCycle,expected=p.ranges[checkHalfPlane?'true':'false'];if(expected){assert.ok(actual);actual.forEach((v,i)=>close(v,expected[i]));}else assert.equal(actual,null);}
});
test('forged bool, source trace, angle, original endpoints and lost reversed evaluation are refused',()=>{
 const c=fixture.cases.find(c=>c.name==='halfplane-0-false')!;for(const mutate of [(r:any)=>r.query.checkHalfPlane=true,(r:any)=>r.data.evaluations[0].halfPlaneEarlyReturnUsed=true,(r:any)=>r.data.anglesDeg[0]+=.01,(r:any)=>r.query.edges[0][0][0]+=.01,(r:any)=>r.data.evaluations.pop(),(r:any)=>r.source.clockwiseCell='In[1]']){const r=structuredClone(c.response);mutate(r);assert.throws(()=>readThreeCycleResult(r,c.query));}
});
test('singular results are honest partial numeric data and original True zero-edge early returns survive',()=>{
 const a=fixture.cases.find(c=>c.name==='zero-edges-true')!,b=fixture.cases.find(c=>c.name==='zero-edges-false')!;assert.deepEqual(a.response.data.anglesDeg,[90,270]);assert.deepEqual(b.response.data.anglesDeg,[null,null]);assert.equal(b.response.data.status,'numeric-evaluation-incomplete');assert.equal(b.response.data.noMathematicalInfeasibilityClaim,true);assert.equal(b.response.source.symbolicExpressionRuntime,false);for(const c of fixture.cases){const back=readThreeCycleResult(JSON.parse(JSON.stringify(c.response)),c.query);assert.equal(JSON.stringify(back),JSON.stringify(c.response));}
});
test('original CheckHalfPlane is a strict bool; paper and Wolfram option objects are rejected',()=>{
 const q=fixture.cases[0].query;for(const bad of [{...q,checkHalfPlane:0},{...q,checkHalfPlane:'False'},{...q,checkHalfPlane:null},{...q,edges:q.edges.slice(0,2)},{...q,paper:{}},{...q,opts:{}}])assert.equal(readThreeCycleQuery(bad),null);
});
