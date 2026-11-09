import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SELECTION_PERSISTENCE_KEY,readSelectionPersistence,saveSelectionPersistence,selectionAfterOperation,selectionAfterCommit} from '../../src/app/selectionPersistence';
import {splitEditableSegmentsWithMap} from '../../src/app/planarize';
import {applySelectionTransformWithIds} from '../../src/app/selectionTransform';
import type {Doc} from '../../src/core/types';

test('selection preference defaults off, roundtrips, and rejects malformed or inaccessible storage',()=>{
 const data=new Map<string,string>(),storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};
 assert.equal(readSelectionPersistence(storage),false);
 for(const enabled of [true,false]){saveSelectionPersistence(enabled,storage);assert.equal(readSelectionPersistence(storage),enabled);}
 for(const raw of ['{','null','{"version":2,"enabled":true}','{"version":1,"enabled":"true"}']){data.set(SELECTION_PERSISTENCE_KEY,raw);assert.equal(readSelectionPersistence(storage),false);}
 assert.equal(readSelectionPersistence({getItem(){throw Error('blocked');}}),false);
 assert.throws(()=>saveSelectionPersistence(true,{setItem(){throw Error('blocked');}}),/blocked/);
 assert.throws(()=>saveSelectionPersistence('true' as unknown as boolean,storage),/布尔值/);
});

test('completed move retains new IDs and all intersection pieces; copy retains only source pieces',()=>{
 const doc:Doc={name:'selection',paper:{width:200,height:200},segments:[
  {id:'source',a:[10,10],b:[90,10],assignment:'M',angle:-180},
  {id:'cross',a:[50,30],b:[50,70],assignment:'V',angle:180},
 ]};
 const selected=new Set(['source']);
 for(const copy of [false,true]){
  const operation=applySelectionTransformWithIds(doc,[...selected],{kind:'translate',from:[0,0],to:[0,40]},copy),result=operation.doc;
  const movedIds=new Set(operation.drawnIds);
  const proposed=copy?selected:movedIds,split=splitEditableSegmentsWithMap(result);
  const kept=selectionAfterCommit(selected,split.descendants,proposed,true);
  assert.equal(kept.size,copy?1:2);
  for(const id of kept){const s=split.doc.segments.find(s=>s.id===id)!;assert.equal(s.assignment,'M');assert.equal(s.a[1],copy?10:50);}
  assert.equal(result.segments.filter(s=>s.assignment==='V').length,2,'both unselected crossing pieces survive');
  assert.ok(result.segments.filter(s=>s.assignment==='V').every(s=>!movedIds.has(s.id)),'split old crossing pieces are never part of the moved identity set');
  assert.deepEqual(selectionAfterCommit(selected,split.descendants,proposed,false),new Set());
 }
 assert.deepEqual(selected,new Set(['source']));
});

test('ordinary editing remaps selection independently of persistence and drops removed IDs',()=>{
 const map=new Map([['a',['a','a::split:1']],['b',['b']]]),selected=new Set(['a','missing']);
 for(const enabled of [true,false])assert.deepEqual(selectionAfterCommit(selected,map,undefined,enabled),new Set(['a','a::split:1']));
 assert.deepEqual(selectionAfterCommit(selected,map,new Set(),true),new Set());
});

test('automatic completion clears by default or retains only current IDs without mutating selection',()=>{
 const selected=new Set(['a','removed']);
 assert.deepEqual(selectionAfterOperation(selected,false,['a','b']),new Set());
 const retained=selectionAfterOperation(selected,true,['a','b']);
 assert.deepEqual(retained,new Set(['a']));retained.clear();
 assert.deepEqual(selected,new Set(['a','removed']));
 assert.deepEqual(selectionAfterOperation(new Set(),true,['a']),new Set());
});
