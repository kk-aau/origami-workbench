import test from 'node:test';
import assert from 'node:assert/strict';
import type {Assignment,Doc,Point,Segment} from '../../src/core/types';
import {defaultAngle,validateDoc} from '../../src/core/types';
import {applyDrawingFoldAngle,parseFoldAngleDraft,setSelectedFoldAngle,signedFoldAngle,summarizeFoldAngles} from '../../src/app/foldAngles';
import {blankDoc,historyReducer,line,type History} from '../../src/app/state';
import {overlayDrawnSegments} from '../../src/app/drawOverlay';
import {appendDividedLine} from '../../src/app/dividedLine';
import {appendRestrictedDrawing} from '../../src/app/restrictedDrawing';
import {continuousReflection} from '../../src/app/continuousReflection';
import {fishbone} from '../../src/app/fishbone';
import {rabbitEar} from '../../src/app/rabbitEar';
import {mirrorCopies} from '../../src/app/mirror';
import {applySelectionTransformWithIds} from '../../src/app/selectionTransform';
import {prepareEditorCommit} from '../../src/app/editorCommit';

const segment=(id:string,assignment:Assignment,angle:number|null=defaultAngle(assignment),a:Point=[10,10],b:Point=[90,10]):Segment=>({id,a,b,assignment,angle});
function fixture():Doc {
  return {...blankDoc('角度属性',100,100),segments:[
    segment('mountain','M',-45,[10,10],[90,10]),segment('valley','V',45,[10,20],[90,20]),
    segment('unknown','M',null,[10,30],[90,30]),segment('zero','V',0,[10,40],[90,40]),
    segment('edge','B',0,[0,0],[100,0]),segment('aux','A',0,[10,50],[90,50]),
    segment('flat','F',0,[10,60],[90,60]),segment('unassigned','U',null,[10,70],[90,70]),
  ]};
}

test('selected angle reads a common magnitude, including opposite signs, without mutating selection',()=>{
  const doc=fixture(),before=structuredClone(doc),selected=new Set(['mountain','valley','edge','aux']);
  assert.deepEqual(summarizeFoldAngles(doc.segments,selected),{value:45,editableCount:2,ignoredCount:2});
  assert.deepEqual(summarizeFoldAngles(doc.segments,new Set(['zero'])),{value:0,editableCount:1,ignoredCount:0});
  assert.deepEqual(doc,before);assert.equal(selected.size,4);
});

test('mixed, unknown and no editable angle remain distinct',()=>{
  const segments=fixture().segments;
  assert.deepEqual(summarizeFoldAngles(segments,new Set(['unknown'])),{value:null,editableCount:1,ignoredCount:0});
  for(const selected of [new Set(['unknown','zero']),new Set(['valley','zero']),new Set(['mountain','unknown'])])
    assert.equal(summarizeFoldAngles(segments,selected).value,'mixed');
  assert.deepEqual(summarizeFoldAngles(segments,new Set(['edge','aux','flat','unassigned'])),{value:'none',editableCount:0,ignoredCount:4});
  assert.deepEqual(summarizeFoldAngles(segments,new Set()),{value:'none',editableCount:0,ignoredCount:0});
  assert.equal(summarizeFoldAngles([segment('m','M',null),segment('v','V',null)]).value,null);
});

test('an explicit batch assignment changes only selected M/V angles and commits one undo frame',()=>{
  const doc=fixture(),before=structuredClone(doc),ids=new Set(doc.segments.map(s=>s.id));
  const result=setSelectedFoldAngle(doc,ids,72.5);
  assert.equal(result.changed,4);
  assert.deepEqual(result.doc.segments.map(s=>s.angle),[-72.5,72.5,-72.5,72.5,0,0,0,null]);
  assert.deepEqual(result.doc.segments.map(s=>s.assignment),doc.segments.map(s=>s.assignment));
  assert.deepEqual(doc,before);
  result.doc.segments.slice(4).forEach((s,i)=>assert.equal(s,doc.segments[i+4]));
  const prepared=prepareEditorCommit(doc,result.doc);
  const history:History={past:[],present:doc,future:[]};
  const changed=historyReducer(history,{type:'commit',doc:prepared.doc});
  assert.equal(changed.past.length,1);
  const undone=historyReducer(changed,{type:'undo'});assert.deepEqual(undone.present,doc);
  assert.deepEqual(historyReducer(undone,{type:'redo'}).present,prepared.doc);
});

test('unknown, zero and unchanged angle edits do not invent defaults or extra changes',()=>{
  const doc=fixture();
  assert.equal(setSelectedFoldAngle(doc,new Set(['mountain','valley']),45).doc,doc);
  assert.equal(setSelectedFoldAngle(doc,new Set(['edge','aux','flat','unassigned']),180).doc,doc);
  const unknown=setSelectedFoldAngle(doc,new Set(['mountain','valley','unknown']),null);
  assert.equal(unknown.changed,2);assert.deepEqual(unknown.doc.segments.slice(0,3).map(s=>s.angle),[null,null,null]);
  const zero=setSelectedFoldAngle(doc,new Set(['mountain','valley']),0);
  assert.equal(zero.doc.segments[0].angle,0);assert.equal(zero.doc.segments[1].angle,0);
  assert.equal(Object.is(zero.doc.segments[0].angle,-0),false);
  assert.deepEqual(JSON.parse(JSON.stringify(unknown.doc)),unknown.doc);
  assert.doesNotThrow(()=>validateDoc(unknown.doc));
});

test('blank or out-of-range drafts reject, including nonfinite values; decimals and endpoints are accepted',()=>{
  for(const text of ['',' ','NaN','Infinity','-1','180.01'])assert.throws(()=>parseFoldAngleDraft(text),/折叠角度/);
  for(const value of [NaN,Infinity,-1,180.01]){
    assert.throws(()=>signedFoldAngle('M',value),/折叠角度/);
    assert.throws(()=>setSelectedFoldAngle(fixture(),new Set(['mountain']),value),/折叠角度/);
    assert.throws(()=>applyDrawingFoldAngle([segment('v','V')],value),/折叠角度/);
  }
  for(const value of [0,22.5,90,180]){
    assert.equal(parseFoldAngleDraft(String(value)),value);
    assert.equal(signedFoldAngle('V',value),value);
    assert.equal(signedFoldAngle('M',value),value===0?0:-value);
  }
});

test('drawing preference only sets newly supplied mountain/valley geometry and keeps nonfold angles',()=>{
  const proposed=fixture().segments,before=structuredClone(proposed);
  assert.equal(applyDrawingFoldAngle(proposed),proposed);
  const updated=applyDrawingFoldAngle(proposed,120);
  assert.deepEqual(updated.slice(0,4).map(s=>s.angle),[-120,120,-120,120]);
  updated.slice(4).forEach((s,i)=>assert.equal(s,proposed[i+4]));
  assert.deepEqual(proposed,before);
  assert.ok(applyDrawingFoldAngle(proposed,null).slice(0,4).every(s=>s.angle===null));
});

test('a new angled line splits an existing crossing crease without changing its source angle',()=>{
  const old=segment('old','M',-37,[0,50],[100,50]),doc={...blankDoc('交点',100,100),segments:[...blankDoc('交点',100,100).segments,old]};
  const drawn=applyDrawingFoldAngle([line([50,0],[50,100],'V')],75);
  const next=overlayDrawnSegments(doc,drawn);
  const oldPieces=next.segments.filter(s=>s.id.startsWith('old'));
  assert.equal(oldPieces.length,2);assert.ok(oldPieces.every(s=>s.angle===-37));
  assert.ok(next.segments.filter(s=>s.assignment==='V').every(s=>s.angle===75));
  assert.equal(old.angle,-37);
});

test('divided and restricted drawing use the preference before splitting and preserve old fragments',()=>{
  const base=blankDoc('分段与受限',100,100),old=segment('old','M',-37,[0,50],[100,50]);
  const doc={...base,segments:[...base.segments,old]},before=structuredClone(doc);
  const divided=appendDividedLine(doc,[25,0],[25,100],'V',{kind:'equal',count:4},true,80);
  assert.equal(divided.segments.filter(s=>s.assignment==='V').length,4);
  assert.ok(divided.segments.filter(s=>s.assignment==='V').every(s=>s.angle===80));
  assert.ok(divided.segments.filter(s=>s.id.startsWith('old')).every(s=>s.angle===-37));
  const restricted=appendRestrictedDrawing(doc,'line',[75,0],[75,100],1,{vertices:[[75,0],[75,100]],centers:[]},'M',true,110);
  assert.equal(restricted.segments.filter(s=>s.assignment==='M'&&s.angle===-110).length,2);
  assert.ok(restricted.segments.filter(s=>s.id.startsWith('old')).every(s=>s.angle===-37));
  assert.deepEqual(doc,before);
});

test('drawing the same geometry at a different angle is not discarded as an identical default-angle duplicate',()=>{
  const doc={...blankDoc('新角度',100,100),segments:[segment('old','M',-180,[0,50],[100,50])]};
  const next=appendDividedLine(doc,[25,50],[75,50],'M',{kind:'equal',count:2},false,60);
  const fresh=next.segments.filter(s=>s.angle===-60),tails=next.segments.filter(s=>s.angle===-180);
  assert.equal(fresh.length,2);assert.equal(tails.length,2);
  assert.equal(doc.segments[0].angle,-180);
});

test('new multi-line constructions apply one magnitude with each resulting mountain/valley sign',()=>{
  const base=blankDoc('多线构造',200,200),doc={...base,segments:[...base.segments,segment('mirror','M',-35,[100,0],[100,200])]},before=structuredClone(doc);
  const continuous=continuousReflection(doc,[25,100],[50,100],'M',65);
  assert.deepEqual(continuous.path.map(s=>s.angle),[-65,65]);
  const teeth=fishbone(base,[25,100],[175,100],25,'M',95).copies;
  assert.ok(teeth.every(s=>s.angle===(s.assignment==='M'?-95:95)));
  const rabbit=rabbitEar(base,[[0,0],[120,0],[0,90]],'V',25).copies;
  assert.equal(rabbit.length,3);assert.ok(rabbit.every(s=>s.angle===25));
  assert.deepEqual(doc,before);
});

test('copy, mirror and move keep source targets independently of a subsequent drawing preference',()=>{
  const doc=fixture(),ids=new Set(['mountain','unknown']),before=structuredClone(doc);
  const transform={kind:'translate' as const,from:[0,0] as Point,to:[0,5] as Point};
  const moved=applySelectionTransformWithIds(doc,[...ids],transform,false,false);
  const copied=applySelectionTransformWithIds(doc,[...ids],transform,true,false);
  assert.deepEqual(moved.doc.segments.filter(s=>moved.drawnIds.includes(s.id)).map(s=>s.angle),[-45,null]);
  assert.deepEqual(copied.doc.segments.filter(s=>copied.drawnIds.includes(s.id)).map(s=>s.angle),[-45,null]);
  const mirrors=mirrorCopies(doc,[...ids],[0,90],[100,90],false);
  assert.deepEqual(mirrors.map(s=>s.angle),[-45,null]);
  applyDrawingFoldAngle([line([0,80],[100,80],'V')],15);
  assert.deepEqual(doc,before);
});
