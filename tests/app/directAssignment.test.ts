import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyDirectAssignment,directAssignmentHits,type DirectAssignment} from '../../src/app/directAssignment';
import {historyReducer,type History} from '../../src/app/state';
import {splitEditableSegments} from '../../src/app/planarize';
import {defaultAngle,type Doc,type Point,type Segment} from '../../src/core/types';
const line=(id:string,a:Point,b:Point,assignment:Segment['assignment']='M',angle=defaultAngle(assignment)):Segment=>({id,a,b,assignment,angle});
const doc=(segments:Segment[]):Doc=>({name:'直接赋型',paper:{width:200,height:200},segments,objects:[{id:'c',kind:'circle',center:[10,10],radius:5,color:'#000000'}]});
const point={kind:'point' as const,point:[50,50] as Point,radius:8};
const box={kind:'box' as const,a:[25,25] as Point,b:[75,75] as Point};

test('all four modes use touching boxes independent of drag direction',()=>{
  const d=doc([line('cross',[0,50],[100,50]),line('touch',[75,75],[100,100]),line('outside',[100,50],[150,50])]);
  for(const target of ['M','V','B','A'] as const)for(const area of [box,{...box,a:box.b,b:box.a}])
    assert.deepEqual([...directAssignmentHits(d,area,target)],['cross','touch']);
});
test('point ties follow document order, reversed for auxiliary, never ID order',()=>{
  const d=doc([line('z',[0,50],[100,50]),line('a',[50,0],[50,100],'V')]);
  for(const target of ['M','V','B'] as const)assert.deepEqual([...directAssignmentHits(d,point,target)],['z']);
  assert.deepEqual([...directAssignmentHits(d,point,'A')],['a']);
});
test('auxiliary only accepts B/M/V and never clicks through an ineligible nearest line',()=>{
  for(const assignment of ['A','U','F'] as const){
    const d=doc([line('far',[0,52],[100,52]),line('near',[0,50],[100,50],assignment)]);
    assert.equal(directAssignmentHits(d,point,'A').size,0);
    assert.deepEqual([...directAssignmentHits(d,box,'A')],['far']);
  }
  for(const assignment of ['B','M','V'] as const)assert.equal(directAssignmentHits(doc([line('x',[0,50],[100,50],assignment)]),point,'A').size,1);
});
test('radius is strict; extensions and circles are not targets',()=>{
  const d=doc([line('x',[0,58],[100,58])]);
  assert.equal(directAssignmentHits(d,point,'M').size,0);
  assert.equal(directAssignmentHits(d,{...point,radius:8.01},'M').size,1);
  assert.equal(directAssignmentHits(doc([line('x',[0,0],[10,0])]),{...point,point:[50,0]},'M').size,0);
  assert.equal(directAssignmentHits(doc([]),{...point,point:[10,10]},'M').size,0);
});
test('boundary lock excludes protected edges before picking and in boxes',()=>{
  const d=doc([line('b',[0,50],[100,50],'B'),line('v',[0,52],[100,52],'V')]);
  for(const area of [point,box])assert.deepEqual([...directAssignmentHits(d,area,'A',true)],['v']);
  assert.equal(applyDirectAssignment(d,box,'M',true).doc.segments[0],d.segments[0]);
});
test('fold angles preserve magnitude, zero and null; boundary and auxiliary reset angle',()=>{
  for(const angle of [-35,0,null]){
    const d=doc([line('x',[0,50],[100,50],'M',angle)]);
    const v=applyDirectAssignment(d,point,'V').doc;
    assert.equal(v.segments[0].angle,angle===null?null:Math.abs(angle));
    assert.equal(applyDirectAssignment(v,point,'M').doc.segments[0].angle,angle===null?null:-Math.abs(angle));
    for(const target of ['B','A'] as const)assert.equal(applyDirectAssignment(d,point,target).doc.segments[0].angle,0);
  }
  assert.equal(applyDirectAssignment(doc([line('x',[0,50],[100,50],'A')]),point,'M').doc.segments[0].angle,-180);
});
test('same assignment and empty hits are true identity no-ops; immutable proposal preserves IDs/objects',()=>{
  const d=doc([line('x',[0,50],[100,50])]),before=JSON.stringify(d);
  assert.equal(applyDirectAssignment(d,point,'M').doc,d);
  assert.equal(applyDirectAssignment(d,{...point,point:[150,150]},'V').doc,d);
  const result=applyDirectAssignment(d,point,'V');
  assert.equal(result.matched,1);assert.equal(result.changed,1);assert.equal(result.doc.objects,d.objects);
  assert.equal(result.doc.segments[0].id,'x');assert.equal(JSON.stringify(d),before);
});
test('normal commit splitting makes auxiliary conversion editable by fragments and undo is atomic',()=>{
  const d=doc([line('horizontal',[0,50],[100,50],'A'),line('vertical',[50,0],[50,100],'V')]);
  const converted=applyDirectAssignment(d,{...point,point:[25,50]},'M');
  const next=splitEditableSegments(converted.doc);assert.equal(next.segments.length,4);
  assert.equal(next.segments.filter(s=>s.assignment==='M').length,2);
  const initial:History={past:[],present:d,future:[]};
  const committed=historyReducer(initial,{type:'commit',doc:next});assert.equal(committed.past.length,1);
  const undone=historyReducer(committed,{type:'undo'});assert.deepEqual(undone.present,d);
  assert.deepEqual(historyReducer(undone,{type:'redo'}).present,next);
});
test('invalid target, radius and coordinates reject without mutation',()=>{
  const d=doc([line('x',[0,50],[100,50])]),before=JSON.stringify(d);
  assert.throws(()=>applyDirectAssignment(d,point,'U' as DirectAssignment),/直接赋型/);
  assert.throws(()=>directAssignmentHits(d,{...point,radius:Infinity},'M'),/半径/);
  assert.throws(()=>directAssignmentHits(d,{...point,point:[NaN,0]},'V'),/坐标/);
  assert.throws(()=>directAssignmentHits(d,{...box,b:[1e7,0]},'B'),/坐标/);
  assert.equal(JSON.stringify(d),before);
});
