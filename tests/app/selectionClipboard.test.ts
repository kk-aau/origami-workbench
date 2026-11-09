import test from 'node:test';
import assert from 'node:assert/strict';
import {copySelectedSegments,pasteSegments,copySelectedDrawingObjects,pasteDrawingObjects,cutDrawingSelection,geometryClipboardCounts} from '../../src/app/selectionClipboard';
import {copyWorkbenchSelection,clipboardDescription,clipboardSize,isMaterialClipboard} from '../../src/app/materialClipboard';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {emptyEditorHistory,editorHistoryReducer} from '../../src/app/editorHistory';
import type { Doc, Segment } from '../../src/core/types';

const doc=():Doc=>({name:'clipboard',paper:{width:100,height:100},segments:[
  {id:'m',a:[10,10],b:[40,10],assignment:'M',angle:-45,displayColor:'#aabbcc'},
  {id:'b',a:[0,0],b:[100,0],assignment:'B',angle:0},
]});

test('copy snapshots only selected segments and preserves fold metadata',()=>{
  const source=doc(),clip=copySelectedSegments(source,new Set(['m']));
  assert.deepEqual(clip,[{a:[10,10],b:[40,10],assignment:'M',angle:-45,displayColor:'#aabbcc'}]);
  source.segments[0].a=[0,0];
  assert.deepEqual(clip[0].a,[10,10]);
});

test('paste appends fresh ids with an exact or offset world position',()=>{
  const source=doc(),clip=copySelectedSegments(source,new Set(['m']));
  const same=pasteSegments(source,clip),shifted=pasteSegments(source,clip,[5,-3]);
  assert.equal(same.segments.length,3);assert.equal(shifted.segments.length,3);
  const added=same.segments[2],moved=shifted.segments[2];
  assert.notEqual(added.id,'m');assert.deepEqual(added.a,[10,10]);assert.deepEqual(added.b,[40,10]);
  assert.deepEqual(moved.a,[15,7]);assert.deepEqual(moved.b,[45,7]);assert.equal(moved.assignment,'M');assert.equal(moved.angle,-45);
});

test('clipboard operations reject empty selections and invalid offsets',()=>{
  const source=doc();assert.throws(()=>copySelectedSegments(source,new Set()),/选择/);
  assert.throws(()=>pasteSegments(source,[],[0,0]),/剪贴板/);
  const clip=copySelectedSegments(source,new Set(['m']));assert.throws(()=>pasteSegments(source,clip,[Infinity,0]),/有限/);
});

test('paste IDs avoid objects as well as segments',t=>{
  t.mock.method(Date,'now',()=>123456);
  const source=doc();source.objects=[{id:'paste-'+(123456).toString(36)+'-0',kind:'circle',center:[20,20],radius:5,color:'#000000'}];
  const pasted=pasteSegments(source,copySelectedSegments(source,new Set(['m'])),[0,20]);
  assert.notEqual(pasted.segments.at(-1)!.id,source.objects[0].id);
  assert.deepEqual(pasted.objects,source.objects);
});

function mixedDoc():Doc{
  return {...doc(),objects:[
    {id:'circle',kind:'circle',center:[70,60],radius:12.5,color:'#225588'},
    {id:'other-circle',kind:'circle',center:[80,80],radius:5,color:'#008866'},
    {id:'note',kind:'text',position:[50,50],text:'保留注释',fontSize:5,color:'#112233'},
  ]};
}

test('circle-only and mixed copying takes independent snapshots and excludes unselected drawing objects',()=>{
  const source=mixedDoc(),before=structuredClone(source),clip=copySelectedDrawingObjects(source,{segments:new Set(['m']),circles:new Set(['circle','note','missing'])});
  assert.deepEqual(clip.circles,[{center:[70,60],radius:12.5,color:'#225588'}]);
  assert.deepEqual(geometryClipboardCounts(clip),{segments:1,circles:1});
  assert.equal(clipboardSize(clip),2);assert.equal(clipboardDescription(clip),'1 条线段、1 个辅助圆');
  const circles=copyWorkbenchSelection(source,new Set(),new Set(['circle']));
  assert.equal(isMaterialClipboard(circles),false);assert.equal(clipboardSize(circles),1);assert.equal(clipboardDescription(circles),'1 个辅助圆');
  assert.deepEqual(source,before);
  source.segments[0].a[0]=99;if(source.objects![0].kind==='circle')source.objects![0].center[0]=99;
  assert.deepEqual(clip.segments[0].a,[10,10]);assert.deepEqual(clip.circles[0].center,[70,60]);
});

test('mixed paste uses exact world offset and preserves radius, color, folds and unrelated objects',()=>{
  const source=mixedDoc(),clip=copySelectedDrawingObjects(source,{segments:new Set(['m']),circles:new Set(['circle'])}),before=structuredClone(clip);
  const pasted=pasteDrawingObjects(source,clip,[5,-3]),circle=pasted.objects!.at(-1)!;
  assert.deepEqual(pasted.segments.at(-1)!.a,[15,7]);assert.equal(pasted.segments.at(-1)!.assignment,'M');assert.equal(pasted.segments.at(-1)!.angle,-45);
  assert.deepEqual(pasted.objects!.slice(0,source.objects!.length),source.objects);
  assert.deepEqual(circle,{id:circle.id,kind:'circle',center:[75,57],radius:12.5,color:'#225588'});
  assert.deepEqual(clip,before);
  const twice=pasteDrawingObjects(pasted,clip,[5,-3]);
  const ids=[...twice.segments,...twice.objects!].map(object=>object.id);assert.equal(new Set(ids).size,ids.length);
});

test('one mixed paste is one undo/redo frame and neither operation corrupts its clipboard',()=>{
  const source=mixedDoc(),clip=copySelectedDrawingObjects(source,{segments:new Set(['m']),circles:new Set(['circle'])}),before=structuredClone(clip);
  const next=prepareEditorCommit(source,pasteDrawingObjects(source,clip,[5,20])).doc;
  const history=editorHistoryReducer(emptyEditorHistory(source),{type:'commit',doc:next});
  assert.equal(history.past.length,1);assert.equal(history.present.objects!.length,4);assert.equal(history.present.segments.length,3);
  const undo=editorHistoryReducer(history,{type:'undo'});assert.deepEqual(undo.present,source);
  assert.deepEqual(editorHistoryReducer(undo,{type:'redo'}).present,next);assert.deepEqual(clip,before);
});

test('cut records exactly the removable visible selection, excluding protected borders and hidden auxiliary objects',()=>{
  const source=mixedDoc();source.segments.push({id:'guide',a:[0,75],b:[100,75],assignment:'A',angle:0});
  const selected={segments:new Set(['m','b','guide']),circles:new Set(['circle'])};
  const result=cutDrawingSelection(source,selected,{main:true,auxiliary:false},true);
  assert.deepEqual(result.clipboard.segments.map(segment=>segment.assignment),['M']);assert.deepEqual(result.clipboard.circles,[]);
  assert.deepEqual(result.doc.segments.map(segment=>segment.id),['b','guide']);assert.deepEqual(result.doc.objects,source.objects);
  const pasted=pasteDrawingObjects(result.doc,result.clipboard,[0,20]);assert.equal(pasted.segments.filter(segment=>segment.assignment==='B').length,1);
  assert.throws(()=>cutDrawingSelection(source,{segments:new Set(['b']),circles:new Set(['circle'])},{main:true,auxiliary:false},true),/没有可剪切/);
});

test('mixed cut and circle-only cut preserve unrelated content and can each be undone once',()=>{
  const source=mixedDoc(),selected={segments:new Set(['m']),circles:new Set(['circle'])};
  const result=cutDrawingSelection(source,selected,{main:true,auxiliary:true},true),next=prepareEditorCommit(source,result.doc).doc;
  assert.deepEqual(next.objects!.map(object=>object.id),['other-circle','note']);assert.deepEqual(next.segments.map(segment=>segment.id),['b']);
  const history=editorHistoryReducer(emptyEditorHistory(source),{type:'commit',doc:next});
  assert.deepEqual(editorHistoryReducer(history,{type:'undo'}).present,source);
  assert.deepEqual(geometryClipboardCounts(result.clipboard),{segments:1,circles:1});
  const circleOnly=cutDrawingSelection(source,{segments:new Set(),circles:new Set(['circle'])},{main:false,auxiliary:true},true);
  assert.deepEqual(circleOnly.doc.segments,source.segments);assert.equal(circleOnly.clipboard.segments.length,0);assert.equal(circleOnly.clipboard.circles.length,1);
});

test('a rejected mixed paste leaves all source geometry intact, including coordinate overflow and invalid offsets',()=>{
  const source=mixedDoc(),clip=copySelectedDrawingObjects(source,{segments:new Set(['m']),circles:new Set(['circle'])}),before=structuredClone(source),clipBefore=structuredClone(clip);
  assert.throws(()=>pasteDrawingObjects(source,clip,[1e6,0]),/圆|坐标/);
  for(const offset of [[0],[0,0,0],new Array(2),[NaN,0]])assert.throws(()=>pasteDrawingObjects(source,clip,offset as [number,number]),/有限/);
  assert.deepEqual(source,before);assert.deepEqual(clip,clipBefore);
});

test('mixed paste ID generation also avoids preexisting circle, text and mark identities',t=>{
  t.mock.method(Date,'now',()=>123456);
  const source=mixedDoc(),prefix='paste-'+(123456).toString(36);
  source.objects!.push({id:prefix+'-0',kind:'text',position:[0,0],text:'编号占用',fontSize:4,color:'#000000'},{id:prefix+'-1',kind:'mark',a:[0,0],b:[1,0],color:'#000000'});
  const clip=copySelectedDrawingObjects(source,{segments:new Set(['m']),circles:new Set(['circle'])});
  const pasted=pasteDrawingObjects(source,clip),ids=[...pasted.segments,...pasted.objects!].map(object=>object.id);
  assert.equal(new Set(ids).size,ids.length);assert.notEqual(pasted.segments.at(-1)!.id,prefix+'-0');assert.notEqual(pasted.objects!.at(-1)!.id,prefix+'-1');
});
