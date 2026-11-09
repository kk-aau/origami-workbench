import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURVED_UNIFORM_HELIX_EXAMPLE,curvedUniformHelixFrame,
  curvedUniformHelixShapeSamples,sampleCurvedUniformHelix,validateCurvedUniformHelixParams,
  type CurvedPoint2,type CurvedPoint3,
} from '../../src/app/curvedUniformHelix';

const close=(actual:number,expected:number,tolerance=1e-11)=>
  assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const dot=(a:number[],b:number[])=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const cross=(a:CurvedPoint3,b:CurvedPoint3):CurvedPoint3=>[
  a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0],
];
const offset=(a:number[],d:number[],v:number)=>a.map((x,i)=>x+v*d[i]);

test('In[3947]/In[3953] saved r=1, 30°, 90° example has source-derived anchors',()=>{
  const sample=sampleCurvedUniformHelix(CURVED_UNIFORM_HELIX_EXAMPLE);
  assert.equal(sample.frames.length,97);
  assert.equal(sample.rulingFrameIndices.length,13);
  assert.equal(sample.flatLeftBoundary.length,97);
  assert.equal(sample.foldedRightBoundary.length,97);
  close(sample.params.unfoldedCreaseRadius,4*Math.SQRT2/3);
  close(sample.params.rulingFocalDistance,1.460593486680443);
  const first=sample.frames[0],last=sample.frames.at(-1)!;
  assert.deepEqual(first.flatCrease,[1,0]);
  assert.deepEqual(first.foldedCrease,[1,0,0]);
  const expected={
    flatLeftRuling:[-Math.sqrt(3/5),Math.sqrt(2/5)],
    flatRightRuling:[Math.sqrt(3/5),Math.sqrt(2/5)],
    foldedLeftRuling:[-Math.sqrt(3/10),Math.sqrt(3/40),Math.sqrt(5/8)],
    foldedRightRuling:[Math.sqrt(3/10),Math.sqrt(3/40),Math.sqrt(5/8)],
  };
  for(const key of Object.keys(expected) as (keyof typeof expected)[])
    first[key].forEach((value,i)=>close(value,expected[key][i]));
  close(last.foldedCrease[0],-1);
  close(last.foldedCrease[1],0);
  close(last.foldedCrease[2],Math.PI/Math.sqrt(3));
  for(const frame of sample.frames){
    const circleCenter:CurvedPoint2=[1-4*Math.SQRT2/3,0];
    close(Math.hypot(frame.flatCrease[0]-circleCenter[0],
      frame.flatCrease[1]-circleCenter[1]),4*Math.SQRT2/3);
  }
  assert.deepEqual(curvedUniformHelixFrame(1.7,Math.PI/6,Math.PI/2,0).flatCrease,[1,0]);
  assert.equal(sample.exactStraightCreaseFOLD,false);
  assert.equal(sample.deploymentPathChecked,false);
  assert.equal(sample.selfCollisionChecked,false);
});

test('2D/3D ruled surfaces share first fundamental form, remain developable, and have fold angle γ',()=>{
  const step=1e-5;
  for(const [radius,thetaDeg,gammaDeg] of [[1,30,90],[1.7,-25,60],[.8,55,120]]){
    const theta=thetaDeg*Math.PI/180,gamma=gammaDeg*Math.PI/180;
    for(const u of [.15,1.2,2.8]){
      const frame=curvedUniformHelixFrame(radius,theta,gamma,u);
      const before=curvedUniformHelixFrame(radius,theta,gamma,u-step);
      const after=curvedUniformHelixFrame(radius,theta,gamma,u+step);
      const tangent=after.foldedCrease.map((x,i)=>(x-before.foldedCrease[i])/(2*step)) as CurvedPoint3;
      for(const side of ['Left','Right'] as const){
        const flatRuling=frame[`flat${side}Ruling`];
        const foldedRuling=frame[`folded${side}Ruling`];
        close(dot(flatRuling,flatRuling),1);
        close(dot(foldedRuling,foldedRuling),1);
        for(const v of [.1,.4,.8]){
          const flatPlus=offset(after.flatCrease,after[`flat${side}Ruling`],v);
          const flatMinus=offset(before.flatCrease,before[`flat${side}Ruling`],v);
          const foldedPlus=offset(after.foldedCrease,after[`folded${side}Ruling`],v);
          const foldedMinus=offset(before.foldedCrease,before[`folded${side}Ruling`],v);
          const du2=flatPlus.map((x,i)=>(x-flatMinus[i])/(2*step));
          const du3=foldedPlus.map((x,i)=>(x-foldedMinus[i])/(2*step));
          close(dot(du2,du2),dot(du3,du3),1e-8);
          close(dot(du2,flatRuling),dot(du3,foldedRuling),1e-8);
        }
        const rulingDerivative=after[`folded${side}Ruling`].map(
          (x,i)=>(x-before[`folded${side}Ruling`][i])/(2*step)) as CurvedPoint3;
        close(dot(tangent,cross(foldedRuling,rulingDerivative)),0,1e-8);
      }
      const left=cross(tangent,frame.foldedLeftRuling);
      const right=cross(tangent,frame.foldedRightRuling);
      close(-dot(left,right)/Math.sqrt(dot(left,left)*dot(right,right)),Math.cos(gamma),1e-9);
    }
  }
});

test('sampled chords converge without claiming exact discrete isometry',()=>{
  const maxError=(segments:number)=>{
    const sample=sampleCurvedUniformHelix({...CURVED_UNIFORM_HELIX_EXAMPLE,
      curveSegments:segments});
    let error=0;
    for(let i=0;i<segments;i++)for(const side of ['Left','Right'] as const){
      const flat=side==='Left'?sample.flatLeftBoundary:sample.flatRightBoundary;
      const folded=side==='Left'?sample.foldedLeftBoundary:sample.foldedRightBoundary;
      error=Math.max(error,Math.abs(Math.hypot(...flat[i].map((x,j)=>x-flat[i+1][j]))-
        Math.hypot(...folded[i].map((x,j)=>x-folded[i+1][j]))));
    }
    return error;
  };
  const coarse=maxError(48),fine=maxError(96);
  assert.ok(coarse>0);
  assert.ok(fine<coarse/6);
  assert.ok(fine<2e-6);
});

test('In[3957]/In[3958] four shape plots use continuous helix invariants and source ruling angles',()=>{
  const source=curvedUniformHelixShapeSamples(sampleCurvedUniformHelix(CURVED_UNIFORM_HELIX_EXAMPLE));
  assert.equal(source.length,97);
  for(const item of [source[0],source[32],source[96]]){
    close(item.spatialCurvature,.75);
    close(item.geodesicCurvature,3*Math.SQRT2/8);
    close(item.flatLeftCurvature,item.geodesicCurvature);
    close(item.torsion,Math.sqrt(3)/4);
    const ruling=Math.acos(Math.sqrt(2/5))*180/Math.PI;
    for(const key of ['flatLeftRulingAngleDeg','flatRightRulingAngleDeg',
      'foldedLeftRulingAngleDeg','foldedRightRulingAngleDeg'] as const)
      close(item[key],ruling);
    close(item.foldAngleDeg,90);
  }
  const reversed=curvedUniformHelixShapeSamples(sampleCurvedUniformHelix({
    ...CURVED_UNIFORM_HELIX_EXAMPLE,helicityAngleDeg:-25,radius:1.7,
    foldAngleDeg:60,rulingLength:.3}));
  assert.ok(reversed[0].torsion<0);
  for(const item of reversed){
    close(item.flatLeftCurvature,item.geodesicCurvature);
    close(item.spatialCurvature,Math.cos(25*Math.PI/180)**2/1.7);
    close(item.foldedLeftRulingAngleDeg,item.flatLeftRulingAngleDeg);
    close(item.foldedRightRulingAngleDeg,item.flatRightRulingAngleDeg);
  }
});

test('regular domain and finite-width guard agree with the backend contract',()=>{
  for(const patch of [{radius:0},{helicityAngleDeg:90},{foldAngleDeg:0},
    {foldAngleDeg:180},{rulingLength:1.5},{parameterEnd:0},
    {curveSegments:7},{curveSegments:96.5},{rulingSegments:0},
    {radius:Infinity},{unexpected:true}]){
    assert.throws(()=>validateCurvedUniformHelixParams({
      ...CURVED_UNIFORM_HELIX_EXAMPLE,...patch}));
  }
  assert.throws(()=>curvedUniformHelixFrame(1,0,0,0));
  assert.throws(()=>curvedUniformHelixFrame(1,0,Math.PI,0));
});
