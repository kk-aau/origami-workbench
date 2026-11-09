import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyticDarboux,hyperboloidArea,hyperboloidBase,hyperboloidDirector,
  hyperboloidNormal,hyperboloidPartials,hyperboloidPoint,numericDarboux,
  sampleDiagnostics,savedInput,sinusoidCurve,sinusoidFrame,
  sinusoidSavedInput,sinusoidSurface,
} from '../../src/app/curvedDarbouxNormalSavedIn3812';

const close=(a:number,b:number,tol=1e-9)=>
  assert.ok(Math.abs(a-b)<tol,`${a} ≠ ${b}`);
const dot=(a:number[],b:number[])=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a:number[],b:number[])=>[
  a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dist=(a:number[],b:number[])=>Math.hypot(...a.map((x,i)=>x-b[i]));
const derivative=(f:(u:number)=>number[],u:number)=>{
  const h=1e-5,a=f(u+h),b=f(u-h);
  return a.map((x,i)=>(x-b[i])/(2*h));
};

test('saved calls retain fixed inputs and honest output boundaries',()=>{
  for(const cell of ['3812','3816','3818'] as const){
    const meta=savedInput(cell);
    assert.equal(meta.sourceCell,`In[${cell}]`);
    assert.equal(meta.wolframNumericOutAvailable,false);
    assert.equal(meta.exactFOLD,false);
  }
  assert.equal(savedInput('3812').sourceFunction,'RecoverDarboux3D');
  assert.equal(savedInput('3816').sourceFunction,'NRecoverDarboux3D');
  assert.deepEqual(savedInput('3818').orientations,[1,-1]);
  assert.deepEqual(savedInput('3818').vRange,[-1,1]);
  assert.throws(()=>savedInput('3819' as '3818'));
});

test('closed Darboux frame solves the saved ODE and initial values',()=>{
  const zero=analyticDarboux(0);
  assert.deepEqual(zero.c,[0,0,0]);
  assert.deepEqual(zero.t,[1,0,0]);
  assert.deepEqual(zero.l,[0,1,0]);
  close(dist(zero.n,[0,0,1]),0);
  for(const u of [.2,.7,1.2,2.6]){
    const frame=analyticDarboux(u);
    for(const vec of [frame.t,frame.l,frame.n])close(dot(vec,vec),1);
    close(dot(frame.t,frame.l),0);close(dot(frame.t,frame.n),0);
    close(dot(frame.l,frame.n),0);
    close(dist(derivative(x=>analyticDarboux(x).c,u),frame.t),0,2e-10);
    close(dist(derivative(x=>analyticDarboux(x).t,u),frame.n),0,2e-10);
    close(dist(derivative(x=>analyticDarboux(x).n,u),
      frame.t.map(x=>-x)),0,2e-10);
  }
  close(dist(analyticDarboux(Math.PI/2).c,[1,0,1]),0);
});

test('bounded local RK4 replay agrees with analytic source, without claiming Wolfram interpolation',()=>{
  for(let i=0;i<=8;i++){
    const u=Math.PI*i/8,a=analyticDarboux(u),n=numericDarboux(u);
    for(const key of ['c','t','l','n'] as const)
      close(dist(a[key],n[key]),0,1e-10);
  }
  assert.throws(()=>numericDarboux(.5,8));
  assert.equal(savedInput('3816').numericInterpolationReproduced,false);
});

test('both saved hyperboloid normals are unit, opposite and perpendicular to the same regular surface',()=>{
  for(const u of [-1.2,0,.8,2.5,4])for(const v of [-1,-.4,0,.6,1]){
    const {du,dv}=hyperboloidPartials(u,v),positive=hyperboloidNormal(u,v,1),
      negative=hyperboloidNormal(u,v,-1),area=hyperboloidArea(u,v);
    close(dist(hyperboloidPoint(u,v),hyperboloidBase(u).map((x,i)=>
      x+v*hyperboloidDirector(u)[i])),0);
    close(area,Math.hypot(...cross(du,dv)));
    assert.ok(area>=Math.SQRT1_2);
    close(dot(positive,positive),1);close(dot(negative,negative),1);
    close(dot(positive,du),0);close(dot(positive,dv),0);
    close(dist(positive,negative.map(x=>-x)),0);
    close(dot(positive,cross(du,dv))/area,1);
  }
});

test('In[3818] is a nondevelopable diagnostic, not an origami sheet',()=>{
  const u=.8,h=1e-5;
  const bp=hyperboloidBase(u+h),bm=hyperboloidBase(u-h),
    dp=hyperboloidDirector(u+h),dm=hyperboloidDirector(u-h),
    bu=bp.map((x,i)=>(x-bm[i])/(2*h)),
    du=dp.map((x,i)=>(x-dm[i])/(2*h));
  close(dot(bu,cross(hyperboloidDirector(u),du)),-.5,1e-10);
  assert.equal(sampleDiagnostics('3818',40).top.length,41);
  assert.equal(sampleDiagnostics('3812',40).curve.length,41);
  assert.equal(sampleDiagnostics('3816',40).curve.length,41);
  assert.throws(()=>sampleDiagnostics('3818',8));
});

test('In[3795] retains the exact saved generalized cylinder and curve',()=>{
  const saved=sinusoidSavedInput();
  assert.deepEqual(saved.surfaceXRange,[-1,.5]);
  assert.deepEqual(saved.surfaceYRange,[-1,1]);
  assert.deepEqual(saved.curveRange,[-1,1]);
  close(saved.sourceFrameAt,.5);close(saved.sourceVectorLength,.3);
  assert.equal(saved.numericWolframOutAvailable,false);
  assert.equal(saved.exactFOLD,false);
  for(const t of [-1,-.5,0,.5,1]){
    const f=sinusoidCurve(t),s=sinusoidSurface(Math.cos(t)-1,t);
    close(dist(f,s),0);
    close(f[0]+f[2],0);
    if(Math.abs(t)<1){
      close(dist(derivative(sinusoidCurve,t),[-Math.sin(t),1,Math.sin(t)]),0,2e-10);
      const dx=derivative(x=>sinusoidSurface(x,t),Math.cos(t)-1),
        dy=derivative(y=>sinusoidSurface(Math.cos(t)-1,y),t);
      close(dist(dx,[1,0,0]),0,2e-10);
      close(dist(dy,[0,1,Math.sin(t)]),0,2e-10);
      close(Math.hypot(...cross(dx,dy)),Math.sqrt(1+Math.sin(t)**2),2e-10);
    }
  }
  assert.throws(()=>sinusoidCurve(1.01));
  assert.throws(()=>sinusoidSurface(.51,0));
});

test('In[3795] Frenet and Darboux frames satisfy the source differential definitions',()=>{
  for(const t of [-.8,-.35,0,.5,.8]){
    const f=sinusoidFrame(t),{point,tangent,normal,binormal,
      tangentNormal,surfaceNormal}=f;
    assert.ok(f.speed>=1&&f.curvature>=Math.SQRT2*Math.cos(1)/Math.sqrt(27));
    for(const vector of [tangent,normal,binormal,tangentNormal,surfaceNormal])
      close(dot(vector,vector),1);
    close(dot(tangent,normal),0);close(dot(tangent,binormal),0);
    close(dot(normal,binormal),0);close(dot(tangent,tangentNormal),0);
    close(dot(tangent,surfaceNormal),0);close(dot(tangentNormal,surfaceNormal),0);
    close(dist(cross(tangent,normal),binormal),0);
    close(dist(cross(surfaceNormal,tangent),tangentNormal),0);
    const fprime=derivative(sinusoidCurve,t),tprime=derivative(x=>sinusoidFrame(x).tangent,t),
      uprime=derivative(x=>sinusoidFrame(x).surfaceNormal,t);
    close(dist(fprime,tangent.map(x=>x*f.speed)),0,2e-10);
    close(dot(tprime,normal)/f.speed,f.curvature,2e-10);
    close(dot(tprime,tangentNormal)/f.speed,f.geodesicCurvature,2e-10);
    close(dot(tprime,surfaceNormal)/f.speed,f.normalCurvature,2e-10);
    close(-dot(tangentNormal,uprime)/f.speed,f.geodesicTorsion,2e-10);
    close(f.curvature**2,f.geodesicCurvature**2+f.normalCurvature**2);
    close(point[0]+point[2],0);close(f.torsion,0);
  }
  const at=sinusoidFrame(.5);
  close(at.geodesicCurvature,.44871205032424505);
  close(at.normalCurvature,.5421246987313315);
  close(at.geodesicTorsion,-.234365936118935);
});
