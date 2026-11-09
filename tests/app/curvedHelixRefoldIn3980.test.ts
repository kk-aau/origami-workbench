import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HELIX_REFOLD_IN3980,helixRefoldFrameAt,planarPhaseAt,refoldStateAt,
  sampleHelixRefoldIn3980,savedFlatCreaseAt,savedFoldAngleAt,
  type Point3,
} from '../../src/app/curvedHelixRefoldIn3980';

const close=(a:number,b:number,eps=1e-9)=>
  assert.ok(Math.abs(a-b)<eps,`${a} ≠ ${b}`);
const dot=(a:readonly number[],b:readonly number[])=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a:Point3,b:Point3):Point3=>[
  a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0],
];
const derivative=(a:readonly number[],b:readonly number[],h:number)=>
  a.map((x,i)=>(b[i]-x)/(2*h));
const add=(a:readonly number[],b:readonly number[],v:number)=>
  a.map((x,i)=>x+v*b[i]);

test('In[3980] 保存来源、逆构造中点初值及折角端点',()=>{
  assert.deepEqual({r:HELIX_REFOLD_IN3980.radius,
    theta:HELIX_REFOLD_IN3980.helicityAngleDeg,
    gamma:[HELIX_REFOLD_IN3980.foldAngleStartDeg,HELIX_REFOLD_IN3980.foldAngleEndDeg],
    points:HELIX_REFOLD_IN3980.originalInterpolationPoints,
    midpoint:HELIX_REFOLD_IN3980.initialParameter},
  {r:1,theta:30,gamma:[120,60],points:128,midpoint:Math.PI/2});
  close(savedFoldAngleAt(0),2*Math.PI/3);
  close(savedFoldAngleAt(Math.PI/2),Math.PI/2);
  close(savedFoldAngleAt(Math.PI),Math.PI/3);
  assert.deepEqual(savedFlatCreaseAt(0),[1,0]);
  close(planarPhaseAt(0),Math.PI/2);
  const state=refoldStateAt(Math.PI/2);
  state.forEach((value,i)=>close(value,[Math.PI/2,
    ...HELIX_REFOLD_IN3980.initialPosition,
    ...HELIX_REFOLD_IN3980.initialTangent,
    0,-1,0,...HELIX_REFOLD_IN3980.initialBinormal][i]));
  assert.throws(()=>refoldStateAt(-.01));
  assert.throws(()=>savedFoldAngleAt(Math.PI+.01));
});

test('中点数值逆折从二维母线 ODE 恢复原三维螺旋及左右母线',()=>{
  const sample=sampleHelixRefoldIn3980();
  assert.equal(sample.frames.length,128);
  assert.ok(sample.diagnostics.recoveredAngleMaximumErrorRad<1e-10);
  assert.ok(sample.diagnostics.recoveredCreaseMaximumError<1e-9);
  assert.ok(sample.diagnostics.recoveredRulingMaximumError<1e-9);
  close(sample.frames[0].sourceCrease[0],1);
  close(sample.frames.at(-1)!.sourceCrease[0],-1);
  close(sample.frames.at(-1)!.sourceCrease[2],Math.PI/Math.sqrt(3));
  assert.equal(sample.diagnostics.original2DInterpolationOptionForwarded,false);
  assert.equal(sample.exactStraightCreaseFOLD,false);
  assert.equal(sample.sampledMeshExactIsometry,false);
});

test('原曲折、二维平展、逆折曲面在保存带上共享第一基本形式',()=>{
  const h=1e-5;
  for(const u of [.2,.8,1.5,2.3,2.9]){
    const frame=helixRefoldFrameAt(u),before=helixRefoldFrameAt(u-h),
      after=helixRefoldFrameAt(u+h);
    const t2=derivative(before.flatCrease,after.flatCrease,h);
    const phase=planarPhaseAt(u),speed=2/Math.sqrt(3);
    close(t2[0],speed*Math.cos(phase),3e-10);
    close(t2[1],speed*Math.sin(phase),3e-10);
    for(const side of ['Left','Right'] as const){
      const r2=frame[`flat${side}Ruling`];
      const r3=frame[`source${side}Ruling`];
      const rr=frame[`refolded${side}Ruling`];
      const dr2=derivative(before[`flat${side}Ruling`],after[`flat${side}Ruling`],h);
      const dr3=derivative(before[`source${side}Ruling`],after[`source${side}Ruling`],h);
      const drr=derivative(before[`refolded${side}Ruling`],after[`refolded${side}Ruling`],h);
      const t3=derivative(before.sourceCrease,after.sourceCrease,h);
      const tr=derivative(before.refoldedCrease,after.refoldedCrease,h);
      close(dot(cross(t3 as Point3,r3),dr3),0,5e-9);
      close(dot(cross(tr as Point3,rr),drr),0,5e-9);
      for(const v of [0,.5,1]){
        const d2=add(t2,dr2,v),d3=add(t3,dr3,v),dre=add(tr,drr,v);
        close(dot(d2,d2),dot(d3,d3),2e-8);
        close(dot(dre,dre),dot(d3,d3),2e-8);
        close(dot(d2,r2),dot(d3,r3),2e-8);
        close(dot(dre,rr),dot(d3,r3),2e-8);
        close(dot(r2,r2),1,2e-12);
        close(dot(r3,r3),1,2e-12);
      }
    }
  }
});

test('源折角 ODE 的唯一分支及单位宽焦线界',()=>{
  const sample=sampleHelixRefoldIn3980();
  assert.ok(sample.diagnostics.leftJacobianLowerBound>.16);
  assert.ok(sample.diagnostics.rightJacobianMagnitudeLowerBound>.62);
  for(const u of [.2,.8,1.5,2.3,2.9]){
    const h=1e-5;
    const gammaPrime=(refoldStateAt(u+h)[0]-refoldStateAt(u-h)[0])/(2*h);
    close(gammaPrime,-1/3,1e-8);
  }
});
