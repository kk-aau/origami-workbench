import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearStartingFace, resolveStartingFace, setStartingFace } from '../../src/app/flatFoldSettings';
import { blankDoc, historyReducer } from '../../src/app/state';
import { buildFold, buildDiagramFold, polygonArea, splitIntersections } from '../../src/core/geometry';
import { exportDocument, importDocument } from '../../src/core/formats';
import { validateDoc, type Doc, type Point } from '../../src/core/types';

function fixture(): Doc {
  const doc=blankDoc('起始面',100,100);
  doc.segments.push({id:'m',a:[50,0],b:[50,100],assignment:'M',angle:-180});
  doc.segments=splitIntersections(doc).segments;return doc;
}
test('stored contour survives numbering, winding, naming and annotation changes',()=>{
  const original=fixture(),before=structuredClone(original),doc=setStartingFace(original,1);
  assert.deepEqual(original,before);assert.equal(resolveStartingFace(doc,buildFold(doc).graph).face,1);
  const graph=buildFold(doc).graph;
  graph.faces_vertices=graph.faces_vertices!.reverse().map(f=>f.slice(1).concat(f[0]).reverse());
  const renamed={...doc,name:'新名',objects:[{id:'text',kind:'text' as const,position:[0,0] as [number,number],text:'注释',fontSize:10,color:'#000000'}]};
  assert.deepEqual(resolveStartingFace(renamed,graph),{face:0,stale:false});
  assert.equal(setStartingFace(doc,1),doc);
});
test('splitting or removing the original face marks it stale rather than picking a neighbour',()=>{
  const doc=setStartingFace(fixture(),1);
  const changed={...doc,segments:[...doc.segments,{id:'split',a:[0,50] as [number,number],b:[100,50] as [number,number],assignment:'V' as const,angle:180}]};
  changed.segments=splitIntersections(changed).segments;
  assert.deepEqual(resolveStartingFace(changed,buildFold(changed).graph),{face:0,stale:true});
  assert.deepEqual(resolveStartingFace(clearStartingFace(changed),buildFold(changed).graph),{face:0,stale:false});
});
test('native JSON preserves settings while exchange formats explicitly warn about their loss',()=>{
  const doc=setStartingFace(fixture(),1),out=exportDocument(doc,'json'),loaded=importDocument(out.text,'json');
  assert.deepEqual(loaded.doc.flatFold,doc.flatFold);assert.deepEqual(loaded.warnings,[]);
  assert.deepEqual(resolveStartingFace(loaded.doc,buildFold(loaded.doc).graph),{face:1,stale:false});
  for(const format of ['cp','opx','fold'] as const)assert.ok(exportDocument(doc,format).warnings.some(w=>w.includes('起始面')));
});
test('normal document history restores prior starting face and clear operation',()=>{
  const original=fixture(),first=setStartingFace(original,1);
  let history=historyReducer({past:[],present:original,future:[]},{type:'commit',doc:first});
  history=historyReducer(history,{type:'undo'});assert.equal(history.present.flatFold,undefined);
  history=historyReducer(history,{type:'redo'});assert.deepEqual(history.present.flatFold,first.flatFold);
  history=historyReducer(history,{type:'commit',doc:clearStartingFace(history.present)});
  history=historyReducer(history,{type:'undo'});assert.deepEqual(history.present.flatFold,first.flatFold);
  assert.equal(clearStartingFace(original),original);
});
test('malformed settings and invalid face indices are rejected before saving',()=>{
  for(const flatFold of [null,[],{}, {startingFace:1}, {startingFace:[[0,0],[1,0]]}, {startingFace:[[0,0],[1,0],[NaN,1]]}, {startingFace:[[0,0],[1,0],[0,0]]}, {startingFace:[[0,0],[1,0],[0,1]],extra:1}]){
    assert.throws(()=>validateDoc({...fixture(),flatFold}));
  }
  for(const index of [-1,2,NaN,.5])assert.throws(()=>setStartingFace(fixture(),index),/起始面/);
});

function branchFixture(marks=false):Doc {
  const doc=blankDoc('固定面上的未完成折痕',100,100);
  if(marks)for(const x of [25,50,75])doc.segments.push({id:`mark-${x}`,a:[x,0],b:[x,100],assignment:'F',angle:0});
  doc.segments.push({id:'branch',a:[0,0],b:[35,40],assignment:'M',angle:-180});
  return doc;
}
test('a short boundary-to-interior crease stores and resolves the real outer contour without changing CP or face walks',()=>{
  for(const marks of [false,true]){
    const source=branchFixture(marks),graph=buildDiagramFold(source).graph,before=structuredClone({source,graph}),face=graph.faces_vertices![0];
    assert.ok(new Set(face).size<face.length,'the fixture must contain an outward-and-back branch');
    const selected=setStartingFace(source,0,graph),contour=selected.flatFold!.startingFace;
    assert.doesNotThrow(()=>validateDoc(selected));assert.equal(new Set(contour.map(p=>p.join(','))).size,contour.length);
    assert.equal(Math.abs(polygonArea(contour)),10000);assert.ok(contour.every(([x,y])=>x===0||x===100||y===0||y===100));
    assert.deepEqual(resolveStartingFace(selected,graph),{face:0,stale:false});assert.equal(setStartingFace(selected,0,graph),selected);
    assert.equal(selected.segments,source.segments);assert.deepEqual({source,graph},before);
  }
});

test('multiple branches retain the starting area across reversed winding and vertex renumbering',()=>{
  const source=branchFixture(true);source.segments.pop();
  const pairs:Point[][]=[[[0,0],[20,20]],[[20,20],[40,20]],[[20,20],[20,45]],[[100,75],[70,60]]];
  pairs.forEach(([a,b],i)=>source.segments.push({id:`tree-${i}`,a,b,assignment:'V',angle:180}));
  const graph=buildDiagramFold(source).graph,selected=setStartingFace(source,0,graph),reversed=structuredClone(graph),last=graph.vertices_coords.length-1;
  reversed.vertices_coords.reverse();reversed.edges_vertices=reversed.edges_vertices.map(([a,b])=>[last-a,last-b]);
  reversed.faces_vertices=reversed.faces_vertices!.map(face=>face.slice(2).concat(face.slice(0,2)).reverse().map(v=>last-v));
  assert.deepEqual(resolveStartingFace(selected,reversed),{face:0,stale:false});assert.equal(setStartingFace(selected,0,reversed),selected);
  const reversedSelection=setStartingFace(source,0,reversed);assert.ok(polygonArea(reversedSelection.flatFold!.startingFace)<0);
  assert.equal(Math.abs(polygonArea(reversedSelection.flatFold!.startingFace)),10000);
});

test('removing a short branch preserves its area while a true paper split invalidates the old contour',()=>{
  const source=branchFixture(),selected=setStartingFace(source,0,buildDiagramFold(source).graph);
  const removed={...selected,segments:selected.segments.filter(segment=>segment.id!=='branch')};
  assert.deepEqual(resolveStartingFace(removed,buildDiagramFold(removed).graph),{face:0,stale:false});
  const split={...selected,segments:[...selected.segments,{id:'crossing',a:[0,50] as Point,b:[100,50] as Point,assignment:'V' as const,angle:180}]};
  assert.deepEqual(resolveStartingFace(split,buildDiagramFold(split).graph),{face:0,stale:true});
});

test('multiple positive area cycles are rejected rather than deduplicated into an invented boundary',()=>{
  const source=blankDoc('不明确的外圈',100,100),graph=buildFold(source).graph;
  graph.vertices_coords=[[0,0],[10,0],[10,10],[0,10],[-10,0],[-10,-10],[0,-10]];
  graph.faces_vertices=[[0,1,2,3,0,4,5,6]];
  assert.throws(()=>setStartingFace(source,0,graph),/唯一非退化外圈/);
});
