import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backgroundCropPlan} from '../../src/app/backgroundCrop';
import {setBackgroundFollow} from '../../src/app/backgroundAnchor';
import type {BackgroundImage} from '../../src/core/backgroundData.mjs';
const bg:BackgroundImage={name:'source',dataUrl:'unused by plan',width:200,height:100,opacity:.4,visible:true,placement:{origin:[0,0],axis:[1,0]}};
test('crop maps current world position to requested screen pixels and keeps uniform pixel size',()=>{
 const plan=backgroundCropPlan(bg,{x:10,y:20,width:80,height:60},{x:-20,y:-10,units:.5});
 assert.deepEqual(plan.matrix,[2,0,-0,2,30,0]);assert.deepEqual(plan.placement,{origin:[-15,0],axis:[.5,0]});assert.equal(plan.viewport,undefined);
 assert.deepEqual([plan.width,plan.height],[80,60]);assert.deepEqual(plan.clip,{x:0,y:0,width:80,height:60});
});
test('fractional frame expands pixel envelope and clips only the exact requested interior',()=>{
 const p=backgroundCropPlan(bg,{x:-.5,y:1.2,width:10.7,height:20.1},{x:0,y:0,units:1});
 assert.deepEqual([p.width,p.height],[12,21]);assert.deepEqual(p.placement,{origin:[-1,1],axis:[1,0]});assert.ok(Math.abs(p.clip.y-.2)<1e-10);assert.equal(p.clip.x,.5);
});
test('screen fixed source uses reference camera and cropped result remains fixed at current camera',()=>{
 const fixed=setBackgroundFollow(bg,{x:0,y:0,units:1},false),view={x:300,y:-100,units:2};
 const p=backgroundCropPlan(fixed,{x:10,y:20,width:30,height:40},view);
 assert.deepEqual(p.matrix,[1,0,-0,1,-10,-20]);assert.deepEqual(p.viewport,view);assert.deepEqual(p.placement,{origin:[320,-60],axis:[2,0]});
});
test('rotated images preserve rotation inside raster rather than changing crop rectangle',()=>{
 const rotated={...bg,placement:{origin:[100,0] as [number,number],axis:[0,1] as [number,number]}},copy=structuredClone(rotated);
 assert.deepEqual(backgroundCropPlan(rotated,{x:0,y:0,width:100,height:200},{x:0,y:0,units:1}).matrix,[0,1,-1,0,100,0]);assert.deepEqual(rotated,copy);
});
test('hidden, zero-opacity, huge, zero-area and out-of-range crops reject before allocation',()=>{
 const view={x:0,y:0,units:1},frame={x:0,y:0,width:100,height:100};
 assert.throws(()=>backgroundCropPlan({...bg,visible:false},frame,view),/显示/);assert.throws(()=>backgroundCropPlan({...bg,opacity:0},frame,view),/不透明度/);
 assert.throws(()=>backgroundCropPlan(bg,{...frame,width:17000},view),/过大/);assert.throws(()=>backgroundCropPlan(bg,{...frame,width:7000,height:7000},view),/过大/);
 assert.throws(()=>backgroundCropPlan(bg,{...frame,width:0},view),/有效/);assert.throws(()=>backgroundCropPlan(bg,{...frame,x:1e6},view),/超出/);
});
