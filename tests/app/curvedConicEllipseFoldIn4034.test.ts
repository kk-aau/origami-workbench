import test from 'node:test';
import assert from 'node:assert/strict';
import {CONIC_ELLIPSE_FOLD_IN4034,conicEllipsePlanarAt,sampleConicEllipseFoldIn4034}
  from '../../src/app/curvedConicEllipseFoldIn4034';

const near=(actual:number,expected:number,tol=1e-11)=>
  assert.ok(Math.abs(actual-expected)<tol,`${actual} ≠ ${expected}`);
const dot=(a:readonly number[],b:readonly number[])=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const distance=(a:readonly number[],b:readonly number[])=>
  Math.hypot(...a.map((v,i)=>v-b[i]));

test('In[4034] retains the source focus/cross inputs, final overwritten interval and Frenet initial frame',()=>{
  const s=CONIC_ELLIPSE_FOLD_IN4034;
  assert.deepEqual([s.focusLeft,s.focusRight,s.crossLeft,s.crossRight],[-1,-2,-.5,.5]);
  assert.deepEqual([s.savedOpticalStartDeg,s.savedOpticalEndDeg,
    s.savedFoldStartDeg,s.savedFoldEndDeg,s.initialFoldAngleDeg],[-60,60,0,120,-60]);
  assert.deepEqual(s.initialPosition,[0,0,0]);
  assert.deepEqual(s.initialTangent,[0,1,0]);
  assert.deepEqual(s.initialBinormal,[0,0,1]);
  assert.throws(()=>conicEllipsePlanarAt(-.01));
  assert.throws(()=>conicEllipsePlanarAt(2*Math.PI/3+.01));
});

test('the source ellipse and its two normalized optical rulings meet at the crease',()=>{
  for(const u of [0,.25,1,2*Math.PI/3]){
    const p=conicEllipsePlanarAt(u),[x,y]=p.crease;
    near((x+1.5)**2/2.25+y*y/2,1);
    const cross=(a:readonly number[],b:readonly number[])=>a[0]*b[1]-a[1]*b[0];
    near(cross([p.crossLeft[0]-x,p.crossLeft[1]-y],p.left),0);
    near(cross([p.crossRight[0]-x,p.crossRight[1]-y],p.right),0);
    near(dot(p.left,p.left),1);near(dot(p.right,p.right),1);
    near(dot(p.tangent,p.left),p.along);near(dot(p.tangent,p.right),p.along);
    near(p.speed*p.transverse,4/(3+Math.cos(u)));
  }
});

test('the saved -60° fold has constant angle and convergent orthonormal 3D recovery',()=>{
  const sample=sampleConicEllipseFoldIn4034(),d=sample.diagnostics;
  assert.equal(sample.frames.length,97);
  for(const f of sample.frames)near(f.foldAngleRad,-Math.PI/3);
  const start=sample.frames[0],end=sample.frames.at(-1)!;
  assert.deepEqual(start.flatCrease,[0,0]);
  assert.deepEqual(start.foldedCrease,[0,0,0]);
  near(start.foldedLeftRuling[0],-Math.sqrt(3)/2);
  near(start.foldedLeftRuling[2],-.5);
  near(start.foldedRightRuling[0],Math.sqrt(3)/2);
  near(start.foldedRightRuling[2],-.5);
  near(end.flatCrease[0],-1.8);near(end.flatCrease[1],4*Math.sin(2*Math.PI/3)/2.5);
  assert.ok(d.sourceCotDifferenceMaximum<1e-12);
  assert.ok(d.frameOrthogonalityMaximum<1e-11);
  assert.ok(d.integrationConvergenceMaximum<1e-11);
  assert.ok(d.maxMetricIdentityResidual<1e-11);
  near(d.leftJacobianLowerBound,.5);near(d.rightJacobianMagnitudeLowerBound,1);
  assert.equal(sample.exactStraightCreaseFOLD,false);
  assert.equal(sample.sampledMeshExactIsometry,false);
  assert.equal(sample.machineReadableWolframOut,false);
});

test('independent finite-difference first fundamental forms match on both sampled surfaces',()=>{
  const sample=sampleConicEllipseFoldIn4034(),h=2*Math.PI/3/96;
  for(const i of [8,24,48,72,88])for(const v of [.1,.3,.5])for(const side of ['Left','Right'] as const){
    const before=sample.frames[i-1],current=sample.frames[i],after=sample.frames[i+1];
    const suffix=side==='Left'?'Left':'Right';
    const flatR= current[`flat${suffix}Ruling`];
    const foldedR=current[`folded${suffix}Ruling`];
    const flatU=flatR.map((_,j)=>((after.flatCrease[j]+v*after[`flat${suffix}Ruling`][j])-
      (before.flatCrease[j]+v*before[`flat${suffix}Ruling`][j]))/(2*h));
    const foldU=foldedR.map((_,j)=>((after.foldedCrease[j]+v*after[`folded${suffix}Ruling`][j])-
      (before.foldedCrease[j]+v*before[`folded${suffix}Ruling`][j]))/(2*h));
    near(dot(flatU,flatU),dot(foldU,foldU),.002);
    near(dot(flatU,flatR),dot(foldU,foldedR),.002);
    near(dot(flatR,flatR),dot(foldedR,foldedR),1e-10);
  }
  assert.ok(distance(sample.frames[0].foldedCrease,sample.frames.at(-1)!.foldedCrease)>1);
});
