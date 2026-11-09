import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACROSS_REFOLD_IN3988,firstForm,foldAngle,frameAt,rightCoefficients,
  sampleIn3988,sourceCurvature,sourceResiduals,sourceTorsion,surface,
  type Side,
} from '../../src/app/curvedAcrossRightRefoldIn3988';

const close=(actual:number,expected:number,tolerance=1e-8)=>
  assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
const dot=(a:number[],b:number[])=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const cross=(a:number[],b:number[])=>
  [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const derivative=(fn:(u:number)=>number[],u:number)=>{
  const h=1e-4,a=fn(u+h),b=fn(u-h);
  return a.map((x,i)=>(x-b[i])/(2*h));
};

test('In[3988] keeps the fixed numeric source input and honest output boundary',()=>{
  assert.equal(ACROSS_REFOLD_IN3988.sourceCell,'In[3988]');
  assert.deepEqual(ACROSS_REFOLD_IN3988.initialPoint,[1,0,0]);
  assert.deepEqual(ACROSS_REFOLD_IN3988.initialTangent,[0,1,0]);
  assert.deepEqual(ACROSS_REFOLD_IN3988.initialBinormal,[0,0,1]);
  assert.equal(ACROSS_REFOLD_IN3988.originalInterpolationPoints,64);
  for(const key of ['numericInterpolationReproduced','exactStraightCreaseFOLD',
    'adoptableCreasePattern','motionVerified','selfCollisionVerified'] as const)
    assert.equal(ACROSS_REFOLD_IN3988[key],false);
  close(foldAngle(0)*180/Math.PI,150);
  close(foldAngle(Math.PI/2)*180/Math.PI,.015);
  assert.throws(()=>foldAngle(Math.PI/2+.01));
  assert.throws(()=>surface('flat','left',.5,.6));
});

test('the saved left circle and angle uniquely determine the source right ruling',()=>{
  for(const u of [0,.2,.8,Math.PI/2]){
    const f=frameAt(u),coeff=rightCoefficients(u),residual=sourceResiduals(u);
    close(dot(f.flatTangent,f.flatLeft),0);
    close(dot(f.flatNormal,f.flatLeft),1);
    close(dot(f.flatTangent,f.flatRight),coeff.c);
    close(dot(f.flatNormal,f.flatRight),-coeff.s);
    assert.ok(coeff.c>0&&coeff.s>0&&coeff.angleRate>1);
    for(const value of Object.values(residual))close(value,0,2e-12);
    close(sourceCurvature(u),1/Math.cos(f.gamma/2));
    close(sourceTorsion(),5*.9999/6);
  }
});

test('2D and 3D share one crease and each side has the same local first form',()=>{
  for(const u of [.15,.75,1.4])for(const side of ['left','right'] as Side[]){
    const f=frameAt(u),v=.3,expected=firstForm(side,u,v);
    close(Math.hypot(...surface('flat',side,u,0).map((x,i)=>x-f.flatCrease[i])),0);
    close(Math.hypot(...surface('folded',side,u,0).map((x,i)=>x-f.foldedCrease[i])),0);
    for(const space of ['flat','folded'] as const){
      const point=(uu:number,vv:number)=>surface(space,side,uu,vv);
      const pu=derivative(uu=>point(uu,v),u);
      const h=1e-5,pv=point(u,v+h).map((x,i)=>(x-point(u,v-h)[i])/(2*h));
      close(dot(pu,pu),expected.E,3e-6);
      close(dot(pu,pv),expected.F,3e-6);
      close(dot(pv,pv),expected.G,3e-6);
      if(space==='folded'){
        const ruling=side==='left'?f.foldedLeft:f.foldedRight;
        const rulingPrime=derivative(uu=>{
          const ff=frameAt(uu);return side==='left'?ff.foldedLeft:ff.foldedRight;
        },u);
        close(dot(f.foldedTangent,cross(ruling,rulingPrime)),0,3e-6);
      }
    }
    assert.ok(expected.jacobian!==0);
  }
});

test('the left spatial rulings meet one fixed apex; the right band stays before a focal point',()=>{
  const start=frameAt(0);
  const apex=start.foldedCrease.map((x,i)=>x+start.foldedLeft[i]);
  for(const u of [0,.3,.9,1.4,Math.PI/2]){
    const f=frameAt(u),candidate=f.foldedCrease.map((x,i)=>x+f.foldedLeft[i]);
    close(Math.hypot(...candidate.map((x,i)=>x-apex[i])),0,3e-10);
    close(firstForm('left',u,.5).jacobian,.5);
    assert.ok(firstForm('right',u,0).jacobian<0);
    assert.ok(firstForm('right',u,.5).jacobian<0);
  }
});

test('the oriented spatial side normals preserve the saved positive fold angle',()=>{
  for(const u of [.1,.8,1.4,Math.PI/2]){
    const f=frameAt(u),left=cross(f.foldedTangent,f.foldedLeft);
    const right=cross(f.foldedTangent,f.foldedRight).map(x=>-x);
    const nLeft=left.map(x=>x/Math.hypot(...left));
    const nRight=right.map(x=>x/Math.hypot(...right));
    const signed=Math.atan2(dot(f.foldedTangent,cross(nRight,nLeft)),
      dot(nLeft,nRight));
    close(signed,f.gamma,3e-10);
  }
});

test('preview is a source-formula sample, never a straight-crease paper',()=>{
  const sample=sampleIn3988(32);
  assert.equal(sample.frames.length,33);
  assert.equal(sample.flatRightBoundary.length,33);
  assert.equal(sample.foldedRightBoundary.length,33);
  close(sample.frames[0].gamma*180/Math.PI,150);
  close(sample.frames.at(-1)!.gamma*180/Math.PI,.015);
  assert.throws(()=>sampleIn3988(500));
});
