import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from '../fixtures/unsafe-twist-range-20261010.json';
import {LOCAL_UNSAFE_INPUT_EXAMPLE,originalUnsafeRotation,readUnsafeTwistParameters,readUnsafeTwistQuery,readUnsafeTwistResult,
 unsafeTwistRange,writeUnsafeTwistParameters} from '../../src/app/unsafeTwistRange';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<2e-12,`${a} vs ${b}`);
test('all8 independent source cases preserve original five inputs, selected ordered triples and complete angle list',()=>{
 for(const c of fixture.cases){const r=unsafeTwistRange(c.query);assert.deepEqual(r.query,c.query);
  for(const k of ['primal','dual'] as const){assert.equal(r.data[k].length,c.data[k].length);r.data[k].forEach((t,i)=>{
   const q=c.data[k][i];assert.equal(t.face,q.face);assert.equal(t.start,q.start);assert.deepEqual(t.indices,q.indices);assert.deepEqual(t.points,q.points);near(t.angleRad,q.angleRad);});}
  assert.equal(r.data.ignoredDualFaces,c.data.ignoredDualFaces);for(const k of ['allAnglesRad','originalReturn','rangeDeg'] as const)
   r.data[k].forEach((x,i)=>near(x,c.data[k][i]));
 }
});
test('local finite input is explicitly not the original held In3339 example or paper certificate',()=>{
 const r=unsafeTwistRange(LOCAL_UNSAFE_INPUT_EXAMPLE);near(r.data.rangeDeg[0],45);near(r.data.rangeDeg[1],135);
 assert.equal(r.source.definitionCell,'In[3338]');assert.equal(r.source.originalAuthorStatus,'IN PROGRESS / TBD');assert.deepEqual(r.source.publicOptions,[]);
 for(const key of ['fullWolframDomain','wolframExecuted','localAssignmentCertified','creasePatternCertified','layerOrderCertified'] as const)assert.equal(r.source[key],false);
});
test('original primal selection means first NONBOUNDARY START, not all triples or the middle vertex',()=>{
 const q=structuredClone(LOCAL_UNSAFE_INPUT_EXAMPLE);q.pfaces=[[1,2,3,4,5]];q.bverts=[1,2];const r=unsafeTwistRange(q);
 assert.equal(r.data.primal.length,1);assert.deepEqual(r.data.primal[0].indices,[3,4,5]);assert.equal(r.data.primal[0].start,3);
 q.bverts=[1];assert.deepEqual(unsafeTwistRange(q).data.primal[0].indices,[2,3,4]);
});
test('only FIRST dual face contributes; even zero rays in later ignored faces do not invent a new condition',()=>{
 const q=structuredClone(LOCAL_UNSAFE_INPUT_EXAMPLE),original=unsafeTwistRange(q);q.dfaces.push([1,1,1]);
 const r=unsafeTwistRange(q);assert.deepEqual(r.data.originalReturn,original.data.originalReturn);assert.deepEqual(r.data.allAnglesRad,original.data.allAnglesRad);assert.equal(r.data.ignoredDualFaces,1);
 q.dfaces.reverse();assert.throws(()=>unsafeTwistRange(q),/零长/);
});
test('signed clockwise angles and Pi complements retain negative and greater180-degree algebraic range',()=>{
 const q=structuredClone(LOCAL_UNSAFE_INPUT_EXAMPLE);q.dfaces=[[4,3,2,1]];const r=unsafeTwistRange(q);near(r.data.rangeDeg[0],-90);near(r.data.rangeDeg[1],270);
 assert.equal(originalUnsafeRotation([1,0],[-1,-0]),Math.PI);assert.equal(originalUnsafeRotation([1,0],[0,-1]),-Math.PI/2);
});
test('translation and positive scaling do not move source input positions or repeat conversion in output range',()=>{
 const c=fixture.cases.find(c=>c.name==='translated-and-scaled')!,r=unsafeTwistRange(c.query);
 assert.deepEqual(r.query,c.query);r.data.primal.forEach(t=>t.indices.forEach((id,i)=>assert.deepEqual(t.points[i],c.query.pverts[id-1])));
 r.data.originalReturn.forEach((a,i)=>near(r.data.rangeDeg[i],a*180/Math.PI));near(r.data.rangeDeg[0],45);near(r.data.rangeDeg[1],135);
});
test('empty primal table and repeated boundary list preserve literal original semantics',()=>{
 const q=structuredClone(LOCAL_UNSAFE_INPUT_EXAMPLE);q.bverts.push(1,1);assert.deepEqual(unsafeTwistRange(q).data.originalReturn,unsafeTwistRange(LOCAL_UNSAFE_INPUT_EXAMPLE).data.originalReturn);
 q.pverts=[];q.pfaces=[];q.bverts=[];assert.equal(unsafeTwistRange(q).data.primal.length,0);
});
test('all-boundary primal face and actual inspected zero directions reject instead of fabricating zero range',()=>{
 const q=structuredClone(LOCAL_UNSAFE_INPUT_EXAMPLE);q.bverts.push(5);assert.throws(()=>unsafeTwistRange(q),/没有非bverts/);
 q.bverts=[1,2,3,4];q.dverts[1]=[...q.dverts[0]];assert.throws(()=>unsafeTwistRange(q),/零长/);
});
test('strict1-based index, finite coordinate, capacity and original no-options contracts reject malformed inputs',()=>{
 for(const mutate of [(q:any)=>q.pfaces[0][0]=0,(q:any)=>q.dfaces[0][0]=1.5,(q:any)=>q.bverts=[999],(q:any)=>q.pverts[0][0]=Infinity,
  (q:any)=>q.pverts[0][0]=true,(q:any)=>q.dverts[0].push(1),(q:any)=>q.dfaces=[],(q:any)=>q.pfaces=[[]],(q:any)=>q.opts={},
  (q:any)=>q.pfaces=Array.from({length:257},()=>[1,2,5])]){const q=structuredClone(LOCAL_UNSAFE_INPUT_EXAMPLE);mutate(q);assert.throws(()=>readUnsafeTwistQuery(q));}
 for(const q of [null,[],{},true])assert.throws(()=>readUnsafeTwistQuery(q));
});
test('parameter save/reopen and full original result independently replay all five inputs without mutation',()=>{
 for(const c of fixture.cases){const before=structuredClone(c.query),r=unsafeTwistRange(c.query);assert.deepEqual(readUnsafeTwistParameters(writeUnsafeTwistParameters(r.query)),before);
  assert.deepEqual(readUnsafeTwistResult(JSON.stringify(r)),r);r.query.pverts[0]&&(r.query.pverts[0][0]+=1);assert.deepEqual(c.query,before);}
});
test('result forgery cannot alter source indices/coordinates/order/angles or claim original completion and certification',()=>{
 const r=unsafeTwistRange(LOCAL_UNSAFE_INPUT_EXAMPLE);
 for(const mutate of [(r:any)=>r.data.primal[0].indices.reverse(),(r:any)=>r.data.primal[0].face=1.0000000000001,
  (r:any)=>r.data.primal[0].points[0][0]+=.000000000001,(r:any)=>r.data.originalReturn.reverse(),(r:any)=>r.data.allAnglesRad.pop(),
  (r:any)=>r.source.originalAuthorStatus='completed',(r:any)=>r.source.creasePatternCertified=true,(r:any)=>r.source.publicOptions=['CheckHalfPlane'],
  (r:any)=>r.data.ignoredDualFaces=1]){const bad=structuredClone(r);mutate(bad);assert.throws(()=>readUnsafeTwistResult(JSON.stringify(bad)));}
 assert.throws(()=>readUnsafeTwistParameters('{}'));assert.throws(()=>readUnsafeTwistResult('bad'));
});
