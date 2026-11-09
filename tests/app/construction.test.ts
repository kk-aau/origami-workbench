import { test } from 'node:test';
import assert from 'node:assert/strict';
import { constructionEnd, directionCandidates, perpendicularFoot, referenceDirection } from '../../src/app/construction';
import type { Doc, Point, Segment } from '../../src/core/types';
const s=(id:string,a:Point,b:Point,assignment:Segment['assignment']='B'):Segment=>({id,a,b,assignment,angle:0});
const base=s('base',[25,75],[175,75],'M');
const doc:Doc={name:'direction',paper:{width:200,height:200},segments:[base,s('top',[0,0],[200,0]),s('right',[200,0],[200,200]),s('bottom',[200,200],[0,200]),s('left',[0,200],[0,0])]};
const rounded=(v:unknown)=>JSON.parse(JSON.stringify(v,(_,n)=>typeof n==='number'?Math.round(n*1e8)/1e8:n));
test('external point projects to a foot, not the paper boundary',()=>{
  assert.deepEqual(perpendicularFoot([100,125],base),[100,75]);
});
test('vertical and oblique references have exact perpendicular projections',()=>{
  assert.deepEqual(perpendicularFoot([100,125],s('v',[50,0],[50,200])),[50,125]);
  assert.deepEqual(rounded(perpendicularFoot([100,0],s('d',[0,0],[200,200]))),[50,50]);
});
test('reversed and split references retain the same supporting line',()=>{
  for(const line of [base,{...base,a:base.b,b:base.a},{...base,b:[50,75] as Point}])assert.deepEqual(perpendicularFoot([100,125],line),[100,75]);
});
test('projection outside finite span is allowed and point-on-line has zero distance',()=>{
  assert.deepEqual(perpendicularFoot([0,125],base),[0,75]);
  assert.deepEqual(perpendicularFoot([100,75],base),[100,75]);
});
test('invalid points and zero reference directions are rejected',()=>{
  assert.throws(()=>perpendicularFoot([NaN,0],base));
  assert.throws(()=>referenceDirection(s('zero',[0,0],[0,0]),true));
  assert.throws(()=>referenceDirection(s('bad',[0,0],[Infinity,0]),false));
});
test('direction vectors are normalized and perpendicular',()=>{
  const p=referenceDirection(s('s',[0,0],[3,4]),true);
  assert.deepEqual(p,[-.8,.6]);assert.ok(Math.abs(p[0]*3+p[1]*4)<1e-12);
});
test('on-line perpendicular has two independent finite candidates',()=>{
  assert.deepEqual(directionCandidates(doc,[100,75],[0,1]),[{a:[100,75],b:[100,0]},{a:[100,75],b:[100,200]}]);
});
test('automatic direction ends at closest real crease, ignores auxiliary lines',()=>{
  const d={...doc,segments:[...doc.segments,s('near',[50,100],[150,100],'V'),s('aux',[50,90],[150,90],'A')]};
  assert.deepEqual(directionCandidates(d,[100,75],[0,1])[1],{a:[100,75],b:[100,100]});
});
test('a reference through the origin is not mistaken for a zero-length stop',()=>{
  assert.equal(directionCandidates(doc,[100,75],[0,1]).length,2);
});
test('explicit cutoff uses finite target and rejects zero or parallel target',()=>{
  assert.deepEqual(constructionEnd([100,75],[0,1],doc.segments[3]),[100,200]);
  assert.throws(()=>constructionEnd([100,75],[0,1],base),/零长度/);
  assert.throws(()=>constructionEnd([100,75],[0,1],doc.segments[2]),/平行/);
  assert.throws(()=>constructionEnd([100,75],[0,1],s('short',[125,150],[175,150])),/延长线/);
});
test('parallel candidates and negative-origin open drawings need no closed paper',()=>{
  const d:Doc={...doc,segments:[s('a',[-200,-100],[-200,100]),s('b',[-50,-100],[-50,100])]};
  assert.deepEqual(directionCandidates(d,[-100,0],[1,0]),[{a:[-100,0],b:[-200,0]},{a:[-100,0],b:[-50,0]}]);
  assert.deepEqual(directionCandidates({...d,segments:[]},[-100,0],[1,0]),[]);
});
test('construction calculations do not mutate geometry',()=>{
  const before=JSON.stringify(doc);directionCandidates(doc,[100,75],[0,1]);perpendicularFoot([100,125],base);
  assert.equal(JSON.stringify(doc),before);
});
