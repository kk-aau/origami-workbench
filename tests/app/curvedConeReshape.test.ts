import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONE_RESHAPE_PRESET,coneReshapeDirectors,coneReshapeMetric,
  sampleConeReshape,sampleConeReshapeGrid,validateConeReshapeParams,
} from '../../src/app/curvedConeReshape';

const close=(a:number,b:number,tolerance=2e-9)=>Math.abs(a-b)<=tolerance;
const dot=(a:number[],b:number[])=>a.reduce((sum,value,i)=>sum+value*b[i],0);

test('In[3902/3907] cone with theta 30 degrees flattens to the source-derived plane sector',()=>{
  const at0=coneReshapeDirectors('flatten',0);
  assert.ok(close(at0.source[0],-.5));
  assert.ok(close(at0.source[1],Math.sqrt(3)/2));
  assert.ok(at0.target.every((value,i)=>close(value,at0.source[i])));
  for(const s of [0,.2,1.1,Math.PI]){
    const {source,target}=coneReshapeDirectors('flatten',s);
    assert.ok(close(Math.hypot(...source),1));
    assert.ok(close(Math.hypot(...target),1));
    assert.ok(close(target[2],0));
  }
  assert.deepEqual(coneReshapeMetric('flatten',0),{E:0,F:0,G:1,regular:false});
});

test('In[3903/3908] planar sector curls to cone with beta 0.7 and source initial frame',()=>{
  const at0=coneReshapeDirectors('curl',0);
  assert.deepEqual(at0.source,[-1,0,0]);
  assert.deepEqual(at0.target,[-1,0,0]);
  const h=1e-5,s=.8,beta=CONE_RESHAPE_PRESET.normalCurvature;
  const before=coneReshapeDirectors('curl',s-h).target;
  const at=coneReshapeDirectors('curl',s).target;
  const after=coneReshapeDirectors('curl',s+h).target;
  const tangent=at.map((_,i)=>(after[i]-before[i])/(2*h));
  const second=at.map((value,i)=>(after[i]-2*value+before[i])/(h*h));
  // Darboux U obeys U'=−beta T and U(0)=(0,0,1).
  const initial=[0,0,1];
  const integral=at.map((value,i)=>value-at0.target[i]);
  const normal=initial.map((value,i)=>value-beta*integral[i]);
  assert.ok(close(dot(tangent,tangent),1));
  assert.ok(close(dot(second,normal),beta,1e-5));
  assert.ok(close(dot(second,at),-1,1e-5));
  assert.deepEqual(coneReshapeMetric('curl',0),{E:0,F:0,G:1,regular:false});
});

test('both saved cone reshapes have identical source/target first fundamental forms away from apex',()=>{
  const h=1e-5;
  for(const mode of ['flatten','curl'] as const)for(const s of [.2,1.3,2.7])
    for(const v of [.1,.5,.9]){
      const metric=coneReshapeMetric(mode,v);
      assert.equal(metric.regular,true);
      for(const side of ['source','target'] as const){
        const p0=sampleConeReshape(mode,s-h,v)[side],p1=sampleConeReshape(mode,s+h,v)[side];
        const q0=sampleConeReshape(mode,s,v-h)[side],q1=sampleConeReshape(mode,s,v+h)[side];
        const ds=p0.map((_,i)=>(p1[i]-p0[i])/(2*h));
        const dv=q0.map((_,i)=>(q1[i]-q0[i])/(2*h));
        assert.ok(close(dot(ds,ds),metric.E),`${mode}/${side} E`);
        assert.ok(close(dot(ds,dv),metric.F),`${mode}/${side} F`);
        assert.ok(close(dot(dv,dv),metric.G),`${mode}/${side} G`);
      }
    }
});

test('saved source domain and analytic parameter bounds reject singular or forged queries',()=>{
  assert.equal(sampleConeReshapeGrid('flatten',CONE_RESHAPE_PRESET,20,4).length,21);
  for(const bad of [{thetaDeg:0,normalCurvature:.7},
    {thetaDeg:30,normalCurvature:2},
    {thetaDeg:30,normalCurvature:NaN},
    {thetaDeg:30,normalCurvature:.7,source:'forged'}])
    assert.throws(()=>validateConeReshapeParams(bad));
  assert.throws(()=>sampleConeReshape('curl',-.1,.5),/保存范围/);
  assert.throws(()=>sampleConeReshape('curl',.5,1.01),/保存范围/);
  assert.throws(()=>sampleConeReshapeGrid('curl',CONE_RESHAPE_PRESET,201,4),/安全范围/);
});

test('adjusted cone angle and target curvature remain locally isometric before the apex',()=>{
  const params={thetaDeg:45,normalCurvature:1.2};
  const h=1e-5,s=1.1,v=.6;
  for(const mode of ['flatten','curl'] as const){
    const metric=coneReshapeMetric(mode,v,params);
    const values=(side:'source'|'target')=>{
      const p0=sampleConeReshape(mode,s-h,v,params)[side];
      const p1=sampleConeReshape(mode,s+h,v,params)[side];
      return p0.map((_,i)=>(p1[i]-p0[i])/(2*h));
    };
    assert.ok(close(dot(values('source'),values('source')),metric.E));
    assert.ok(close(dot(values('target'),values('target')),metric.E));
  }
});
