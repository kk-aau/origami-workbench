import test from 'node:test';
import assert from 'node:assert/strict';
import {learningMaskRegions} from '../../src/app/learningMaskRegions';
test('click shields leave the union of overlapping target and teaching card holes open',()=>{
 const holes=[{x:10,y:10,width:40,height:40},{x:30,y:30,width:50,height:50}],blocks=learningMaskRegions(100,100,holes);
 const contains=(b:{x:number;y:number;width:number;height:number},x:number,y:number)=>x>b.x&&x<b.x+b.width&&y>b.y&&y<b.y+b.height;
 for(let x=.5;x<100;x++)for(let y=.5;y<100;y++)assert.equal(blocks.some(b=>contains(b,x,y)),!holes.some(b=>contains(b,x,y)));
});
test('an exposed canvas is entirely unblocked; out-of-viewport and malformed holes do not create gaps',()=>{
 const canvas={x:20,y:30,width:60,height:50},blocks=learningMaskRegions(100,100,[canvas,{x:-30,y:-30,width:40,height:40},{x:NaN,y:0,width:100,height:100}]);
 const area=blocks.reduce((sum,b)=>sum+b.width*b.height,0);assert.equal(area,10000-3000-100);
 for(const b of blocks)assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=100&&b.y+b.height<=100);
});
