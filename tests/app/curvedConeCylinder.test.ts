import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONE_TO_CYLINDER_EXAMPLE,CYLINDER_TO_CONE_EXAMPLE,
  sampleSurfaceConversion,surfaceConversionFrame,surfaceConversionPoint,
  validateSurfaceConversionParams,type SurfaceConversionParams,
} from '../../src/app/curvedConeCylinder';

const close=(actual:number,expected:number,tolerance=1e-10)=>
  assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const vector=(actual:readonly number[],expected:readonly number[],tolerance=1e-10)=>{
  assert.equal(actual.length,expected.length);
  actual.forEach((value,index)=>close(value,expected[index],tolerance));
};
const dot=(a:readonly number[],b:readonly number[])=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const derivative=(params:SurfaceConversionParams,side:'first'|'second',u:number,t:number,
  folded:boolean,coordinate:'u'|'t')=>{
  const h=1e-5;
  const point=(offset:number)=>{
    const frame=surfaceConversionFrame(params,u+(coordinate==='u'?offset:0));
    return surfaceConversionPoint(frame,side,t+(coordinate==='t'?offset:0),folded);
  };
  const before=point(-h),after=point(h);
  return after.map((x,i)=>(x-before[i])/(2*h));
};
const form=(params:SurfaceConversionParams,side:'first'|'second',u:number,t:number,
  folded:boolean)=>{
  const du=derivative(params,side,u,t,folded,'u');
  const dt=derivative(params,side,u,t,folded,'t');
  return [dot(du,du),dot(du,dt),dot(dt,dt)];
};

test('In[4047]/In[4050] saved cylinder-to-cone anchors and common crease',()=>{
  const sample=sampleSurfaceConversion(CYLINDER_TO_CONE_EXAMPLE);
  assert.equal(sample.frames.length,97);
  assert.deepEqual(sample.singularBoundary,['second',1]);
  assert.equal(sample.exactStraightCreaseFOLD,false);
  assert.equal(sample.selfCollisionChecked,false);
  const f0=surfaceConversionFrame(sample.params,0);
  vector(f0.b1,[-1,0]);vector(f0.bb1,[1,0,-1]);
  vector(f0.b2,[2,0]);vector(f0.bb2,[2,0,1]);
  close(f0.sourceRulingParameter,2);
  vector(f0.f,[1,0]);vector(f0.ff,[1,0,1]);
  for(const u of [-Math.PI/3,-.4,0,1.2,Math.PI]){
    const frame=surfaceConversionFrame(sample.params,u);
    close(frame.sourceRulingParameter,u*u/2+2*Math.cos(u));
    close(Math.hypot(...frame.b2.map((x,i)=>x-frame.f[i])),
      Math.hypot(...frame.bb2.map((x,i)=>x-frame.ff[i])));
    vector(surfaceConversionPoint(frame,'first',1,false),frame.f);
    vector(surfaceConversionPoint(frame,'second',0,true),frame.ff);
    vector(surfaceConversionPoint(frame,'second',1,false),[2,0]);
    vector(surfaceConversionPoint(frame,'second',1,true),[2,0,1]);
  }
});

test('In[4054]/In[4057] saved cone-to-cylinder anchors and fixed axes',()=>{
  const sample=sampleSurfaceConversion(CONE_TO_CYLINDER_EXAMPLE);
  assert.deepEqual(sample.singularBoundary,['first',0]);
  const a=surfaceConversionFrame(sample.params,0),b=surfaceConversionFrame(sample.params,Math.PI);
  const c=Math.sqrt(3)/2;
  close(a.sourceRulingParameter,1);
  vector(a.f,[1,0]);vector(a.ff,[c,-.5,0]);
  vector(a.b2,[1.25,0]);vector(a.bb2,[.75*c,-.625,0]);
  vector(a.d2,[-1,0]);vector(a.dd2,[c,.5,0]);
  close(b.sourceRulingParameter,1.5);
  vector(b.f,[0,1.5]);vector(b.ff,[1.5*c,.75,0]);
  for(const u of [0,.4,1.3,Math.PI]){
    const frame=surfaceConversionFrame(sample.params,u);
    vector(surfaceConversionPoint(frame,'first',0,false),[0,0]);
    vector(surfaceConversionPoint(frame,'first',0,true),[0,0,0]);
    close(frame.b2[0],1.25);
    close(Math.hypot(...frame.b2.map((x,i)=>x-frame.f[i])),
      Math.hypot(...frame.bb2.map((x,i)=>x-frame.ff[i])));
  }
});

test('both saved smooth surfaces preserve E/F/G on first and second patches',()=>{
  const cases=[CYLINDER_TO_CONE_EXAMPLE,CONE_TO_CYLINDER_EXAMPLE,
    {...CONE_TO_CYLINDER_EXAMPLE,coneAngleDeg:20,cylinderAxisOffset:.6}];
  for(const params of cases){
    const span=params.parameterEnd-params.parameterStart;
    for(const fraction of [.18,.5,.83]){
      const u=params.parameterStart+fraction*span;
      for(const side of ['first','second'] as const)for(const t of [.12,.48,.87]){
        const flat=form(params,side,u,t,false),folded=form(params,side,u,t,true);
        flat.forEach((value,i)=>close(value,folded[i],3e-8));
      }
    }
  }
});

test('singular apex boundary collapses, other sampled interiors remain regular',()=>{
  for(const params of [CYLINDER_TO_CONE_EXAMPLE,CONE_TO_CYLINDER_EXAMPLE,
    {...CONE_TO_CYLINDER_EXAMPLE,coneAngleDeg:5,cylinderAxisOffset:.01}]){
    const sample=sampleSurfaceConversion(params);
    const [singularSide,singularT]=sample.singularBoundary;
    const mid=params.parameterStart+.5*(params.parameterEnd-params.parameterStart);
    const a=surfaceConversionFrame(params,mid-.1),b=surfaceConversionFrame(params,mid+.1);
    vector(surfaceConversionPoint(a,singularSide,singularT,false),
      surfaceConversionPoint(b,singularSide,singularT,false));
    vector(surfaceConversionPoint(a,singularSide,singularT,true),
      surfaceConversionPoint(b,singularSide,singularT,true));
    for(const side of ['first','second'] as const)for(const t of [.1,.5,.9]){
      const du=derivative(params,side,mid,t,false,'u');
      const dt=derivative(params,side,mid,t,false,'t');
      assert.ok(Math.abs(du[0]*dt[1]-du[1]*dt[0])>1e-4);
    }
  }
});

test('rejects unproved angle, offset, interval, unknown and nonfinite inputs',()=>{
  for(const patch of [{parameterStart:-Math.PI/3-.01},
    {parameterEnd:Math.PI+.01},{parameterStart:0,parameterEnd:0},
    {coneAngleDeg:20},{cylinderAxisOffset:1},{curveSegments:15},
    {curveSegments:512.5},{parameterStart:Infinity},{unexpected:1}])
    assert.throws(()=>validateSurfaceConversionParams({...CYLINDER_TO_CONE_EXAMPLE,...patch}));
  for(const patch of [{coneAngleDeg:4.99},{coneAngleDeg:30.01},
    {cylinderAxisOffset:0},{cylinderAxisOffset:2.01},
    {parameterStart:-.01},{parameterEnd:Math.PI+.01},
    {curveSegments:NaN}])
    assert.throws(()=>validateSurfaceConversionParams({...CONE_TO_CYLINDER_EXAMPLE,...patch}));
  const frame=surfaceConversionFrame(CYLINDER_TO_CONE_EXAMPLE,0);
  assert.throws(()=>surfaceConversionPoint(frame,'first',1.01,false));
  assert.throws(()=>surfaceConversionPoint(frame,'first',NaN,true));
});
