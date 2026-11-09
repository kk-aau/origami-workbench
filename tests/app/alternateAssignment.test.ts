import {test} from 'node:test';
import assert from 'node:assert/strict';
import {alternateAssignmentHits,applyAlternateAssignment} from '../../src/app/alternateAssignment';
import {historyReducer,type History} from '../../src/app/state';
import type {Doc,Point,Segment} from '../../src/core/types';
const s=(id:string,a:Point,b:Point,assignment:Segment['assignment']='M',angle:number|null=-45):Segment=>({id,a,b,assignment,angle});
const doc=(segments:Segment[]):Doc=>({name:'交替山谷',paper:{width:200,height:200},segments});
const a:Point=[0,0],b:Point=[100,0];
test('collinear mode sorts from press end, recolors whole partially overlapping fragments',()=>{
  const d=doc([s('far',[60,0],[120,0]),s('near',[-20,0],[20,0]),s('mid',[20,0],[60,0]),s('end',[100,0],[150,0]),s('off',[40,-10],[40,10])]);
  const forward=alternateAssignmentHits(d,a,b,'collinear','M');
  assert.deepEqual(forward.map(h=>[h.id,h.assignment]),[['near','M'],['mid','V'],['far','M']]);
  assert.deepEqual(alternateAssignmentHits(d,b,a,'collinear','V').map(h=>h.id),['far','mid','near']);
  const r=applyAlternateAssignment(d,a,b,'collinear','V');assert.deepEqual(r.doc.segments[0].b,[120,0]);
  assert.equal(r.doc.segments.length,d.segments.length);
});

test('collinear alternation keeps the first hit valley regardless of every drawing preset',()=>{
  const d=doc([s('far',[60,0],[100,0],'V',90),s('near',[0,0],[20,0],'V',65),s('mid',[20,0],[60,0],'V',45)]);
  for(const preset of ['M','V','B','A','U','F'] as const){
    const r=applyAlternateAssignment(d,a,b,'collinear',preset);
    assert.deepEqual(r.hits.map(h=>[h.id,h.assignment]),[['near','V'],['mid','M'],['far','V']]);
    assert.equal(r.doc.segments[1],d.segments[1]);
    assert.equal(r.doc.segments[2].angle,-45);
    assert.equal(r.changed,1);
  }
});

test('reversing the reference starts with the opposite end, independently of stored endpoint order',()=>{
  const d=doc([s('middle',[60,0],[20,0],'M'),s('left',[20,0],[0,0],'M'),s('right',[100,0],[60,0],'V',70)]);
  assert.deepEqual(alternateAssignmentHits(d,a,b,'collinear','V').map(h=>[h.id,h.assignment]),[['left','M'],['middle','V'],['right','M']]);
  assert.deepEqual(alternateAssignmentHits(d,b,a,'collinear','M').map(h=>[h.id,h.assignment]),[['right','V'],['middle','M'],['left','V']]);
});

test('first overlapping fragment is the origin-containing fragment, not an endpoint behind the origin',()=>{
  const d=doc([s('behind',[-20,0],[0,0],'M'),s('second',[40,0],[100,0],'M'),s('first',[-10,0],[40,0],'V',80)]);
  assert.deepEqual(alternateAssignmentHits(d,a,b,'collinear','M').map(h=>[h.id,h.assignment]),[['first','V'],['second','M']]);
});

test('collinear non-MV first segment asks for a type; protected boundaries are skipped',()=>{
  for(const type of ['B','A','U','F'] as const){
    const d=doc([s('first',[0,0],[20,0],type,type==='U'?null:0),s('second',[20,0],[100,0],'V',60)]),before=structuredClone(d);
    assert.throws(()=>applyAlternateAssignment(d,a,b,'collinear','M'),/第一段不是山折或谷折/);
    assert.deepEqual(d,before);
    if(type==='B')assert.deepEqual(alternateAssignmentHits(d,a,b,'collinear','M',true).map(h=>[h.id,h.assignment]),[['second','V']]);
  }
  assert.deepEqual(alternateAssignmentHits(doc([]),a,b,'collinear','A'),[]);
});

test('collinear automatic assignment is idempotent and a single undo restores the original types',()=>{
  const d=doc([s('one',[0,0],[30,0],'V',30),s('two',[30,0],[60,0],'V',null),s('three',[60,0],[100,0],'M',-90)]);
  const r=applyAlternateAssignment(d,a,b,'collinear','B');
  assert.deepEqual(r.doc.segments.map(s=>[s.assignment,s.angle]),[['V',30],['M',null],['V',90]]);
  assert.equal(applyAlternateAssignment(r.doc,a,b,'collinear','M').doc,r.doc);
  const history:History={past:[],present:d,future:[]},done=historyReducer(history,{type:'commit',doc:r.doc});
  assert.equal(done.past.length,1);assert.equal(historyReducer(done,{type:'undo'}).present,d);
});
test('crossing includes reference-end T but not target-end T, shared ends, collinear or extensions',()=>{
  const d=doc([s('x',[50,-10],[50,10]),s('start-T',[0,-10],[0,10]),s('end-T',[100,-10],[100,10]),s('target-end',[25,0],[25,10]),s('shared',[100,0],[110,10]),s('overlap',[20,0],[80,0]),s('extension',[120,-10],[120,10])]);
  assert.deepEqual(alternateAssignmentHits(d,a,b,'crossing','V').map(h=>[h.id,h.assignment]),[['start-T','V'],['x','M'],['end-T','V']]);
});
test('equal intersection weights preserve original document order and both count',()=>{
  const d=doc([s('first',[20,-10],[80,10]),s('second',[20,10],[80,-10]),s('third',[80,-10],[80,10])]);
  assert.deepEqual(alternateAssignmentHits(d,a,b,'crossing','M').map(h=>[h.id,h.assignment,h.order]),[['first','M',1],['second','V',2],['third','M',3]]);
});
test('boundary protection skips protected items without advancing alternation, auxiliaries count',()=>{
  const d=doc([s('boundary',[20,-10],[20,10],'B',0),s('aux',[40,-10],[40,10],'A',0),s('fold',[60,-10],[60,10])]);
  const r=applyAlternateAssignment(d,a,b,'crossing','V',true);
  assert.deepEqual(r.hits.map(h=>[h.id,h.assignment]),[['aux','V'],['fold','M']]);
  assert.equal(r.doc.segments[0],d.segments[0]);assert.equal(r.doc.segments[1].angle,180);
});
test('non-MV starting types assign a constant type, not forced alternating mountain',()=>{
  for(const first of ['A','B','U','F'] as const){
    const d=doc([s('one',[25,-10],[25,10]),s('two',[75,-10],[75,10])]);
    const r=applyAlternateAssignment(d,a,b,'crossing',first);
    assert.ok(r.doc.segments.every(s=>s.assignment===first));
    assert.ok(r.doc.segments.every(s=>s.angle===(first==='U'?null:0)));
  }
});
test('mountain valley changes retain magnitude, zero and unknown angles; objects untouched',()=>{
  const d=doc([s('one',[10,-10],[10,10],'M',-60),s('two',[20,-10],[20,10],'V',0),s('three',[30,-10],[30,10],'M',null)]);
  d.objects=[{kind:'circle',id:'circle',center:[50,50],radius:10,color:'#000000'}];
  const before=JSON.stringify(d),r=applyAlternateAssignment(d,a,b,'crossing','V');
  assert.deepEqual(r.doc.segments.map(s=>[s.assignment,s.angle]),[['V',60],['M',-0],['V',null]]);
  assert.equal(r.doc.objects,d.objects);assert.equal(JSON.stringify(d),before);assert.equal(r.changed,3);
});
test('no matches or already matching sequence is identity, one batch is one undo step',()=>{
  const d=doc([s('one',[20,-10],[20,10]),s('two',[80,-10],[80,10],'V',60)]);
  assert.equal(applyAlternateAssignment(d,a,b,'crossing','M').doc,d);
  assert.equal(applyAlternateAssignment(d,[0,50],[100,50],'crossing','V').doc,d);
  const r=applyAlternateAssignment(d,a,b,'crossing','V'),h:History={past:[],present:d,future:[]},done=historyReducer(h,{type:'commit',doc:r.doc});
  assert.equal(done.past.length,1);assert.equal(historyReducer(done,{type:'undo'}).present,d);
  assert.equal(historyReducer(historyReducer(done,{type:'undo'}),{type:'redo'}).present,r.doc);
});
test('invalid reference, mode and starting assignment fail without edits',()=>{
  const d=doc([]);for(const end of [[0,0],[NaN,0],[1e7,0]] as Point[])assert.throws(()=>alternateAssignmentHits(d,a,end,'crossing','M'));
  assert.throws(()=>alternateAssignmentHits(d,a,b,'invalid' as never,'M'));
  assert.throws(()=>alternateAssignmentHits(d,a,b,'crossing','invalid' as never));assert.deepEqual(d.segments,[]);
});
