import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyTypeFilter,matchesLineType,typeFilterHits,type LineTypeFilter} from '../../src/app/typeFilter';
import {historyReducer,type History} from '../../src/app/state';
import type {Doc,Segment,Point} from '../../src/core/types';
const s=(id:string,a:Point,b:Point,assignment:Segment['assignment']='M',angle:number|null=-60):Segment=>({id,a,b,assignment,angle});
const doc=(segments:Segment[]):Doc=>({name:'类型筛选',paper:{width:200,height:200},segments,objects:[{id:'circle',kind:'circle',center:[10,10],radius:5,color:'#000000'}]});
const box={kind:'box' as const,a:[25,25] as Point,b:[125,125] as Point};

test('any includes every supported assignment; folds means only M/V, not auxiliary/unknown/flat',()=>{
  for(const a of ['M','V','B','A','U','F'] as const){assert.ok(matchesLineType(a,'any'));assert.ok(matchesLineType(a,a));assert.equal(matchesLineType(a,'folds'),a==='M'||a==='V');}
});
test('box matches contact in either direction, including partial crossing and boundary endpoint',()=>{
  const d=doc([s('cross',[0,50],[150,50]),s('inside',[50,75],[100,75]),s('touch',[125,125],[150,150]),s('outside',[150,25],[175,25])]);
  for(const area of [box,{...box,a:box.b,b:box.a}])assert.deepEqual([...typeFilterHits(d,area,'M')],['cross','inside','touch']);
});
test('point picks closest before filtering and cannot reach through mismatched nearest line',()=>{
  const d=doc([s('near',[0,0],[100,0],'V',45),s('far',[0,2],[100,2])]);
  assert.equal(typeFilterHits(d,{kind:'point',point:[50,0],radius:8},'M').size,0);
  assert.deepEqual([...typeFilterHits(d,{kind:'point',point:[50,0],radius:8},'V')],['near']);
});
test('replacement preserves magnitude, explicit zero and null; same target is true no-op',()=>{
  for(const angle of [-60,0,null]){const d=doc([s('a',[50,50],[100,50],'M',angle)]),r=applyTypeFilter(d,box,'folds',{kind:'replace',to:'V'});
    assert.equal(r.changed,1);assert.equal(r.doc.segments[0].angle,angle===null?null:Math.abs(angle));assert.equal(r.doc.segments[0].id,'a');
    const unchanged=applyTypeFilter(r.doc,box,'any',{kind:'replace',to:'V'});assert.equal(unchanged.doc,r.doc);assert.equal(unchanged.changed,0);assert.equal(unchanged.matched,1);
  }
});
test('nonfold-to-fold initializes angle; fold-to-aux and boundary reset correctly',()=>{
  const d=doc([s('a',[50,50],[100,50],'A',0)]);
  assert.equal(applyTypeFilter(d,box,'A',{kind:'replace',to:'M'}).doc.segments[0].angle,-180);
  const mountain=doc([s('a',[50,50],[100,50])]);
  for(const to of ['A','B','F'] as const)assert.equal(applyTypeFilter(mountain,box,'M',{kind:'replace',to}).doc.segments[0].angle,0);
  assert.equal(applyTypeFilter(mountain,box,'M',{kind:'replace',to:'U'}).doc.segments[0].angle,null);
});
test('deletion filters precisely, obeys boundary lock, preserves objects and original document',()=>{
  const d=doc([s('m',[50,50],[100,50]),s('v',[50,75],[100,75],'V',45),s('b',[50,100],[100,100],'B',0),s('aux',[50,110],[100,110],'A',0)]),before=JSON.stringify(d);
  const folds=applyTypeFilter(d,box,'folds',{kind:'delete'});assert.deepEqual(folds.doc.segments.map(s=>s.id),['b','aux']);assert.equal(folds.changed,2);
  assert.deepEqual(applyTypeFilter(d,box,'any',{kind:'delete'},true).doc.segments.map(s=>s.id),['b']);
  assert.equal(applyTypeFilter(d,box,'B',{kind:'replace',to:'M'},true).doc,d);assert.equal(folds.doc.objects,d.objects);assert.equal(JSON.stringify(d),before);
});
test('batch operation is one geometry history entry and undo/redo restores exact drawing',()=>{
  const d=doc([s('m',[50,50],[100,50]),s('v',[50,75],[100,75],'V',45)]),proposal=applyTypeFilter(d,box,'folds',{kind:'delete'});
  const initial:History={past:[],present:d,future:[]},committed=historyReducer(initial,{type:'commit',doc:proposal.doc});
  assert.equal(committed.past.length,1);const undone=historyReducer(committed,{type:'undo'});assert.deepEqual(undone.present,d);assert.deepEqual(historyReducer(undone,{type:'redo'}).present,proposal.doc);
});
test('invalid filters, targets and hit coordinates reject without mutation',()=>{
  const d=doc([s('a',[50,50],[100,50])]),before=JSON.stringify(d);
  assert.throws(()=>typeFilterHits(d,box,'invalid' as LineTypeFilter),/来源/);
  assert.throws(()=>applyTypeFilter(d,box,'any',{kind:'replace',to:'folds' as Segment['assignment']}),/目标/);
  assert.throws(()=>typeFilterHits(d,{kind:'point',point:[NaN,0],radius:8},'any'),/坐标/);
  assert.throws(()=>typeFilterHits(d,{kind:'point',point:[0,0],radius:-1},'any'),/半径/);
  assert.equal(JSON.stringify(d),before);
});
