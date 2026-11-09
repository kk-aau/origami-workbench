import {test} from 'node:test';
import assert from 'node:assert/strict';
import {advanceCrease} from '../../src/app/advanceCrease';
import type {Doc,Assignment} from '../../src/core/types';
const fixture=(assignment:Assignment='B',angle:number|null=0):Doc=>({name:'对照',paper:{width:200,height:200},segments:[{id:'s',a:[0,0],b:[100,0],assignment,angle}]});
test('advance has unselected B -> selected B -> M -> V -> B stages',()=>{
 const doc=fixture(),original=structuredClone(doc),ids=new Set(['other']);let r=advanceCrease(doc,'s',ids);
 assert.equal(r.doc,doc);assert.deepEqual([...r.selected],['other','s']);assert.deepEqual([...ids],['other']);
 for(const [assignment,angle] of [['M',-180],['V',180],['B',0]]){r=advanceCrease(r.doc,'s',r.selected);assert.equal(r.doc.segments[0].assignment,assignment);assert.equal(r.doc.segments[0].angle,angle);assert.deepEqual([...r.selected],['other']);}
 assert.deepEqual(doc,original);
});
test('selected mountain and valley remain unchanged',()=>{for(const a of ['M','V'] as const){const d=fixture(a,a==='M'?-65:65);const r=advanceCrease(d,'s',new Set(['s']));assert.equal(r.doc,d);assert.ok(r.selected.has('s'));}});
test('advance preserves null, zero and mountain angle magnitudes',()=>{for(const angle of [null,0,-35]){const r=advanceCrease(fixture('M',angle),'s',new Set());assert.equal(r.doc.segments[0].angle,angle===null?null:Math.abs(angle));}});
test('protected boundary, stale IDs and unsupported types reject without mutation',()=>{
 const d=fixture();assert.throws(()=>advanceCrease(d,'s',new Set(),true),/边界保护/);assert.throws(()=>advanceCrease(d,'absent',new Set()),/已变化/);
 for(const a of ['A','U','F'] as const){const d=fixture(a,a==='U'?null:0),before=structuredClone(d);assert.throws(()=>advanceCrease(d,'s',new Set()),/仅处理/);assert.deepEqual(d,before);}
 assert.equal(advanceCrease(fixture('M',-30),'s',new Set(),true).doc.segments[0].assignment,'V');
});
