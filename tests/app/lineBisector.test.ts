import test from 'node:test';
import assert from 'node:assert/strict';
import {lineBisector,lineBisectorCutoff,parallelMidlineCutoffs,parallelMidlineFull} from '../../src/app/lineBisector';
import {cross,distance,sub} from '../../src/core/geometry';
import type {Point,Segment} from '../../src/core/types';
const s=(a:Point,b:Point):Segment=>({id:JSON.stringify([a,b]),a,b,assignment:'M',angle:-90});
const reverse=(a:Segment)=>s(a.b,a.a);
test('full midline accepts anchor on boundary, ignores auxiliary and rejects one missing stop',()=>{
 const mid=lineBisector(s([0,25],[200,25]),s([0,75],[200,75]));
 const doc={name:'中线',paper:{width:200,height:200},segments:[s([0,0],[0,200]),s([200,0],[200,200])]};
 assert.deepEqual(parallelMidlineFull(doc,mid),{a:[0,50],b:[200,50]});
 assert.throws(()=>parallelMidlineFull({...doc,segments:doc.segments.slice(1)},mid),/缺少/);
});
test('two intersecting lines bisect the angle formed by farther endpoints',()=>{
 const a=s([0,0],[100,0]),b=s([0,0],[0,100]),r=lineBisector(a,b);
 assert.equal(r.kind,'intersecting');assert.deepEqual(r.origin,[0,0]);assert.ok(Math.abs(r.direction[0]-Math.SQRT1_2)<1e-10);assert.ok(Math.abs(r.direction[1]-Math.SQRT1_2)<1e-10);
});
test('supporting-line intersection can lie outside finite reference segments',()=>{
 const r=lineBisector(s([25,0],[100,0]),s([0,25],[0,100]));assert.deepEqual(r.origin,[0,0]);
 assert.ok(Math.abs(r.direction[0]-r.direction[1])<1e-10);
});
test('endpoint orientation and selection order do not change chosen geometric bisector',()=>{
 const a=s([-100,0],[100,0]),b=s([0,-100],[0,100]),base=lineBisector(a,b);
 for(const x of [a,reverse(a)])for(const y of [b,reverse(b)])for(const pair of [[x,y],[y,x]])assert.deepEqual(lineBisector(pair[0],pair[1]),base);
});
test('parallel midline is equidistant for rotated and opposite-direction input',()=>{
 const a=s([0,0],[100,100]),b=s([0,40],[100,140]),before=structuredClone([a,b]);
 for(const x of [a,reverse(a)])for(const y of [b,reverse(b)]){
  const r=lineBisector(x,y);assert.equal(r.kind,'parallel');
  const dist=(s:Segment)=>Math.abs(cross(sub(r.origin,s.a),sub(s.b,s.a)))/distance(s.a,s.b);
  assert.ok(Math.abs(dist(a)-dist(b))<1e-8);assert.ok(Math.abs(cross(r.direction,sub(a.b,a.a)))<1e-8);
 }
 assert.deepEqual([a,b],before);
});
test('parallel midline requires two actual cutoffs and ignores arbitrary anchor',()=>{
 const a=s([25,25],[175,25]),b=s([75,75],[175,75]),r=lineBisector(a,b);
 const left=s([0,0],[0,100]),right=s([200,0],[200,100]);
 for(const mid of [r,lineBisector(reverse(a),reverse(b)),lineBisector(b,a)])assert.deepEqual(parallelMidlineCutoffs(mid,left,right),{a:[0,50],b:[200,50]});
 assert.throws(()=>lineBisectorCutoff(r,left),/两个截止/);
});
test('intersecting cutoff accepts either direction, never target extensions or zero',()=>{
 const r=lineBisector(s([0,0],[100,0]),s([0,0],[0,100]));
 for(const sign of [1,-1]){const result=lineBisectorCutoff(r,s([sign*100,0],[sign*100,sign*200]));assert.deepEqual(result.a,[0,0]);assert.ok(distance(result.b,[sign*100,sign*100])<1e-8);}
 assert.throws(()=>lineBisectorCutoff(r,s([100,0],[100,50])));assert.throws(()=>lineBisectorCutoff(r,s([0,-100],[0,100])),/零长/);
});
test('midline rejects coincident or parallel cutoffs, extensions and incorrect mode',()=>{
 const r=lineBisector(s([0,0],[100,0]),s([0,100],[100,100])),cut=s([0,0],[0,100]);
 assert.throws(()=>parallelMidlineCutoffs(r,cut,cut),/重合/);
 assert.throws(()=>parallelMidlineCutoffs(r,cut,s([0,0],[100,0])));
 assert.throws(()=>parallelMidlineCutoffs(r,cut,s([100,100],[100,200])));
 assert.throws(()=>parallelMidlineCutoffs(lineBisector(s([0,0],[100,0]),s([0,0],[0,100])),cut,cut),/不是平行/);
});
test('coincident, tiny, invalid and nearly parallel reference lines reject',()=>{
 const a=s([0,0],[100,0]);for(const b of [s([25,0],[200,0]),s([1,1],[1,1]),s([0,25],[100,25+1e-7]),s([NaN,0],[10,10])])assert.throws(()=>lineBisector(a,b));
});

test('automatic midline cutoffs are independent of endpoint orientation and reference order',()=>{
 const first=s([0,25],[200,25]),second=s([0,75],[200,75]);
 const doc={name:'中线截止',paper:{width:200,height:200},segments:[0,75,125,200].map(x=>s([x,0],[x,100]))};
 for(const a of [first,reverse(first)])for(const b of [second,reverse(second)])for(const pair of [[a,b],[b,a]]){
  const result=parallelMidlineFull(doc,lineBisector(pair[0],pair[1]));
  assert.deepEqual(result,{a:[75,50],b:[125,50]});
 }
});
