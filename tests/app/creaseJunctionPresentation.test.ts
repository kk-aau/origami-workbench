import {test} from 'node:test';
import assert from 'node:assert/strict';
import {creaseJunctionPresentation,creaseJunctionPage,CREASE_JUNCTION_PAGE_SIZE} from '../../src/app/creaseJunctionPresentation';
import {nearestSnapPoint,type SnapPoint} from '../../src/app/snapPoints';

const point=(id:number,x:number,y:number):SnapPoint=>({id:String(id),point:[x,y],kind:'intersection',segmentIds:['a'+id,'b'+id]});
test('dense presentation is bounded by screen cells while every original point remains pickable',()=>{
 const points=Array.from({length:30000},(_,i)=>point(i,(i%100)*.01,Math.floor(i/100)*.01)),original=structuredClone(points);
 const shown=creaseJunctionPresentation(points,{x:0,y:0,w:100,h:100},{w:800,h:600},new Set());
 assert.ok(shown.length<100);assert.deepEqual(points,original);
 const hidden=points.find(p=>!shown.includes(p))!;assert.ok(hidden);assert.equal(nearestSnapPoint(points,hidden.point,1e-10),hidden);
 const zoomed=creaseJunctionPresentation(points,{x:hidden.point[0]-.001,y:hidden.point[1]-.001,w:.002,h:.002},{w:800,h:600},new Set());assert.ok(zoomed.includes(hidden));
});
test('focused and selected points are retained despite pixel collisions or being outside the viewport',()=>{
 const points=[point(0,1,1),point(1,1.001,1.001),point(2,200,200)],required=new Set(['1','2']);
 const shown=creaseJunctionPresentation(points,{x:0,y:0,w:100,h:100},{w:800,h:600},required);
 assert.ok(shown.includes(points[1]));assert.ok(shown.includes(points[2]));
});
test('keyboard pagination visits every identity once including the last partial page',()=>{
 const points=Array.from({length:CREASE_JUNCTION_PAGE_SIZE*3+7},(_,i)=>point(i,i,0)),all:SnapPoint[]=[];
 for(let i=0;i<creaseJunctionPage(points,0).pages;i++)all.push(...creaseJunctionPage(points,i).points);
 assert.deepEqual(all,points);assert.equal(creaseJunctionPage(points,999).page,3);assert.equal(creaseJunctionPage(points,-1).page,0);assert.deepEqual(creaseJunctionPage([],0),{page:0,pages:1,points:[]});
});
