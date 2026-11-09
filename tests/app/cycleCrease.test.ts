import test from 'node:test';
import assert from 'node:assert/strict';
import {cycleCrease} from '../../src/app/cycleCrease';
import {type Doc,type Assignment} from '../../src/core/types';
const doc=(assignment:Assignment,angle:number|null):Doc=>({name:'循环',paper:{width:200,height:200},segments:[{id:'s',a:[0,0],b:[100,0],assignment,angle},{id:'other',a:[0,100],b:[100,100],assignment:'M',angle:-70}]});
test('boundary cycles B M V B without modifying the original or other segments',()=>{
 const d=doc('B',0),before=structuredClone(d);let r=d;
 for(const [type,angle] of [['M',-180],['V',180],['B',0]]){r=cycleCrease(r,'s');assert.equal(r.segments[0].assignment,type);assert.equal(r.segments[0].angle,angle);assert.equal(r.segments[1],d.segments[1]);}
 assert.deepEqual(d,before);
});
test('M to V preserves explicit zero, custom magnitude and unknown angle',()=>{
 for(const angle of [-90,0,null])assert.equal(cycleCrease(doc('M',angle),'s').segments[0].angle,angle===null?null:Math.abs(angle));
});
test('V to boundary resets fold angle to zero',()=>{for(const a of [90,null,0])assert.equal(cycleCrease(doc('V',a),'s').segments[0].angle,0);});
test('boundary protection prevents B mutation but does not prevent MV editing',()=>{
 assert.throws(()=>cycleCrease(doc('B',0),'s',true),/边界保护/);assert.equal(cycleCrease(doc('M',-90),'s',true).segments[0].assignment,'V');
});
test('A U F and stale IDs are rejected without any mutation',()=>{
 for(const a of ['A','U','F'] as Assignment[]){const d=doc(a,a==='U'?null:0),before=structuredClone(d);assert.throws(()=>cycleCrease(d,'s'),/循环仅适用/);assert.deepEqual(d,before);}
 assert.throws(()=>cycleCrease(doc('M',-180),'absent'),/线段已变化/);
});
