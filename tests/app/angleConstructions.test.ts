import test from 'node:test';
import assert from 'node:assert/strict';
import {constructionFan,convergenceFans,angleConvergence,angleProjection} from '../../src/app/angleConstructions';
import type {Point,Segment} from '../../src/core/types';
const system={kind:'divided' as const,divider:4};
const segment=(a:Point,b:Point):Segment=>({id:'cut',a,b,assignment:'B',angle:0});
function close(a:Point,b:Point){assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-7,`${a} != ${b}`);}
test('specialized fans exclude divided baseline and use original 10x/100x preview lengths',()=>{
 const f=constructionFan([0,0],[100,0],system,10);assert.equal(f.length,7);assert.deepEqual(f.map(c=>c.angle),[45,90,135,180,225,270,315]);close(f[0].end,[Math.sqrt(.5)*1000,Math.sqrt(.5)*1000]);
 const p=constructionFan([0,0],[100,0],system,100);assert.ok(Math.abs(Math.hypot(...p[0].end)-10000)<1e-8);
});
test('custom fans use six angles without adding baseline and never read beyond array',()=>{
 const fans=convergenceFans([0,0],[100,0],{kind:'custom',angles:[40,60,80]});assert.deepEqual(fans.map(f=>f.length),[6,6]);assert.deepEqual(fans[0].map(f=>f.angle),fans[1].map(f=>f.angle));assert.ok(fans.flat().every(f=>f.end.every(Number.isFinite)));
 assert.equal(constructionFan([0,0],[1,0],{kind:'custom',angles:[0,180,360]},10).length,2);
});
test('convergence returns two finite legs and preserves baseline and inputs',()=>{
 const a:Point=[0,0],b:Point=[100,0],before=structuredClone([a,b]);const r=angleConvergence(a,b,system,[50,50],2);close(r.point,[50,50]);close(r.legs[0].a,a);close(r.legs[1].a,b);assert.equal(r.legs.length,2);assert.deepEqual([a,b],before);
 const reverse=angleConvergence(b,a,system,[50,50],2);close(reverse.point,r.point);
});
test('rotated and custom convergence respect both independently chosen angles',()=>{
 close(angleConvergence([10,20],[10,120],system,[-40,70],2).point,[-40,70]);
 close(angleConvergence([0,0],[100,0],{kind:'custom',angles:[45,60,80]},[50,50],2).point,[50,50]);
});
test('convergence rejects missing candidates, parallel directions and degenerate input',()=>{
 assert.throws(()=>angleConvergence([0,0],[100,0],system,[50,1],2));assert.throws(()=>angleConvergence([0,0],[100,0],{kind:'custom',angles:[0,180,360]},[50,0],2),/平行/);
 assert.throws(()=>angleConvergence([0,0],[0,0],system,[50,50],2));assert.throws(()=>angleConvergence([0,0],[100,0],system,[50,50],-1));
});
test('projection starts at second point and selects endpoint without a fourth cutoff click',()=>{
 const r=angleProjection([100,0],[0,0],system,[80,84],5);close(r.point,[82,82]);assert.equal(r.candidate,0);assert.equal(r.snappedTo,undefined);
 close(angleProjection([100,10],[0,10],system,[80,94],5).point,[82,92]);
});
test('projection uses nearby crossing only when it meets original double-error criterion',()=>{
 const r=angleProjection([100,0],[0,0],system,[80,84],20,[segment([83,0],[83,200])]);close(r.point,[83,83]);assert.equal(r.snappedTo,'cut');
 const far=angleProjection([100,0],[0,0],system,[80,84],20,[segment([90,0],[90,200])]);close(far.point,[82,82]);assert.equal(far.snappedTo,undefined);
});
test('parallel and extension-only nearby targets cannot silently replace projection',()=>{
 for(const target of [segment([83,90],[83,100]),segment([0,2],[100,102])]){const r=angleProjection([100,0],[0,0],system,[80,84],20,[target]);close(r.point,[82,82]);assert.equal(r.snappedTo,undefined);}
});
test('projection rejects blank locations, origin, invalid coordinates and wrong preview range',()=>{
 for(const p of [[80,1],[0,0],[1000001,0],[NaN,0]] as Point[])assert.throws(()=>angleProjection([100,0],[0,0],system,p,2));
 assert.throws(()=>angleProjection([1,0],[0,0],system,[200,200],2));
 assert.throws(()=>constructionFan([0,0],[100,0],{kind:'divided',divider:0},10));
});
