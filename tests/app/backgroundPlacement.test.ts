import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backgroundToWorld,worldToBackground,backgroundCorners,fitBackground,registerBackground,backgroundMatrix,type BackgroundPlacement} from '../../src/app/backgroundPlacement';
import type {Point} from '../../src/core/types';
const near=(a:Point,b:Point)=>assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-7,JSON.stringify([a,b]));
const size={width:200,height:100},identity:BackgroundPlacement={origin:[0,0],axis:[1,0]};
test('initial fit preserves aspect ratio and centers image without changing pixels',()=>{
  const p=fitBackground(size,{x:-100,y:-100,width:200,height:200});
  assert.deepEqual(p,{origin:[-100,-50],axis:[1,0]});
  assert.deepEqual(backgroundCorners(p,size),[[-100,-50],[100,-50],[100,50],[-100,50]]);
});
test('four-point registration maps A to C and B to D with rotation and uniform scale',()=>{
  const next=registerBackground(identity,size,[20,10],[120,10],[50,50],[50,250]);
  near(backgroundToWorld(next,[20,10]),[50,50]);near(backgroundToWorld(next,[120,10]),[50,250]);
  near(backgroundToWorld(next,[20,60]),[-50,50]);
  assert.deepEqual(next.axis,[0,2]);
  const [a,b,c,d]=backgroundMatrix(next);assert.ok(a*d-b*c>0);assert.equal(Math.hypot(a,b),Math.hypot(c,d));
});
test('repeated registration composes with current placement, not raw pixels',()=>{
  const old:BackgroundPlacement={origin:[30,-40],axis:[0,2]},before=JSON.stringify(old);
  const a=backgroundToWorld(old,[20,10]),b=backgroundToWorld(old,[120,10]);
  const next=registerBackground(old,size,a,b,[-50,20],[50,20]);
  near(backgroundToWorld(next,[20,10]),[-50,20]);near(backgroundToWorld(next,[120,10]),[50,20]);
  near(next.axis,[1,0]);assert.equal(JSON.stringify(old),before);
});
test('inverse coordinate mapping and SVG matrix agree on rotated placement',()=>{
  const p:BackgroundPlacement={origin:[-30,70],axis:[.6,.8]};
  for(const pixel of [[0,0],[200,100],[13.4,78.2]] as Point[]){
    const world=backgroundToWorld(p,pixel);near(worldToBackground(p,world),pixel);
    const [a,b,c,d,e,f]=backgroundMatrix(p);near([a*pixel[0]+c*pixel[1]+e,b*pixel[0]+d*pixel[1]+f],world);
  }
});
test('degenerate anchors, invalid sizes, overflow and zero scale reject atomically',()=>{
  const before=JSON.stringify(identity);
  assert.throws(()=>registerBackground(identity,size,[0,0],[0,0],[0,0],[10,10]),/重合/);
  assert.throws(()=>registerBackground(identity,size,[0,0],[10,10],[0,0],[0,0]),/重合/);
  assert.throws(()=>registerBackground(identity,size,[0,0],[1,0],[0,0],[1e6,0]),/超出/);
  assert.throws(()=>backgroundCorners(identity,{width:0,height:10}));
  assert.throws(()=>backgroundCorners(identity,{width:10.5,height:10}));
  assert.throws(()=>backgroundMatrix({origin:[0,0],axis:[0,0]}));
  assert.throws(()=>backgroundToWorld(identity,[NaN,0]));assert.equal(JSON.stringify(identity),before);
});
