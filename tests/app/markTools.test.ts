import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appendMark,deleteMarks,markHits} from '../../src/app/markTools';
import {buildSnapPoints} from '../../src/app/snapPoints';
import {exportDocument,importDocument} from '../../src/core/formats';
import {historyReducer,type History} from '../../src/app/state';
import type {Doc,Point} from '../../src/core/types';
const base:Doc={name:'标记测试',paper:{width:200,height:200},segments:[{id:'mark',a:[0,50],b:[100,50],assignment:'M',angle:-180}],objects:[{id:'circle',kind:'circle',center:[50,50],radius:10,color:'#123456'}]};
test('mark creation owns endpoints, avoids IDs and leaves crease topology unchanged',()=>{
 const a:Point=[50,0],b:Point=[50,100],before=structuredClone(base),next=appendMark(base,a,b);
 a[0]=99;assert.equal(next.objects!.at(-1)!.id,'mark:2');
 assert.equal(next.segments,base.segments);assert.deepEqual(buildSnapPoints(next),buildSnapPoints(base));
 assert.deepEqual(next.objects!.at(-1),{kind:'mark',id:'mark:2',a:[50,0],b:[50,100],color:'#e58a24'});
 assert.deepEqual(base,before);
 const exported=exportDocument(next,'json');assert.deepEqual(importDocument(exported.text,'json').doc.objects,next.objects);
});
test('mark hit testing ignores coincident creases and circles and obeys box direction',()=>{
 const doc=appendMark(base,[50,0],[50,100]),id='mark:2';
 assert.deepEqual([...markHits(doc,{kind:'point',point:[50,50],radius:2})],[id]);
 assert.equal(markHits(doc,{kind:'point',point:[60,50],radius:2}).size,0);
 assert.equal(markHits(doc,{kind:'box',a:[40,40],b:[60,60]}).size,0);
 assert.deepEqual([...markHits(doc,{kind:'box',a:[60,60],b:[40,40]})],[id]);
 assert.deepEqual([...markHits(doc,{kind:'box',a:[40,0],b:[60,100]})],[id]);
 const next=deleteMarks(doc,new Set([id,'mark','circle']));assert.deepEqual(next,base);
 assert.equal(deleteMarks(doc,new Set(['circle','mark'])),doc);
});
test('invalid marks are rejected rather than saved or converted to creases',()=>{
 for(const [a,b] of [[[0,0],[0,0]],[[NaN,0],[1,1]],[[0,0],[Infinity,1]],[[0,0],[1000001,0]]] as [Point,Point][])
  assert.throws(()=>appendMark(base,a,b));
 assert.throws(()=>appendMark(base,[0,0],[1,1],'url(bad)'));
});

test('creating and deleting markers each creates one reversible history step',()=>{
 let history:History={past:[],present:base,future:[]};
 const created=appendMark(base,[50,0],[50,100]),deleted=deleteMarks(created,new Set(['mark:2']));
 for(const doc of [created,deleted])history=historyReducer(history,{type:'commit',doc});
 assert.equal(history.past.length,2);
 history=historyReducer(history,{type:'undo'});assert.equal(history.present,created);
 history=historyReducer(history,{type:'undo'});assert.equal(history.present,base);
 history=historyReducer(history,{type:'redo'});assert.equal(history.present,created);
 history=historyReducer(history,{type:'redo'});assert.equal(history.present,deleted);
 assert.ok(exportDocument(created,'cp').warnings.length>0);
});
