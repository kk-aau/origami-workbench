import {test} from 'node:test';
import assert from 'node:assert/strict';
import {beginFrameDrag,updateFrameDrag,finishFrameDrag,frameBetween,frameCorners,frameWorldBounds} from '../../src/app/operationFrame';
import type {Point} from '../../src/core/types';
const frame={x:20,y:30,width:100,height:80};
test('create normalizes all drag directions, snaps new anchor, and preserves arguments',()=>{
 for(const [a,b] of [[[20,30],[120,110]],[[120,110],[20,30]],[[20,110],[120,30]],[[120,30],[20,110]]] as [Point,Point][]){assert.deepEqual(frameBetween(a,b),frame);}
 const raw:Point=[19,29],snap:Point=[20,30],drag=beginFrameDrag(null,raw,8,snap);snap[0]=99;
 assert.deepEqual(finishFrameDrag(drag,[120,110]),frame);assert.deepEqual(raw,[19,29]);
 assert.deepEqual(beginFrameDrag(frame,[200,200],8,[199,199]),{kind:'create',anchor:[199,199]});
});
test('corner hit takes priority, fixes opposite corner and handles crossing it',()=>{
 const corners=frameCorners(frame);
 for(let i=0;i<4;i++){
   const drag=beginFrameDrag(frame,corners[i],8);assert.equal(drag.kind,'corner');
   const opposite=corners[(i+2)%4];assert.deepEqual(updateFrameDrag(drag,[0,0]),frameBetween(opposite,[0,0]));
   assert.deepEqual(updateFrameDrag(drag,[200,200]),frameBetween(opposite,[200,200]));
 }
});
test('all four side drags change only selected axis, including crossover',()=>{
 const cases:[Point,Point,typeof frame][]=[[[20,70],[150,999],{x:120,y:30,width:30,height:80}],[[120,70],[0,999],{x:0,y:30,width:20,height:80}],[[70,30],[999,150],{x:20,y:110,width:100,height:40}],[[70,110],[999,0],{x:20,y:0,width:100,height:30}]];
 for(const [press,end,expected] of cases){const drag=beginFrameDrag(frame,press,8);assert.equal(drag.kind,'side');assert.deepEqual(updateFrameDrag(drag,end),expected);}
});
test('interior drag uses captured original frame and press, without accumulating error',()=>{
 const source={...frame},drag=beginFrameDrag(source,[70,70],8);source.x=500;
 assert.equal(drag.kind,'move');assert.deepEqual(updateFrameDrag(drag,[90,100]),{x:40,y:60,width:100,height:80});
 assert.deepEqual(updateFrameDrag(drag,[70,70]),frame);assert.deepEqual(frame,{x:20,y:30,width:100,height:80});
});
test('subpixel area deactivates; one pixel and reverse direction stay valid',()=>{
 const drag=beginFrameDrag(null,[0,0],8);
 assert.equal(finishFrameDrag(drag,[20,0]),null);assert.equal(finishFrameDrag(drag,[.5,.5]),null);
 assert.deepEqual(finishFrameDrag(drag,[-1,-1]),{x:-1,y:-1,width:1,height:1});
});
test('screen frame exports against current camera without changing the frame',()=>{
 const before=structuredClone(frame);
 assert.deepEqual(frameWorldBounds(frame,{x:-100,y:-50,units:.5}),{x:-90,y:-35,width:50,height:40});
 assert.deepEqual(frameWorldBounds(frame,{x:100,y:50,units:2}),{x:140,y:110,width:200,height:160});
 assert.deepEqual(frame,before);
});
test('invalid geometry, hit radius, view and export overflow are explicit errors',()=>{
 assert.throws(()=>beginFrameDrag(null,[NaN,0],8),/坐标/);assert.throws(()=>beginFrameDrag(frame,[0,0],-1),/命中/);
 assert.throws(()=>frameCorners({...frame,width:-1}),/尺寸/);assert.throws(()=>frameBetween([0,0],[Infinity,0]),/坐标/);
 assert.throws(()=>frameWorldBounds({...frame,width:0},{x:0,y:0,units:1}),/有效/);
 assert.throws(()=>frameWorldBounds(frame,{x:0,y:0,units:0}),/比例/);
 assert.throws(()=>frameWorldBounds(frame,{x:1e6,y:0,units:1}),/超出/);
});
