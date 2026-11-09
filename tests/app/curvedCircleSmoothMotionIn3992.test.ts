import test from 'node:test';
import assert from 'node:assert/strict';
import {certifySmoothMotion,creaseFrame,DEFAULT_MOTION_PARAMETERS,
  firstFundamentalForm,inverseMotionPoint,motionAngle,motionEnvelope,motionPartials,motionPoint,paperPoint,
  savedEndpointResidual,validateMotionParameters,type Point3} from '../../src/app/curvedCircleSmoothMotionIn3992';
const close=(a:number,b:number,tol=2e-10)=>
  assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const dot=(x:number[],y:number[])=>x.reduce((s,a,i)=>s+a*y[i],0);
const cross=(x:number[],y:number[])=>[
  x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];
const dist=(x:number[],y:number[])=>Math.hypot(...x.map((a,i)=>a-y[i]));
const diff=(f:(x:number)=>Point3,x:number)=>{
  const h=1e-5,a=f(x+h),b=f(x-h);
  return a.map((v,i)=>(v-b[i])/(2*h));
};

test('source endpoint is exact In[3992] fold and source-derived right ruling',()=>{
  const c=.5,h=Math.sqrt(3)/2;
  for(const s of [0,Math.PI/6,Math.PI/2,Math.PI]){
    const frame=creaseFrame(1,s),er=[Math.cos(s),Math.sin(s),0];
    close(dist(frame.point,er),0);
    close(dist(frame.tangent,[-Math.sin(s),Math.cos(s),0]),0);
    close(dist(frame.leftRuling,[-c*er[0],-c*er[1],h]),0);
    close(dist(frame.rightRuling,[c*er[0],c*er[1],h]),0);
    close(dist(motionPoint(1,s,-1),[(1-c)*er[0],(1-c)*er[1],h]),0);
    close(dist(motionPoint(1,s,1),[(1+c)*er[0],(1+c)*er[1],h]),0);
  }
  close(motionAngle(1),2*Math.PI/3);
  assert.ok(savedEndpointResidual().maximum<1e-15);
  assert.match(savedEndpointResidual().comparison,/非 Wolfram 数值 Out/);
});

test('progress zero equals one fixed planar paper for every material point',()=>{
  for(const s of [0,.4,1.2,2.5,Math.PI])for(const w of [-1,-.7,0,.3,1]){
    const p=paperPoint(s,w),x=motionPoint(0,s,w);
    close(dist(x,[...p,0]),0);
  }
});

test('continuous left/right patches share fixed intrinsic metric and remain developable',()=>{
  for(const progress of [0,.15,.4,.75,1])for(const s of [.3,1,2.2])
    for(const w of [-.95,-.4,0,.3,.95]){
      const side:wSign=Math.sign(w)<0?-1:1;
      const {ds,dw}=motionPartials(progress,s,w,side);
      const metric=firstFundamentalForm(w);
      close(dot(ds,ds),metric.E);close(dot(ds,dw),metric.F);
      close(dot(dw,dw),metric.G);
      close(Math.hypot(...cross(ds,dw)),metric.jacobian);
      close(dist(diff(t=>motionPoint(progress,t,w),s),ds),0,2e-10);
      if(w!==0)close(dist(diff(v=>motionPoint(progress,s,v),w),dw),0,2e-10);
      const frame=creaseFrame(progress,s);
      close(dot(frame.leftNormal,frame.rightNormal),Math.cos(motionAngle(progress)));
    }
  type wSign=-1|1;
  assert.throws(()=>motionPartials(.5,.5,-.2,1));
});

test('whole smooth motion has an analytic global injectivity and focus-free certificate',()=>{
  for(const p of [DEFAULT_MOTION_PARAMETERS,
    {arcEnd:Math.PI/2,leftWidth:.25,rightWidth:2},
    {arcEnd:Math.PI,leftWidth:1.5,rightWidth:.1}]){
    const cert=certifySmoothMotion(p);
    assert.equal(cert.savedCell,'In[3992]');
    assert.equal(cert.exactOriginalTargetAtProgressOne,true);
    assert.equal(cert.metricIndependentOfProgress,true);
    assert.equal(cert.globalInjectiveEveryFrame,true);
    assert.equal(cert.selfCollisionFreeEveryFrame,true);
    assert.equal(cert.polyhedralRigidPathChecked,false);
    assert.equal(cert.exactStraightCreaseFOLD,false);
    assert.equal(cert.completeClosedMaterialDomain,true);
    assert.equal(cert.includesFlatFrame,true);
    assert.equal(cert.analyticMaterialInverse,true);
    assert.equal(cert.paperThickness,0);
    assert.ok(cert.minimumRadialRadius>0);
    assert.ok(cert.minimumJacobian>0);
    assert.ok(cert.maximumAzimuthSweep<=Math.PI+1e-15);
  }
  close(certifySmoothMotion().minimumRadialRadius,.5);
  close(certifySmoothMotion().minimumJacobian,.5);
  close(certifySmoothMotion().maximumAzimuthSweep,Math.PI);
  close(certifySmoothMotion().minimumProjectedJacobian,.25);
  assert.throws(()=>validateMotionParameters({arcEnd:Math.PI,leftWidth:2,rightWidth:1}));
  assert.throws(()=>motionPoint(1.01,.5,0));
  assert.throws(()=>motionPoint(.5,.5,-1.01));
});

test('analytic inverse recovers the whole closed material domain, including flat frame and both sides',()=>{
  for(const p of [DEFAULT_MOTION_PARAMETERS,
    {arcEnd:Math.PI,leftWidth:1.5,rightWidth:2},
    {arcEnd:Math.PI/8,leftWidth:.1,rightWidth:.1}]){
    const envelope=motionEnvelope(p);
    for(const progress of [0,1e-9,.1,.5,.9,1])
      for(const s of [0,p.arcEnd*.1,p.arcEnd*.5,p.arcEnd])
        for(const w of [-p.leftWidth,-p.leftWidth*.5,0,p.rightWidth*.5,p.rightWidth]){
          const point=motionPoint(progress,s,w,p),inverse=inverseMotionPoint(progress,point,p);
          close(inverse.s,s);close(inverse.w,w);
          assert.ok(Math.hypot(point[0],point[1])<=envelope.radialRadius+1e-14);
          assert.ok(point[2]>=envelope.minimumHeight-1e-14);
          assert.ok(point[2]<=envelope.maximumHeight+1e-14);
        }
  }
  // Independently supplied notebook endpoint and planar points.
  close(inverseMotionPoint(1,[1.5*Math.cos(.7),1.5*Math.sin(.7),Math.sqrt(3)/2]).s,.7);
  close(inverseMotionPoint(1,[1.5*Math.cos(.7),1.5*Math.sin(.7),Math.sqrt(3)/2]).w,1);
  close(inverseMotionPoint(0,[2.5,0,0]).w,.5);
  assert.throws(()=>inverseMotionPoint(0,[2.5,0,.01]));
  assert.throws(()=>inverseMotionPoint(.5,[0,0,0]));
  assert.throws(()=>inverseMotionPoint(.5,[2,-1,0]));
  assert.throws(()=>inverseMotionPoint(1,[1,0,.01]));
  assert.throws(()=>inverseMotionPoint(.5,[Number.NaN,1,0]));
  assert.throws(()=>inverseMotionPoint(2,[1,0,0]));
});

test('certificate owns the finite trim and does not change after caller mutation',()=>{
  const input={...DEFAULT_MOTION_PARAMETERS},certificate=certifySmoothMotion(input);
  input.leftWidth=2;
  assert.equal(certificate.finiteTrim.leftWidth,1);
  assert.equal(certificate.minimumJacobian,.5);
});
