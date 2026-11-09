import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rayConstructionGeometry,appendRayConstruction} from '../../src/app/rayConstruction';
import {historyReducer,type History} from '../../src/app/state';
import type {Doc,Point,Segment} from '../../src/core/types';

const segment=(id:string,a:Point,b:Point,assignment:Segment['assignment']='A'):Segment=>({id,a,b,assignment,angle:assignment==='M'?-180:assignment==='V'?180:0});
const doc=(segments:Segment[]):Doc=>({name:'射线构造',paper:{width:100,height:100},segments});

test('ray follows both defining points and ends on the specifically chosen finite segment',()=>{
  const start:Point=[0,0],through:Point=[10,5],target=segment('target',[40,-10],[40,30]);
  const before=JSON.stringify({start,through,target});
  for(const chosen of [target,{a:target.b,b:target.a}]){
    const result=rayConstructionGeometry(start,through,chosen);
    assert.deepEqual(result.a,[0,0]);assert.ok(Math.hypot(result.b[0]-40,result.b[1]-20)<1e-10);
  }
  assert.equal(JSON.stringify({start,through,target}),before);
});

test('real target endpoint contacts and a target at the through point are accepted',()=>{
  assert.deepEqual(rayConstructionGeometry([0,0],[10,0],{a:[30,0],b:[30,20]}).b,[30,0]);
  assert.deepEqual(rayConstructionGeometry([0,0],[10,0],{a:[10,-5],b:[10,5]}).b,[10,0]);
});

test('behind-origin and before-through intersections cannot reverse or shorten the defined ray',()=>{
  for(const x of [-10,0,5])assert.throws(()=>rayConstructionGeometry([0,0],[10,0],{a:[x,-10],b:[x,10]}),/后方.*不能回退/);
});

test('parallel, collinear, and target-extension-only intersections have distinct actionable errors',()=>{
  assert.throws(()=>rayConstructionGeometry([0,0],[10,0],{a:[20,5],b:[40,5]}),/平行/);
  assert.throws(()=>rayConstructionGeometry([0,0],[10,0],{a:[20,0],b:[40,0]}),/共线.*唯一交点/);
  assert.throws(()=>rayConstructionGeometry([0,0],[10,0],{a:[20,5],b:[20,10]}),/延长线.*有限线段/);
});

test('degenerate and invalid inputs fail before drawing',()=>{
  const target={a:[20,-5] as Point,b:[20,5] as Point};
  assert.throws(()=>rayConstructionGeometry([0,0],[0,0],target),/经过点.*重合/);
  assert.throws(()=>rayConstructionGeometry([0,0],[1e-8,0],target),/过近/);
  assert.throws(()=>rayConstructionGeometry([0,0],[10,0],{a:[20,0],b:[20,0]}),/目标线段长度/);
  assert.throws(()=>rayConstructionGeometry([NaN,0],[10,0],target),/坐标/);
  assert.throws(()=>rayConstructionGeometry([0,0],[10,0],target,0),/容差/);
});

test('translated short constructions and long rays retain finite intersection precision',()=>{
  assert.deepEqual(rayConstructionGeometry([999990,999990],[999990.01,999990],{a:[999990.02,999989],b:[999990.02,999991]}).b,[999990.02,999990]);
  assert.deepEqual(rayConstructionGeometry([-1e6,0],[-999999,0],{a:[1e6,-10],b:[1e6,10]}).b,[1e6,0]);
});

test('commit reaches the selected far target, splits intervening lines, preserves assignment and undoes once',()=>{
  const source=doc([segment('near',[10,-10],[10,10],'V'),segment('chosen',[30,-10],[30,10],'B')]);
  const before=JSON.stringify(source),next=appendRayConstruction(source,[0,0],[5,0],'chosen','M',true,37.5);
  const drawn=next.segments.filter(s=>s.assignment==='M');
  assert.deepEqual(drawn.map(s=>[s.a,s.b,s.angle]),[[[0,0],[10,0],-37.5],[[10,0],[30,0],-37.5]]);
  assert.equal(next.segments.filter(s=>s.assignment==='V').length,2);
  assert.equal(next.segments.filter(s=>s.assignment==='B').length,2);
  assert.equal(JSON.stringify(source),before);
  const initial:History={past:[],present:source,future:[]},committed=historyReducer(initial,{type:'commit',doc:next});
  const undone=historyReducer(committed,{type:'undo'});
  assert.deepEqual(undone.present,source);
  assert.deepEqual(historyReducer(undone,{type:'redo'}).present,next);
});

test('commit rechecks target existence and preserves protected boundaries and failed inputs',()=>{
  const source=doc([segment('paper',[0,0],[30,0],'B'),segment('target',[30,-10],[30,10],'B')]),before=JSON.stringify(source);
  assert.throws(()=>appendRayConstruction(source,[0,0],[5,0],'removed','M'),/不存在/);
  assert.throws(()=>appendRayConstruction(source,[0,0],[5,0],'target','M',true),/边界保护/);
  assert.equal(JSON.stringify(source),before);
  const result=appendRayConstruction(doc([segment('target',[30,-10],[30,10])]),[0,0],[5,0],'target','V',false,42.25);
  assert.equal(result.segments.find(s=>s.assignment==='V')?.angle,42.25);
});
