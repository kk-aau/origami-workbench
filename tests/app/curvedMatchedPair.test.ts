import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MATCHED_PAIR_SOURCE,sampleMatchedCircularPair,sampleMatchedCircularPairGrid,
  sampleSavedMatchedPair,sampleSavedMatchedPairGrid,savedMatchedPairMetric,
  validateMatchedCircleParams,
} from '../../src/app/curvedMatchedPair';

const near=(a:number,b:number,tolerance=1e-10)=>Math.abs(a-b)<=tolerance;

test('In[3865]/In[3868] saved circular curves and transverse endpoints',()=>{
  assert.equal(MATCHED_PAIR_SOURCE.psi,1);
  assert.equal(MATCHED_PAIR_SOURCE.sigma,1);
  assert.deepEqual(sampleSavedMatchedPair(0,0).flat,[2,0]);
  assert.deepEqual(sampleSavedMatchedPair(0,0).space,[1,0,1]);
  assert.ok(near(sampleSavedMatchedPair(Math.PI,0).flat[0],0));
  assert.ok(near(sampleSavedMatchedPair(Math.PI,0).flat[1],2));
  assert.ok(near(sampleSavedMatchedPair(Math.PI,0).space[0],-1));
  assert.ok(near(sampleSavedMatchedPair(0,1).space[2],1-Math.sqrt(3)/2));
  assert.ok(near(sampleSavedMatchedPair(0,-1).space[2],1+Math.sqrt(3)/2));
  assert.throws(()=>sampleSavedMatchedPair(-.01,0),/仅支持/);
  assert.throws(()=>sampleSavedMatchedPair(0,1.01),/仅支持/);
});

test('two saved ruled patches share the same first fundamental form across their full width',()=>{
  const h=1e-5;
  const dot=(a:number[],b:number[])=>a.reduce((sum,value,i)=>sum+value*b[i],0);
  for(const s of [.1,.8,1.9,Math.PI-.1])for(const v of [-.9,-.3,0,.4,.9]){
    const metric=savedMatchedPairMetric(v);
    const derivatives=([flat,space]:['flat','space'])=>{
      const p0=sampleSavedMatchedPair(s-h,v)[flat];
      const p1=sampleSavedMatchedPair(s+h,v)[flat];
      const q0=sampleSavedMatchedPair(s,v-h)[flat];
      const q1=sampleSavedMatchedPair(s,v+h)[flat];
      return [p0.map((_,i)=>(p1[i]-p0[i])/(2*h)),
        q0.map((_,i)=>(q1[i]-q0[i])/(2*h))];
    };
    for(const side of ['flat','space'] as const){
      const [ds,dv]=derivatives([side]);
      assert.ok(near(dot(ds,ds),metric.E,2e-9),`${side} E at ${s},${v}`);
      assert.ok(near(dot(ds,dv),metric.F,2e-9),`${side} F at ${s},${v}`);
      assert.ok(near(dot(dv,dv),metric.G,2e-9),`${side} G at ${s},${v}`);
    }
  }
});

test('saved display samples include both boundaries and common curve',()=>{
  const grid=sampleSavedMatchedPairGrid(20,10);
  assert.equal(grid.length,21);
  assert.equal(grid[0].length,11);
  assert.equal(grid[0][0].transverse,-1);
  assert.equal(grid[0][5].transverse,0);
  assert.equal(grid[20][10].transverse,1);
  assert.throws(()=>sampleSavedMatchedPairGrid(201,10),/采样密度/);
  assert.throws(()=>sampleSavedMatchedPairGrid(20,11),/采样密度/);
});

test('nearby unequal-radius circles retain matched continuous metrics without crossing a focal set',()=>{
  const params=validateMatchedCircleParams({flatRadius:3,spaceRadius:1.5});
  const h=1e-5;
  const dot=(a:number[],b:number[])=>a.reduce((sum,value,i)=>sum+value*b[i],0);
  for(const s of [.1,1,2.5])for(const v of [-.9,0,.9]){
    const metric=savedMatchedPairMetric(v,params);
    assert.ok(metric.E>(1-1/params.flatRadius)**2-1e-12);
    for(const side of ['flat','space'] as const){
      const p0=sampleMatchedCircularPair(s-h,v,params)[side];
      const p1=sampleMatchedCircularPair(s+h,v,params)[side];
      const q0=sampleMatchedCircularPair(s,v-h,params)[side];
      const q1=sampleMatchedCircularPair(s,v+h,params)[side];
      const ds=p0.map((_,i)=>(p1[i]-p0[i])/(2*h));
      const dv=q0.map((_,i)=>(q1[i]-q0[i])/(2*h));
      assert.ok(near(dot(ds,ds),metric.E,2e-9),`${side} E at ${s},${v}`);
      assert.ok(near(dot(ds,dv),metric.F,2e-9),`${side} F at ${s},${v}`);
      assert.ok(near(dot(dv,dv),metric.G,2e-9),`${side} G at ${s},${v}`);
    }
  }
  assert.equal(sampleMatchedCircularPairGrid(params,20,10).length,21);
  for(const patch of [{flatRadius:1,spaceRadius:1},{flatRadius:2,spaceRadius:2},
    {flatRadius:2,spaceRadius:1.98},{flatRadius:2,spaceRadius:NaN},
    {flatRadius:2,spaceRadius:0.5}])
    assert.throws(()=>validateMatchedCircleParams(patch));
});
