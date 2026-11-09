import {test} from 'node:test';
import assert from 'node:assert/strict';
import {regionalSwapHits,applyRegionalSwap,applySelectedFoldSwap} from '../../src/app/regionalSwap';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {selectionAfterCommit} from '../../src/app/selectionPersistence';
import {historyReducer} from '../../src/app/state';
import {defaultAngle,type Doc,type Segment,type Point} from '../../src/core/types';
const line=(id:string,y:number,assignment:Segment['assignment'],angle=defaultAngle(assignment)):Segment=>({id,a:[0,y],b:[100,y],assignment,angle});
const doc=(segments:Segment[]):Doc=>({name:'区域山谷',paper:{width:200,height:200},segments,objects:[]});
const box={kind:'box' as const,a:[25,25] as Point,b:[75,75] as Point};
const point={kind:'point' as const,point:[50,50] as Point,radius:8};
test('both drag directions swap only contacted M/V, never A/B/U/F',()=>{
  const d=doc(['M','V','A','B','U','F'].map((t,i)=>line(String(i),30+i*5,t as Segment['assignment'])));
  for(const area of [box,{...box,a:box.b,b:box.a}]){
    const r=applyRegionalSwap(d,area);assert.equal(r.changed,2);
    assert.deepEqual(r.doc.segments.map(s=>s.assignment),['V','M','A','B','U','F']);
    assert.equal(r.doc.objects,d.objects);
  }
});
test('nearest ineligible line blocks click; equal distances use document order, not IDs',()=>{
  for(const t of ['A','B','U','F'] as const)assert.equal(regionalSwapHits(doc([line('a',50,t),line('b',51,'M')]),point).size,0);
  assert.deepEqual([...regionalSwapHits(doc([line('z',50,'M'),line('a',50,'V')]),point)],['z']);
});
test('swap preserves angle magnitude/null and is an involution without mutating input',()=>{
  const d=doc([line('m',30,'M',-65),line('v',40,'V',30),line('z',50,'M',0),line('n',60,'V',null)]),before=JSON.stringify(d);
  const changed=applyRegionalSwap(d,box).doc;
  assert.deepEqual(changed.segments.map(s=>s.angle),[65,-30,-0,null]);
  assert.deepEqual(applyRegionalSwap(changed,box).doc,d);assert.equal(JSON.stringify(d),before);
});
test('empty/unsupported hit is identity; lock excludes boundary before nearest picking',()=>{
  const d=doc([line('b',50,'B'),line('m',51,'M')]);
  assert.equal(applyRegionalSwap(d,point).doc,d);
  assert.deepEqual([...regionalSwapHits(d,point,true)],['m']);
  assert.equal(applyRegionalSwap(d,{...point,point:[150,150]}).doc,d);
});
test('invalid input rejects and selection tolerance is strict',()=>{
  const d=doc([line('m',58,'M')]);assert.equal(regionalSwapHits(d,point).size,0);
  assert.throws(()=>regionalSwapHits(d,{...point,radius:NaN}),/半径/);
  assert.throws(()=>regionalSwapHits(d,{...box,b:[Infinity,0]}),/坐标/);
});

test('selected swap commits atomically, retains the existing selection with persistence disabled and undoes once',()=>{
  const original=doc([line('selected-m',30,'M',-61),line('selected-v',40,'V',null),line('selected-a',50,'A'),line('other-m',60,'M',-90)]);
  const snapshot=structuredClone(original),selected=new Set(['selected-m','selected-v','selected-a']);
  const proposal=applySelectedFoldSwap(original,selected),prepared=prepareEditorCommit(original,proposal.doc);
  assert.equal(proposal.changed,2);
  assert.deepEqual(prepared.doc.segments.map(segment=>[segment.id,segment.assignment,segment.angle]),[
    ['selected-m','V',61],['selected-v','M',null],['selected-a','A',0],['other-m','M',-90],
  ]);
  assert.deepEqual(selectionAfterCommit(selected,prepared.descendants,undefined,false),selected);
  const history=historyReducer({past:[],present:original,future:[]},{type:'commit',doc:prepared.doc});
  assert.equal(history.past.length,1);assert.deepEqual(historyReducer(history,{type:'undo'}).present,original);
  assert.deepEqual(original,snapshot);assert.deepEqual([...selected],['selected-m','selected-v','selected-a']);
});

test('nonfold-only or stale selected identities never expand to a region or touch nearby folds',()=>{
  const original=doc([line('aux',49,'A'),line('fold',50,'M'),line('edge',51,'B'),line('flat',52,'F'),line('unknown',53,'U')]);
  for(const selected of [new Set(['aux','edge','flat','unknown']),new Set(['stale'])]){
    const result=applySelectedFoldSwap(original,selected);
    assert.equal(result.doc,original);assert.equal(result.changed,0);
  }
});
