import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {BackgroundImage} from '../../src/core/backgroundData.mjs';
import {backgroundInView,backgroundViewTransform,setBackgroundFollow,registeredScreenBackground,type BackgroundView} from '../../src/app/backgroundAnchor';
import {backgroundToWorld,registerBackground} from '../../src/app/backgroundPlacement';
import type {Point} from '../../src/core/types';
const image:BackgroundImage={name:'ref',dataUrl:'unused in coordinate tests',width:200,height:100,visible:true,opacity:.5,placement:{origin:[20,40],axis:[.6,.8]}};
const before:BackgroundView={x:-50,y:20,units:.5},after:BackgroundView={x:100,y:-70,units:2};
const screen=(p:Point,v:BackgroundView):Point=>[(p[0]-v.x)/v.units,(p[1]-v.y)/v.units];
const near=(a:Point,b:Point)=>assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-7,JSON.stringify([a,b]));
test('unlocking preserves every displayed feature at the current camera and original bytes',()=>{
 const copy=structuredClone(image),fixed=setBackgroundFollow(image,before,false);
 assert.notEqual(fixed,image);assert.deepEqual(fixed.viewport,before);assert.notEqual(fixed.viewport,before);
 for(const p of [[0,0],[200,100],[30,45]] as Point[])near(backgroundToWorld(backgroundInView(fixed,before),p),backgroundToWorld(image.placement,p));
 assert.equal(fixed.dataUrl,image.dataUrl);assert.deepEqual(image,copy);
});
test('screen-fixed image retains CSS pixel positions and size across pan and zoom',()=>{
 const fixed=setBackgroundFollow(image,before,false),placement=backgroundInView(fixed,after);
 for(const p of [[0,0],[200,100],[30,45]] as Point[])near(screen(backgroundToWorld(placement,p),after),screen(backgroundToWorld(image.placement,p),before));
 const outer=backgroundViewTransform(before,after),source=backgroundToWorld(image.placement,[30,45]);
 near([outer.x+source[0]*outer.scale,outer.y+source[1]*outer.scale],backgroundToWorld(placement,[30,45]));
});
test('relocking after view changes does not jump and then follows world coordinates',()=>{
 const fixed=setBackgroundFollow(image,before,false),locked=setBackgroundFollow(fixed,after,true);
 assert.equal(locked.viewport,undefined);assert.deepEqual(locked.placement,backgroundInView(fixed,after));
 assert.equal(backgroundInView(locked,before),locked.placement);assert.equal(setBackgroundFollow(locked,before,true),locked);
 assert.equal(setBackgroundFollow(fixed,after,false),fixed);
});
test('registration uses currently visible world features and leaves image unlocked',()=>{
 const fixed=setBackgroundFollow(image,before,false),visible=backgroundInView(fixed,after);
 const a=backgroundToWorld(visible,[20,10]),b=backgroundToWorld(visible,[120,10]),c:Point=[0,0],d:Point=[0,100];
 const placement=registerBackground(visible,image,a,b,c,d),result=registeredScreenBackground(fixed,placement,after);
 near(backgroundToWorld(backgroundInView(result,after),[20,10]),c);near(backgroundToWorld(backgroundInView(result,after),[120,10]),d);
 assert.deepEqual(result.viewport,after);assert.notEqual(result.placement,placement);assert.notEqual(result.placement.origin,placement.origin);
});
test('bad camera and out-of-range relock fail without changing stored image',()=>{
 const fixed=setBackgroundFollow(image,before,false),copy=structuredClone(fixed);
 for(const v of [{x:0,y:0,units:0},{x:NaN,y:0,units:1},{x:0,y:0,units:Infinity},{x:0,y:0,units:-1}])assert.throws(()=>backgroundInView(fixed,v),/参照/);
 assert.throws(()=>setBackgroundFollow(fixed,{x:999999,y:0,units:100},true),/超出|无效/);assert.deepEqual(fixed,copy);
});
test('temporary far-away camera can render fixed background but cannot be persisted',()=>{
 const current={x:2e6,y:-3e6,units:.5};
 assert.deepEqual(backgroundViewTransform(before,current),{scale:1,x:2000050,y:-3000020});
 assert.throws(()=>setBackgroundFollow(image,current,false),/参照/);
});
