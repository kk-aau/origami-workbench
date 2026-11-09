import assert from 'node:assert/strict';
import test from 'node:test';
import {overlayDrawnSegments,overlayDrawnSegmentsWithIds} from '../../src/app/drawOverlay';
import {historyReducer,type History} from '../../src/app/state';
import {collinearOverlap,splitIntersections} from '../../src/core/geometry';
import {type Assignment,type Doc,type Segment,defaultAngle} from '../../src/core/types';

const s=(id:string,a:[number,number],b:[number,number],assignment:Assignment='M'):Segment=>({id,a,b,assignment,angle:defaultAngle(assignment)});
const doc=(segments:Segment[]):Doc=>({name:'overlay',paper:{width:200,height:200},segments});
const on=(segment:Segment,x:number)=>Math.min(segment.a[0],segment.b[0])<=x&&x<=Math.max(segment.a[0],segment.b[0]);

test('new auxiliary lines coexist with every main assignment and protected boundaries',()=>{
 for(const kind of ['M','V','B','F','U'] as Assignment[])for(const reverse of [false,true]){
  const old={...s('old',[25,50],[75,50],kind),angle:kind==='M'?-93:kind==='V'?67:defaultAngle(kind)},initial=doc([old]);
  const a:[number,number]=reverse?[100,50]:[0,50],b:[number,number]=reverse?[0,50]:[100,50];
  const result=overlayDrawnSegmentsWithIds(initial,[s('aux',a,b,'A')],true);
  assert.deepEqual(result.doc.segments.find(s=>s.id==='old'),old);
  assert.equal(result.doc.segments.filter(s=>s.assignment==='A').reduce((n,s)=>n+Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1]),0),100);
  assert(result.drawnIds.every(id=>result.doc.segments.find(s=>s.id===id)?.assignment==='A'));
 }
});
test('later auxiliary batch stroke cannot remove preceding main stroke',()=>{
 const next=overlayDrawnSegments(doc([]),[s('main',[0,50],[100,50],'V'),s('aux',[25,50],[75,50],'A')]);
 assert.equal(next.segments.filter(s=>s.assignment==='V').reduce((n,s)=>n+Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1]),0),100);
 assert.equal(next.segments.filter(s=>s.assignment==='A').length,1);
});

test('inserted identities retain surviving new pieces only, excluding split originals and covered batch pieces',()=>{
  const initial=doc([s('cross',[50,20],[50,80],'V')]);
  const result=overlayDrawnSegmentsWithIds(initial,[s('first',[0,50],[100,50]),s('last',[25,50],[75,50],'V')]);
  const selected=result.doc.segments.filter(piece=>result.drawnIds.includes(piece.id));
  assert.equal(selected.length,4);
  assert.ok(selected.every(piece=>piece.a[1]===50&&piece.b[1]===50));
  assert.equal(selected.filter(piece=>piece.assignment==='M').length,2);
  assert.equal(selected.filter(piece=>piece.assignment==='V').length,2);
  assert.equal(result.doc.segments.filter(piece=>piece.a[0]===50&&piece.b[0]===50).length,2);
});

test('a longer line covers a short collinear line in either direction',()=>{
  for(const [a,b] of [[[0,50],[100,50]],[[100,50],[0,50]]] as const){
    const initial=doc([s('short',[25,50],[75,50],'V')]);
    const next=overlayDrawnSegments(initial,[s('new',a,b,'M')]);
    assert.equal(next.segments.filter(segment=>segment.assignment==='V').length,0);
    assert.ok(next.segments.some(segment=>on(segment,10)));
    assert.ok(next.segments.some(segment=>on(segment,50)));
    assert.ok(next.segments.some(segment=>on(segment,90)));
    assert.equal(next.segments.every(segment=>segment.assignment==='M'),true);
    assert.equal(initial.segments[0].assignment,'V');
  }
});

test('offset overlap keeps only the uncovered old tail and the new assignment',()=>{
  const initial=doc([s('old',[25,50],[125,50],'V')]);
  const next=overlayDrawnSegments(initial,[s('new',[0,50],[100,50],'M')]);
  assert.equal(next.segments.filter(segment=>segment.assignment==='V').length,1);
  const tail=next.segments.find(segment=>segment.assignment==='V')!;
  assert.deepEqual([tail.a,tail.b],[[100,50],[125,50]]);
  assert.ok(next.segments.every(segment=>segment.assignment==='M'||Math.min(segment.a[0],segment.b[0])>=100));
});

test('crossings are split, parallel neighbours survive, and one undo restores source',()=>{
  const initial=doc([s('old',[25,50],[75,50],'V'),s('cross',[50,20],[50,80],'V'),s('parallel',[0,51],[100,51],'V')]);
  const next=overlayDrawnSegments(initial,[s('new',[0,50],[100,50],'M')]);
  assert.equal(next.segments.filter(segment=>segment.id.startsWith('cross')).length,3);
  assert.equal(next.segments.filter(segment=>segment.id==='parallel').length,1);
  assert.equal(next.segments.filter(segment=>segment.id.startsWith('old')).length,0);
  const history:History={past:[],present:initial,future:[]};
  const committed=historyReducer(history,{type:'commit',doc:next});
  assert.deepEqual(historyReducer(committed,{type:'undo'}).present,initial);
});

test('boundary protection refuses overlap atomically and allows endpoint contact',()=>{
  const initial=doc([s('boundary',[0,0],[100,0],'B')]);
  const before=JSON.stringify(initial);
  assert.throws(()=>overlayDrawnSegments(initial,[s('new',[25,0],[75,0],'M')],true),/边界保护/);
  assert.equal(JSON.stringify(initial),before);
  const touch=overlayDrawnSegments(initial,[s('touch',[100,0],[150,0],'M')],true);
  assert.equal(touch.segments.filter(segment=>segment.assignment==='B').length,1);
});

test('a batch replaces auxiliary coverage, keeps both old tails and gives later lines priority',()=>{
  const initial=doc([s('aux',[0,50],[150,50],'A')]);
  const next=overlayDrawnSegments(initial,[s('first',[25,50],[100,50],'M'),s('last',[75,50],[125,50],'V')]);
  const at=(x:number)=>next.segments.filter(segment=>Math.min(segment.a[0],segment.b[0])<x&&x<Math.max(segment.a[0],segment.b[0]));
  for(const [x,assignment] of [[10,'A'],[50,'M'],[90,'V'],[110,'V'],[140,'A']] as const){
    assert.equal(at(x).length,1);assert.equal(at(x)[0].assignment,assignment);
  }
  assert.doesNotThrow(()=>splitIntersections(next,true));
  assert.equal(initial.segments[0].assignment,'A');
});

test('same-type batch repeats leave one copy of every finite interval',()=>{
  const next=overlayDrawnSegments(doc([]),[s('one',[0,50],[100,50]),s('two',[25,50],[75,50]),s('three',[100,50],[0,50])]);
  assert.ok(next.segments.every(segment=>segment.assignment==='M'&&segment.angle===-180));
  assert.equal(next.segments.reduce((sum,segment)=>sum+Math.hypot(segment.b[0]-segment.a[0],segment.b[1]-segment.a[1]),0),100);
  for(let i=0;i<next.segments.length;i++)for(let j=0;j<i;j++)assert.equal(collinearOverlap(next.segments[i],next.segments[j]),false);
});

test('zero and null angles replace only the covered interval and can be undone together',()=>{
  const initial=doc([s('old',[0,50],[150,50])]);
  const next=overlayDrawnSegments(initial,[{...s('zero',[25,50],[125,50]),angle:0},{...s('unknown',[50,50],[100,50]),angle:null}]);
  const at=(x:number)=>next.segments.find(segment=>Math.min(segment.a[0],segment.b[0])<x&&x<Math.max(segment.a[0],segment.b[0]))!;
  assert.equal(at(10).angle,-180);assert.equal(at(40).angle,0);assert.equal(at(75).angle,null);assert.equal(at(110).angle,0);assert.equal(at(140).angle,-180);
  const committed=historyReducer({past:[],present:initial,future:[]},{type:'commit',doc:next});
  assert.deepEqual(historyReducer(committed,{type:'undo'}).present,initial);
});

test('a protected boundary prevents the entire batch while unlocked drawing preserves its tails',()=>{
  const initial=doc([s('boundary',[0,0],[100,0],'B'),s('aux',[0,50],[100,50],'A')]),before=structuredClone(initial);
  const batch=[s('valid',[25,50],[75,50]),s('protected',[25,0],[75,0],'V')];
  assert.throws(()=>overlayDrawnSegments(initial,batch,true),/边界保护/);assert.deepEqual(initial,before);
  const unlocked=overlayDrawnSegments(initial,batch);
  assert.equal(unlocked.segments.filter(segment=>segment.assignment==='B').length,2);
});
