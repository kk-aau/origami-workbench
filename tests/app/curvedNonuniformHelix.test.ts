import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NONUNIFORM_HELIX_IN3968,foldAngleAt,foldedRulingsAt,
  nonuniformHelixDiagnostics,nonuniformHelixFrameAt,planarCreaseAt,
  planarTangentPhaseAt,sampleNonuniformHelixIn3968,
  type Point2,type Point3,
} from '../../src/app/curvedNonuniformHelix';

const close=(actual:number,expected:number,tolerance=1e-10)=>
  assert.ok(Math.abs(actual-expected)<tolerance,`${actual} ≠ ${expected}`);
const dot=(a:readonly number[],b:readonly number[])=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const cross=(a:Point3,b:Point3):Point3=>[
  a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0],
];
const derivative=(before:readonly number[],after:readonly number[],h:number)=>
  before.map((x,i)=>(after[i]-x)/(2*h));
const add=(point:readonly number[],ruling:readonly number[],v:number)=>
  point.map((x,i)=>x+v*ruling[i]);

test('In[3968] 保存输入、端点和数值平展锚点',()=>{
  assert.deepEqual({r:NONUNIFORM_HELIX_IN3968.radius,
    theta:NONUNIFORM_HELIX_IN3968.helicityAngleDeg,
    gamma:[NONUNIFORM_HELIX_IN3968.foldAngleStartDeg,
      NONUNIFORM_HELIX_IN3968.foldAngleEndDeg],
    interpolationPoints:NONUNIFORM_HELIX_IN3968.originalInterpolationPoints},
  {r:1,theta:30,gamma:[60,120],interpolationPoints:128});
  const sample=sampleNonuniformHelixIn3968();
  assert.equal(sample.frames.length,128);
  close(sample.frames[0].foldAngleRad,Math.PI/3);
  close(sample.frames[127].foldAngleRad,2*Math.PI/3);
  assert.deepEqual(sample.frames[0].flatCrease,[1,0]);
  close(sample.frames[127].foldedCrease[0],-1);
  close(sample.frames[127].foldedCrease[2],Math.PI/Math.sqrt(3));
  // An independently integrated high-precision reference for the fixed input.
  close(sample.frames[127].flatCrease[0],-1.6718716168308418,2e-10);
  close(sample.frames[127].flatCrease[1],1.5688036499070404,2e-10);
  assert.equal(sample.diagnostics.original2DInterpolationOptionForwarded,false);
  assert.equal(sample.exactStraightCreaseFOLD,false);
  assert.equal(sample.sampledMeshExactIsometry,false);
});

test('三维左右母线与原式锚点一致，折角是两有向法线的补角',()=>{
  const first=foldedRulingsAt(0);
  for(const [actual,expected] of [
    [first.left,[-0.47172817652486326,0.5900968443520824,0.6551780229511989]],
    [first.right,[0.686243566496721,0.33016908987210886,0.6481189239135697]],
  ] as const)actual.forEach((value,i)=>close(value,expected[i],1e-12));
  for(const u of [0,Math.PI/4,Math.PI/2,3*Math.PI/4,Math.PI]){
    const f=nonuniformHelixFrameAt(u);
    const tangent:Point3=[-Math.cos(Math.PI/6)*Math.sin(u),
      Math.cos(Math.PI/6)*Math.cos(u),Math.sin(Math.PI/6)];
    const nL=cross(tangent,f.foldedLeftRuling),nR=cross(tangent,f.foldedRightRuling);
    const normalCos=dot(nL,nR)/Math.sqrt(dot(nL,nL)*dot(nR,nR));
    close(Math.acos(-normalCos),foldAngleAt(u),2e-12);
    for(const vector of [f.foldedLeftRuling,f.foldedRightRuling,
      f.flatLeftRuling,f.flatRightRuling])close(dot(vector,vector),1,2e-12);
  }
});

test('二维积分切线和两侧连续第一基本形式在保存区间相合',()=>{
  const h=1e-5;
  for(const u of [.2,.8,1.5,2.3,2.9]){
    const frame=nonuniformHelixFrameAt(u);
    const before=nonuniformHelixFrameAt(u-h),after=nonuniformHelixFrameAt(u+h);
    const flatTangent=derivative(before.flatCrease,after.flatCrease,h);
    const phase=planarTangentPhaseAt(u),speed=1/Math.cos(Math.PI/6);
    close(flatTangent[0],speed*Math.cos(phase),2e-10);
    close(flatTangent[1],speed*Math.sin(phase),2e-10);
    for(const side of ['Left','Right'] as const){
      const d2=frame[`flat${side}Ruling`] as Point2;
      const d3=frame[`folded${side}Ruling`] as Point3;
      const dr2=derivative(before[`flat${side}Ruling`],after[`flat${side}Ruling`],h);
      const dr3=derivative(before[`folded${side}Ruling`],after[`folded${side}Ruling`],h);
      const f3prime=derivative(before.foldedCrease,after.foldedCrease,h);
      close(dot(cross(f3prime as Point3,d3),dr3),0,5e-9);
      for(const v of [0,.25,.5]){
        const tangent2=add(flatTangent,dr2,v),tangent3=add(f3prime,dr3,v);
        close(dot(tangent2,tangent2),dot(tangent3,tangent3),2e-8);
        close(dot(tangent2,d2),dot(tangent3,d3),2e-8);
        close(dot(d2,d2),dot(d3,d3),2e-12);
      }
    }
  }
});

test('仅 0.5 宽局部带有全区间正则下界；原单位宽左带越过焦线',()=>{
  const result=nonuniformHelixDiagnostics();
  close(result.sourceLeftDenominatorSquaredLowerBound,91/36,1e-12);
  close(result.sourceRightDenominatorSquaredLowerBound,43/36,1e-12);
  assert.ok(result.leftJacobianLowerBound>.18);
  assert.ok(result.rightJacobianMagnitudeLowerBound>.9);
  assert.ok(result.unitLeftFocalDistanceAtStart>.7);
  assert.ok(result.unitLeftFocalDistanceAtStart<1);
  assert.throws(()=>planarCreaseAt(-.001));
  assert.throws(()=>foldedRulingsAt(Math.PI+.001));
});
