import {test} from 'node:test';
import assert from 'node:assert/strict';
import {eraseAlongLine,lineEraseHits,type LineEraseMode} from '../../src/app/lineErase';
import {historyReducer,type History} from '../../src/app/state';
import type {Doc,Point,Segment} from '../../src/core/types';
const s=(id:string,a:Point,b:Point,assignment:Segment['assignment']='M'):Segment=>({id,a,b,assignment,angle:assignment==='M'?-60:0});
const doc=(segments:Segment[]):Doc=>({name:'划线删除',paper:{width:200,height:200},segments});
const a:Point=[0,0],b:Point=[100,0];
const sources=[s('overlap',[20,0],[80,0]),s('cross',[50,-20],[50,20]),s('t',[30,0],[30,20]),s('end',[100,0],[110,10]),s('collinear-end',[100,0],[120,0]),s('extension',[150,-20],[150,20])];
test('overlap deletion excludes X crossings and isolated endpoint contact',()=>{
  assert.deepEqual([...lineEraseHits(doc(sources),a,b,'overlap')],['overlap']);
});
test('crossing mode includes overlap plus proper X but excludes T, ends and extensions',()=>{
  assert.deepEqual([...lineEraseHits(doc(sources),a,b,'crossing')],['overlap','cross']);
  assert.deepEqual([...lineEraseHits(doc(sources),b,a,'crossing')],['overlap','cross']);
});
test('partial collinear contact deletes whole existing fragment, not only intersecting portion',()=>{
  const d=doc([s('fragment',[-50,0],[50,0]),s('other',[100,20],[150,20])]),r=eraseAlongLine(d,a,b,'overlap');
  assert.deepEqual(r.doc.segments,[d.segments[1]]);assert.equal(d.segments.length,2);
});
test('all assignments participate except protected B; auxiliary objects remain untouched',()=>{
  const d=doc(['M','V','B','A','U','F'].map((type,i)=>({...s(type,[10+i*10,-20],[10+i*10,20],type as Segment['assignment']),angle:type==='M'?-60:type==='V'?45:type==='U'?null:0})));
  d.objects=[{id:'circle',kind:'circle',center:[50,0],radius:10,color:'#000000'}];const before=JSON.stringify(d);
  const locked=eraseAlongLine(d,a,b,'crossing',true);assert.deepEqual(locked.doc.segments.map(s=>s.id),['B']);assert.equal(locked.doc.objects,d.objects);
  assert.equal(eraseAlongLine(d,a,b,'crossing').doc.segments.length,0);assert.equal(JSON.stringify(d),before);
});
test('no hits preserve document identity and do not add undo steps',()=>{
  const d=doc([s('away',[0,10],[100,10])]),r=eraseAlongLine(d,a,b,'crossing'),h:History={past:[],present:d,future:[]};
  assert.equal(r.doc,d);assert.equal(r.removedIds.size,0);assert.equal(historyReducer(h,{type:'commit',doc:r.doc}),h);
});
test('multi-fragment deletion is atomically undoable and redoable',()=>{
  const d=doc(sources),r=eraseAlongLine(d,a,b,'crossing'),h:History={past:[],present:d,future:[]},done=historyReducer(h,{type:'commit',doc:r.doc});
  assert.equal(done.past.length,1);const undo=historyReducer(done,{type:'undo'});assert.deepEqual(undo.present,d);assert.deepEqual(historyReducer(undo,{type:'redo'}).present,r.doc);
});
test('invalid or degenerate references and mode reject without modifying sources',()=>{
  const d=doc(sources),before=JSON.stringify(d);
  assert.throws(()=>eraseAlongLine(d,a,a,'crossing'),/不能重合/);
  assert.throws(()=>eraseAlongLine(d,[NaN,0],b,'overlap'),/坐标/);
  assert.throws(()=>eraseAlongLine(d,a,b,'invalid' as LineEraseMode),/模式/);assert.equal(JSON.stringify(d),before);
});
