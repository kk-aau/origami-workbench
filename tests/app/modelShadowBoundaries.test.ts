import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {FlatFoldResult,Point} from '../../src/core/types';
import {modelShadowBoundaries} from '../../src/app/modelShadowBoundaries';
import {foldedModelSVG} from '../../src/app/foldedModelSVG';
function model(polygons:Point[][]):FlatFoldResult{
 const vertices:Point[]=[],faces=polygons.map(p=>p.map(v=>vertices.push(v)-1));
 return {geometry:{status:'ready',message:'',vertices,faces},layers:{status:'solved',message:'',faceOrder:polygons.map((_,i)=>i),faceOrders:[[0,1,1]]},warnings:[]};
}
const rect=(x:number,y:number,w:number,h:number):Point[]=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
function ordered(polygons:Point[][]){
 const result=model(polygons);result.layers.faceOrders=[];
 for(let a=0;a<polygons.length;a++)for(let b=a+1;b<polygons.length;b++)result.layers.faceOrders.push([a,b,1]);
 return result;
}
const shadowLength=(result:ReturnType<typeof modelShadowBoundaries>)=>result.boundaries.reduce((sum,s)=>sum+Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1]),0);

test('three crossed layers split visible steps and remove the seam hidden by the highest stripe',()=>{
 const input=ordered([rect(0,0,100,100),rect(40,-10,100,120),rect(-10,40,120,20)]),before=structuredClone(input);
 const result=modelShadowBoundaries(input,'front');assert.equal(result.ambiguousEdges,0);
 const lowerSeam=result.boundaries.filter(s=>s.upperFace===1&&s.lowerFace===0);
 assert.equal(lowerSeam.length,2);
 assert.ok(lowerSeam.every(s=>Math.abs(s.a[0]-40)<1e-7&&Math.abs(s.b[0]-40)<1e-7&&(Math.max(s.a[1],s.b[1])<=40||Math.min(s.a[1],s.b[1])>=60)));
 assert.ok(Math.abs(shadowLength(result)-320)<1e-7);
 for(const angle of [22.5,90,179,270])assert.ok(Math.abs(shadowLength(modelShadowBoundaries(input,'front',angle))-320)<1e-6);
 assert.deepEqual(input,before);
});

test('three nested layers cast only adjacent visible steps, and back view hides both inner layers',()=>{
 const input=ordered([rect(0,0,100,100),rect(20,20,60,60),rect(35,35,30,30)]),front=modelShadowBoundaries(input,'front');
 assert.equal(front.boundaries.length,8);assert.equal(front.boundaries.filter(s=>s.lowerFace===0&&s.upperFace===1).length,4);
 assert.equal(front.boundaries.filter(s=>s.lowerFace===1&&s.upperFace===2).length,4);
 assert.equal(shadowLength(front),360);assert.equal(modelShadowBoundaries(input,'back',22.5).boundaries.length,0);
});

test('paper ring has no hole-edge shadows and a local overlay does not cast into the hole',()=>{
 // Four adjacent, nonoverlapping faces form a ring with a 40x40 hole.
 const ring=[rect(0,0,100,30),rect(0,70,100,30),rect(0,30,30,40),rect(70,30,30,40)];
 assert.equal(modelShadowBoundaries(ordered(ring),'front').boundaries.length,0);
 const input=ordered([...ring,rect(20,20,60,20)]),result=modelShadowBoundaries(input,'front');
 assert.ok(result.boundaries.length>0);
 for(const s of result.boundaries){
  const middle=[(s.a[0]+s.b[0])/2+s.inward[0]*1e-3,(s.a[1]+s.b[1])/2+s.inward[1]*1e-3];
  assert.ok(!(middle[0]>30&&middle[0]<70&&middle[1]>30&&middle[1]<70),'shadow must not point into empty hole');
  assert.equal(s.upperFace,4);
 }
 assert.ok(!result.boundaries.some(s=>s.a[1]===40&&s.b[1]===40&&Math.min(s.a[0],s.b[0])>=30&&Math.max(s.a[0],s.b[0])<=70));
});
test('empty geometry and disjoint paper islands have no shadow boundaries',()=>{
 assert.equal(modelShadowBoundaries(model([]),'front').boundaries.length,0);
 assert.equal(modelShadowBoundaries(model([rect(0,0,10,10),rect(20,20,10,10)]),'front').boundaries.length,0);
});
test('overlapping rectangles cast only on the lower internal step, never outside',()=>{
 const input=model([rect(0,0,100,100),rect(50,0,100,100)]),before=structuredClone(input),out=modelShadowBoundaries(input,'front');
 assert.equal(out.status,'ready');assert.equal(out.boundaries.length,1);
 const s=out.boundaries[0];assert.equal(s.a[0],50);assert.equal(s.b[0],50);assert.equal(s.upperFace,1);assert.equal(s.lowerFace,0);assert.ok(s.inward[0]<0);
 assert.deepEqual(input,before);
});
test('nested disconnected face produces four layer-step edges',()=>{
 const result=modelShadowBoundaries(model([rect(0,0,100,100),rect(25,25,50,50)]),'front');
 assert.equal(result.boundaries.length,4);assert.equal(result.ambiguousEdges,0);
 assert.ok(result.boundaries.every(s=>s.upperFace===1&&s.lowerFace===0));
});
test('back projection reverses visible layers and fully hidden nested face casts no shadow',()=>{
 const result=modelShadowBoundaries(model([rect(0,0,100,100),rect(25,25,50,50)]),'back');
 assert.equal(result.boundaries.length,0);
 const partial=modelShadowBoundaries(model([rect(0,0,100,100),rect(50,0,100,100)]),'back',22.5);
 assert.equal(partial.boundaries.length,1);assert.equal(partial.boundaries[0].upperFace,0);assert.equal(partial.boundaries[0].lowerFace,1);
});
test('unconfirmed order, unknown pair and coplanar adjacent faces do not invent shadows',()=>{
 const input=model([rect(0,0,50,100),rect(50,0,50,100)]);
 assert.equal(modelShadowBoundaries(input,'front').boundaries.length,0);
 input.geometry.vertices[4][0]=25;input.geometry.vertices[7][0]=25;input.layers.faceOrders=[];
 assert.equal(modelShadowBoundaries(input,'front').boundaries.length,0);
 input.layers.status='unknown';assert.equal(modelShadowBoundaries(input,'front').status,'unconfirmed');
});
test('coincident polygons have no visible step; thin overlap is sampled within its clearance',()=>{
 assert.equal(modelShadowBoundaries(model([rect(0,0,100,100),rect(0,0,100,100)]),'front').boundaries.length,0);
 const result=modelShadowBoundaries(model([rect(0,0,100,100),rect(99.999,0,100,100)]),'front');
 assert.equal(result.boundaries.length,1);assert.ok(Math.abs(result.boundaries[0].a[0]-99.999)<1e-7);
});

test('model SVG exports clipped gradients between the receiving and higher faces in either rotated view',()=>{
 const input=model([rect(0,0,100,100),rect(50,0,100,100)]),before=structuredClone(input);
 for(const side of ['front','back'] as const){
  const shadows=modelShadowBoundaries(input,side,22.5),edge=shadows.boundaries[0];
  const svg=foldedModelSVG(input,{name:'阴影导出',side,rotation:22.5,shadows});
  assert.match(svg,/<linearGradient/);assert.match(svg,/<clipPath/);assert.match(svg,/clip-path="url\(#model-shadow-0-clip\)"/);
  assert.ok(svg.indexOf(`data-face-id="${edge.lowerFace}"`)<svg.indexOf('data-shadow-upper='));
  assert.ok(svg.indexOf('data-shadow-upper=')<svg.indexOf(`data-face-id="${edge.upperFace}"`));
  assert.ok(svg.includes(`x1="${edge.a[0]}" y1="${edge.a[1]}"`));
  assert.ok(!foldedModelSVG(input,{name:'X光',side,rotation:22.5,xray:true,shadows}).includes('linearGradient'));
 }
 assert.deepEqual(input,before);
 assert.ok(!foldedModelSVG(input,{name:'旧导出',side:'front'}).includes('linearGradient'));
});

test('model SVG refuses invalid shadow data and suppresses shadows for unknown layers',()=>{
 const input=model([rect(0,0,100,100),rect(50,0,100,100)]),shadows=modelShadowBoundaries(input,'front');
 for(const edit of [(s:any)=>s.boundaries[0].a[0]='" onload="evil',(s:any)=>s.boundaries[0].lowerFace=99,(s:any)=>s.boundaries[0].inward=[0,0],(s:any)=>s.boundaries[0].upperFace=0,(s:any)=>s.status='unconfirmed']){
  const invalid=structuredClone(shadows);edit(invalid);assert.throws(()=>foldedModelSVG(input,{name:'无效',side:'front',shadows:invalid}),/阴影/);
 }
 input.layers.status='unknown';assert.ok(!foldedModelSVG(input,{name:'未知',side:'front',shadows}).includes('linearGradient'));
});
