import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalDirectrix,canonicalDirector,canonicalPoint,crossCurvePoint,
  derivedFlatPoint,firstForm,rawDirectrix,rawDirector,rawPoint,sampleCanonical,
  savedInput,type CanonicalCase,
} from '../../src/app/curvedCanonicalConeCylinderIn3826';

const kinds:CanonicalCase[]=['cylinder-in3826','cone-in3830'];
const close=(x:number,y:number,tol=1e-9)=>
  assert.ok(Math.abs(x-y)<tol,`${x} ≠ ${y}`);
const distance=(a:number[],b:number[])=>Math.hypot(...a.map((x,i)=>x-b[i]));
const dot=(a:number[],b:number[])=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const partial=(fn:(u:number,v:number)=>number[],u:number,v:number,du:number,dv:number)=>{
  const h=1e-5,a=fn(u+du*h,v+dv*h),b=fn(u-du*h,v-dv*h);
  return a.map((x,i)=>(x-b[i])/(2*h));
};

test('fixed saved inputs preserve source function, range and honest capability limits',()=>{
  const cylinder=savedInput('cylinder-in3826'),cone=savedInput('cone-in3830');
  assert.deepEqual(cylinder.inputRange,[-Math.PI/4,3*Math.PI/4]);
  assert.deepEqual(cone.inputRange,[0,Math.PI]);
  assert.equal(cone.savedConeAngleDeg,30);
  assert.equal(cylinder.sourceFunction,'CanonicalCylinderDevelopableSystem');
  assert.equal(cone.sourceFunction,'CanonicalConeDevelopableSystem');
  for(const input of [cylinder,cone]){
    assert.deepEqual(input.displayedRulingRange,[0,1]);
    assert.equal(input.sourceDirectorLength,2);
    assert.equal(input.crossCurveAliasesSurface,true);
    assert.equal(input.flatDevelopmentDerivedLocally,true);
    for(const key of ['numericWolframOutAvailable','exactStraightCreaseFOLD',
      'adoptableCreasePattern','motionVerified','selfCollisionVerified'] as const)
      assert.equal(input[key],false);
  }
  assert.throws(()=>savedInput('other' as CanonicalCase));
});

test('source director is normalized, cylinder directrix projected, and source lines preserved',()=>{
  for(const kind of kinds){
    const [lo,hi]=savedInput(kind).inputRange;
    for(let i=0;i<=16;i++){
      const u=lo+(hi-lo)*i/16;
      close(Math.hypot(...rawDirector(kind,u)),2);
      close(Math.hypot(...canonicalDirector(kind,u)),1);
      close(distance(crossCurvePoint(kind,u,.4),canonicalPoint(kind,u,.4)),0);
      const canonicalBase=canonicalDirectrix(kind,u);
      if(kind==='cylinder-in3826'){
        close(dot(canonicalBase,canonicalDirector(kind,u)),0);
        close(canonicalBase[2],0);
      }else assert.deepEqual(canonicalBase,[0,0,.5]);
    }
  }
  for(const u of [-Math.PI/4,.5,3*Math.PI/4])for(const lambda of [0,.3,1])
    close(distance(rawPoint('cylinder-in3826',u,lambda),
      canonicalPoint('cylinder-in3826',u,2*u+2*lambda)),0);
  for(const u of [0,.5,Math.PI])for(const lambda of [0,.3,1])
    close(distance(rawPoint('cone-in3830',u,lambda),
      canonicalPoint('cone-in3830',u,2*lambda)),0);
  assert.notDeepEqual(rawDirectrix('cylinder-in3826',1),
    canonicalDirectrix('cylinder-in3826',1));
});

test('saved canonical 3D surfaces and derived 2D unfoldings have the same first form',()=>{
  for(const kind of kinds){
    const [lo,hi]=savedInput(kind).inputRange;
    for(const u of [lo+.25*(hi-lo),lo+.75*(hi-lo)])for(const v of [.2,.5,.8]){
      const expected=firstForm(kind,v);
      for(const point of [canonicalPoint,derivedFlatPoint]){
        const fn=(uu:number,vv:number)=>point(kind,uu,vv);
        const pu=partial(fn,u,v,1,0),pv=partial(fn,u,v,0,1);
        close(dot(pu,pu),expected.E,2e-9);
        close(dot(pu,pv),expected.F,2e-9);
        close(dot(pv,pv),expected.G,2e-9);
      }
      assert.equal(expected.regular,true);
    }
  }
  assert.equal(firstForm('cone-in3830',0).regular,false);
  assert.equal(firstForm('cylinder-in3826',0).regular,true);
});

test('fixed surfaces are developable without turning display samples into FOLD',()=>{
  for(const kind of kinds){
    const [lo,hi]=savedInput(kind).inputRange,u=(lo+hi)/2;
    const bu=partial((uu)=>canonicalDirectrix(kind,uu),u,.4,1,0);
    const du=partial((uu)=>canonicalDirector(kind,uu),u,.4,1,0);
    const d=canonicalDirector(kind,u);
    const cross=[d[1]*du[2]-d[2]*du[1],d[2]*du[0]-d[0]*du[2],
      d[0]*du[1]-d[1]*du[0]];
    close(dot(bu,cross),0,1e-12);
    const sample=sampleCanonical(kind,24,4);
    assert.equal(sample.canonicalGrid.length,5);
    assert.equal(sample.canonicalGrid[0].length,25);
    assert.equal(sample.flatGrid.length,5);
    assert.equal(sample.source.exactStraightCreaseFOLD,false);
  }
  assert.throws(()=>sampleCanonical('cone-in3830',8));
});
