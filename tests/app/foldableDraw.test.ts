import test from 'node:test';
import assert from 'node:assert/strict';
import { foldableDrawMode,foldableDrawAssignment,finishFoldableDraw } from '../../src/app/foldableDraw';
import {beginFoldableInput} from '../../src/app/foldableInput';
import type { Doc, Point, Segment } from '../../src/core/types';

const line=(id:string,a:Point,b:Point,assignment:'M'|'V'|'B'='M'):Segment=>({id,a,b,assignment,angle:assignment==='B'?0:assignment==='M'?-180:180});
const doc=(segments:Segment[]):Doc=>({schemaVersion:2,name:'组合画线',paper:{width:200,height:200},segments});

test('combined draw dispatches an odd-degree vertex with a valid candidate to foldable input',()=>{
  const drawing=doc([line('a',[100,100],[150,100]),line('b',[100,100],[100,150]),line('c',[100,100],[50,100])]);
  assert.equal(foldableDrawMode(drawing,[100,100],'M'),'foldable');
});

test('combined draw keeps even-degree, isolated and malformed starts on free line input',()=>{
  const even=doc([line('a',[100,100],[150,100]),line('b',[100,100],[100,150])]);
  assert.equal(foldableDrawMode(even,[100,100],'M'),'free');
  assert.equal(foldableDrawMode(doc([]),[20,20],'M'),'free');
  const malformed=doc([{...line('bad',[100,100],[150,100]),b:[Number.NaN,100]}]);
  assert.equal(foldableDrawMode(malformed,[100,100],'M'),'free');
});

test('single-ray supplement inherits mountain/valley and custom, zero or unknown fold angle',()=>{
  for(const assignment of ['M','V'] as const)for(const angle of [assignment==='M'?-65:65,0,null]){
    const drawing=doc([{...line('source',[100,100],[150,100],assignment),angle}]);
    const before=structuredClone(drawing),state=beginFoldableInput(drawing,[100,100],25);
    for(const preset of ['M','V','B','A'] as const)assert.equal(foldableDrawMode(drawing,[100,100],preset),'foldable');
    const result=finishFoldableDraw(drawing,state);
    assert.equal(result.assignment,assignment);assert.equal(result.angle,angle);
    assert.ok(Math.abs(result.b[0]-75)<1e-8);
    assert.deepEqual(drawing,before);
  }
});

test('a cutoff supplement keeps the inherited valley assignment and angle',()=>{
  const drawing=doc([{...line('source',[100,100],[150,100],'V'),angle:72}]);
  const state=beginFoldableInput(drawing,[100,100],25);
  const result=finishFoldableDraw(drawing,state,line('target',[0,0],[0,200],'B'));
  assert.equal(result.assignment,'V');assert.equal(result.angle,72);
  assert.ok(Math.hypot(result.b[0],result.b[1]-100)<1e-8);
  assert.equal(state.end?.[0],75);
});

test('degree-three completion is inferred from existing M/V counts in both directions',()=>{
  for(const [types,expected] of [['MMM','V'],['MMV','M'],['VVV','M'],['VVM','V']] as const){
    const ends:Point[]=[[150,100],[100,150],[50,100]];
    const drawing=doc(ends.map((end,i)=>line(String(i),[100,100],end,types[i] as 'M'|'V')));
    const result=finishFoldableDraw(drawing,beginFoldableInput(drawing,[100,100],25));
    assert.equal(result.assignment,expected);assert.equal(result.angle,expected==='M'?-180:180);
  }
});

test('unsplit through lines contribute two rays; auxiliaries do not affect automatic assignment',()=>{
  const drawing=doc([line('through',[50,100],[150,100],'M'),line('stem',[100,100],[100,150],'V'),{...line('aux',[100,100],[150,150]),assignment:'A',angle:0}]);
  assert.deepEqual(foldableDrawAssignment(drawing,[100,100]),{assignment:'M',angle:-180});
  const reversed=doc(drawing.segments.toReversed().map(s=>({...s,a:s.b,b:s.a})));
  assert.deepEqual(foldableDrawAssignment(reversed,[100,100]),{assignment:'M',angle:-180});
});

test('ambiguous or impossible multi-ray assignments fail without guessing from the preset',()=>{
  for(const type of ['U','B'] as const){
    const drawing=doc([line('a',[100,100],[150,100]),line('b',[100,100],[100,150]),{...line('c',[100,100],[50,100]),assignment:type,angle:type==='U'?null:0}]);
    assert.throws(()=>foldableDrawAssignment(drawing,[100,100]),/无法自动确定山谷/);
  }
  const impossible=doc([0,60,120,180,240].map((angle,i)=>line(String(i),[100,100],[100+50*Math.cos(angle*Math.PI/180),100+50*Math.sin(angle*Math.PI/180)])));
  assert.throws(()=>foldableDrawAssignment(impossible,[100,100]),/无法通过补一条线/);
});
