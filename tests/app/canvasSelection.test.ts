import test from 'node:test';
import assert from 'node:assert/strict';
import type {Doc} from '../../src/core/types';
import {editableCanvasSelection,deleteCanvasSelection} from '../../src/app/canvasSelection';
import {prepareEditorCommit} from '../../src/app/editorCommit';

const source:Doc={name:'混合选区',paper:{width:100,height:100},segments:[
  {id:'edge',a:[0,0],b:[100,0],assignment:'B',angle:0},
  {id:'crease',a:[10,20],b:[90,20],assignment:'M',angle:-180},
  {id:'auxiliary',a:[10,30],b:[90,30],assignment:'A',angle:0},
],objects:[
  {id:'circle',kind:'circle',center:[40,50],radius:10,color:'#367d86'},
  {id:'text',kind:'text',position:[20,50],text:'保留注释',fontSize:5,color:'#000000'},
  {id:'mark',kind:'mark',a:[10,60],b:[90,60],color:'#000000'},
]};

test('select all follows displayed layers and boundary protection for both CP strokes and circles',()=>{
  for(const main of [false,true])for(const auxiliary of [false,true])for(const locked of [false,true]){
    const result=editableCanvasSelection(source,{main,auxiliary},locked);
    assert.deepEqual(result.segments,new Set([...(main?[...(!locked?['edge']:[]),'crease']:[]),...(auxiliary?['auxiliary']:[])]));
    assert.deepEqual(result.circles,new Set(auxiliary?['circle']:[]));
  }
});

test('keyboard deletion excludes hidden objects, newly locked boundaries and stale IDs',()=>{
  const selected={segments:new Set(['edge','crease','auxiliary','missing']),circles:new Set(['circle','text','mark','missing'])};
  const scoped=editableCanvasSelection(source,{main:true,auxiliary:false},true,selected);
  assert.deepEqual(scoped,{segments:new Set(['crease']),circles:new Set()});
  const next=deleteCanvasSelection(source,scoped);
  assert.deepEqual(next.segments.map(segment=>segment.id),['edge','auxiliary']);
  assert.deepEqual(next.objects,source.objects);
  assert.deepEqual(selected.segments,new Set(['edge','crease','auxiliary','missing']));
});

test('mixed circle and stroke deletion commits together and preserves labels, marks and the source snapshot',()=>{
  const before=structuredClone(source),selected={segments:new Set(['auxiliary']),circles:new Set(['circle','text','mark'])};
  const next=deleteCanvasSelection(source,editableCanvasSelection(source,{main:true,auxiliary:true},true,selected));
  const prepared=prepareEditorCommit(source,next);
  assert.deepEqual(prepared.doc.segments.map(segment=>segment.id),['edge','crease']);
  assert.deepEqual(prepared.doc.objects?.map(object=>object.id),['text','mark']);
  assert.deepEqual(source,before);
});

test('circle-only selections delete without selecting any CP line; empty selections keep the document reference',()=>{
  const selected={segments:new Set<string>(),circles:new Set(['circle'])};
  const next=deleteCanvasSelection(source,selected);
  assert.equal(next.segments.length,source.segments.length);
  assert.deepEqual(next.objects?.map(object=>object.id),['text','mark']);
  assert.equal(deleteCanvasSelection(source,{segments:new Set(),circles:new Set()}),source);
  const empty:Doc={name:'空白',paper:{width:100,height:100},segments:[]};
  assert.equal(deleteCanvasSelection(empty,{segments:new Set(),circles:new Set()}),empty);
});
