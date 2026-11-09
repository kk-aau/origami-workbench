import test from 'node:test';
import assert from 'node:assert/strict';
import {angleOffsets,angleFan,angleRayCutoff,snapAnglePoint,type AngleSystem} from '../../src/app/angleSystem';
import type {Point,Segment} from '../../src/core/types';
const system:AngleSystem={kind:'divided',divider:4};
const segment=(a:Point,b:Point):Segment=>({id:'target',a,b,assignment:'B',angle:0});
function close(a:Point,b:Point){assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-7,`${a} != ${b}`);}
test('divided systems span a full turn; original defaults have 16 directions',()=>{
 assert.deepEqual(angleOffsets(system),[0,45,90,135,180,225,270,315]);assert.equal(angleOffsets({kind:'divided',divider:8}).length,16);
});
test('custom angles reflect independently, optionally include baseline, and deduplicate',()=>{
 assert.deepEqual(angleOffsets({kind:'custom',angles:[40,60,80]}),[40,60,80,320,300,280]);
 assert.deepEqual(angleOffsets({kind:'custom',angles:[0,180,360]},true),[0,180]);
});
test('fan starts at second point and points toward first; input remains unchanged',()=>{
 const first:Point=[20,10],origin:Point=[10,10],before=structuredClone([first,origin]);const fan=angleFan(first,origin,system);
 close(fan[0].end,first);close(fan[2].end,[10,20]);assert.ok(fan.every(f=>Math.abs(Math.hypot(...f.direction)-1)<1e-9));assert.deepEqual([first,origin],before);
});
test('custom fan rotates relative to baseline, with explicit baseline candidate',()=>{
 const fan=angleFan([0,10],[0,0],{kind:'custom',angles:[30,60,90]});assert.equal(fan.length,7);close(fan[0].end,[0,10]);close(fan[3].end,[-10,0]);
});
test('dragging uses orthogonal projection, not radial distance',()=>{
 close(snapAnglePoint([0,0],[100,20],system),[100,0]);close(snapAnglePoint([0,0],[100,80],system),[90,90]);close(snapAnglePoint([5,8],[-95,-72],system),[-85,-82]);
});
test('custom dragging does not silently introduce horizontal baseline',()=>{
 close(snapAnglePoint([0,0],[100,0],{kind:'custom',angles:[60,90,120]}),[25,25*Math.sqrt(3)]);
});
test('near finite line supplies exact intersection; parallel and extension-only targets do not',()=>{
 close(snapAnglePoint([0,0],[99,80],system,{radius:20,segments:[segment([100,0],[100,200])]}),[100,100]);
 close(snapAnglePoint([0,0],[99,80],system,{radius:20,segments:[segment([100,70],[100,90])]}),[89.5,89.5]);
 close(snapAnglePoint([0,0],[100,2],system,{radius:5,segments:[segment([0,2],[200,2])]}),[100,0]);
});
test('nearby vertex snap keeps angle and rejects off-angle, reverse and origin points',()=>{
 close(snapAnglePoint([0,0],[100,80],system,{radius:5,vertices:[[92,92]]}),[92,92]);
 close(snapAnglePoint([0,0],[100,80],system,{radius:5,vertices:[[90,91]]}),[90,90]);
 close(snapAnglePoint([0,0],[1,0],system,{radius:5,vertices:[[-1,0]]}),[1,0]);
 close(snapAnglePoint([0,0],[1,0],system,{radius:5,vertices:[[0,0]]}),[1,0]);
});

test('an almost-parallel finite reference cannot jump a constrained endpoint far away',()=>{
 const source=segment([0,-10],[2000,10]);
 close(snapAnglePoint([0,0],[50,-9.5],{kind:'divided',divider:2},{radius:10,segments:[source]}),[50,0]);
});

test('a closer parallel reference cannot mask another nearby valid cutoff',()=>{
 close(snapAnglePoint([0,0],[99,1],{kind:'divided',divider:2},{radius:3,segments:[segment([0,1],[200,1]),segment([100,-10],[100,10])]}),[100,0]);
});

test('an incompatible nearest vertex cannot block an on-ray vertex or chain beyond the original tolerance',()=>{
 const horizontal={kind:'divided',divider:2} as const;
 close(snapAnglePoint([0,0],[40,.2],horizontal,{radius:2,vertices:[[40,.1],[41,0]]}),[41,0]);
 close(snapAnglePoint([0,0],[40,.2],horizontal,{radius:1.5,segments:[segment([41,-2],[41,2])],vertices:[[42,0]]}),[41,0]);
});
test('ray cutoff accepts only a finite forward nonzero intersection',()=>{
 close(angleRayCutoff([0,0],[1,0],segment([10,-10],[10,10])),[10,0]);
 for(const s of [segment([-10,-10],[-10,10]),segment([10,1],[10,10]),segment([0,0],[0,10]),segment([1,0],[10,0])])assert.throws(()=>angleRayCutoff([0,0],[1,0],s));
});
test('invalid settings, degenerate baselines and coordinate overflow reject',()=>{
 for(const divider of [0,1,2.5,361,NaN,Infinity])assert.throws(()=>angleOffsets({kind:'divided',divider}));
 for(const a of [-1,361,NaN,Infinity])assert.throws(()=>angleOffsets({kind:'custom',angles:[a,60,80]}));
 assert.throws(()=>angleFan([0,0],[0,0],system));assert.throws(()=>angleFan([999999,0],[999999,100],system));
 assert.throws(()=>snapAnglePoint([NaN,0],[1,1],system));assert.throws(()=>snapAnglePoint([0,0],[1,1],system,{radius:-1}));close(snapAnglePoint([1,1],[1,1],system),[1,1]);
});
