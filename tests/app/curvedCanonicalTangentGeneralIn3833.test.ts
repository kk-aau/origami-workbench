import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalDirectrix,canonicalDirector,crossCurvePoint,developablePoint,
  firstForm,flatCrossPoint,flatSavedPlotPoint,plotV,sampleSaved,savedInput,
  savedPlotPoint,seedDirectrix,sourceDirectrix,sourceDirector,sourcePoint,
  type SavedCase,
} from '../../src/app/curvedCanonicalTangentGeneralIn3833';

const cases:SavedCase[]=['tangent-clipped-3833','tangent-both-3834',
  'general-cylinder-3837','general-cone-3838','general-tangent-3839'];
const close=(a:number,b:number,tol=1e-8)=>
  assert.ok(Math.abs(a-b)<tol,`${a} ≠ ${b}`);
const dot=(a:number[],b:number[])=>a.reduce((s,x,i)=>s+x*b[i],0);
const dist=(a:number[],b:number[])=>Math.hypot(...a.map((x,i)=>x-b[i]));
const partial=(f:(u:number,v:number)=>number[],u:number,v:number,axis:'u'|'v')=>{
  const h=1e-5,a=f(u+(axis==='u'?h:0),v+(axis==='v'?h:0)),
    b=f(u-(axis==='u'?h:0),v-(axis==='v'?h:0));
  return a.map((x,i)=>(x-b[i])/(2*h));
};

test('all five cells retain their original function, plot range and limits',()=>{
  assert.deepEqual(cases.map(k=>savedInput(k).sourceCell),
    ['In[3833]','In[3834]','In[3837]','In[3838]','In[3839]']);
  for(const kind of cases){
    const s=savedInput(kind);
    assert.deepEqual(s.uRange,[0,Math.PI]);
    assert.equal(s.flatDevelopmentDerivedLocally,true);
    for(const key of ['numericWolframOutAvailable','exactStraightCreaseFOLD',
      'adoptableCreasePattern','motionVerified','selfCollisionVerified'] as const)
      assert.equal(s[key],false);
    close(Math.hypot(...sourceDirector(kind,.7)),1);
  }
  assert.deepEqual(savedInput('general-cylinder-3837').vRange,[-1,1]);
  assert.deepEqual(savedInput('general-cone-3838').vRange,[0,1]);
  assert.deepEqual(savedInput('tangent-both-3834').vRange,[0,Math.PI]);
  assert.equal(savedInput('tangent-clipped-3833').sourceFunction,
    'CanonicalTangentDevelopableSystem');
  assert.equal(savedInput('general-tangent-3839').sourceFunction,
    'CanonicalDevelopableSystem');
  assert.throws(()=>savedInput('other' as SavedCase));
});

test('source projection and striction recover the known directrix and each infinite ruling',()=>{
  for(const kind of cases)for(const u of [.2,.7,1.5,2.6]){
    const seed=seedDirectrix(kind,u),base=canonicalDirectrix(kind,u),
      director=canonicalDirector(kind,u);
    close(dist(seed,base),0);
    for(const w of [-.3,0,.8])close(dist(sourcePoint(kind,u,w),
      developablePoint(kind,u,w+(kind.startsWith('general-')?u:0))),0);
    if(kind.startsWith('general-')){
      const raw=sourceDirectrix(kind,u),actualShift=dot(raw.map((x,i)=>x-seed[i]),director);
      close(actualShift,u);
      if(kind==='general-cylinder-3837')close(dot(raw,director),u);
      else{
        const h=1e-5;
        const bp=sourceDirectrix(kind,u+h),bm=sourceDirectrix(kind,u-h),
          dp=sourceDirector(kind,u+h),dm=sourceDirector(kind,u-h),
          bu=bp.map((x,i)=>(x-bm[i])/(2*h)),
          du=dp.map((x,i)=>(x-dm[i])/(2*h));
        close(dot(bu,du)/dot(du,du),u,1e-8);
      }
    }
  }
});

test('cross-curve parameter, saved branch clipping and regression are explicit',()=>{
  for(const kind of cases)for(const u of [.4,1.2,2.4]){
    const v=kind==='general-cylinder-3837'?.3:
      kind==='general-cone-3838'?.4:Math.min(Math.PI,u+.3);
    close(dist(crossCurvePoint(kind,u,v),developablePoint(kind,u,
      kind.includes('tangent')?v-u:v)),0);
  }
  for(const kind of ['tangent-clipped-3833','general-tangent-3839'] as SavedCase[]){
    const u=1.2,v=.5;
    close(dist(savedPlotPoint(kind,u,v),canonicalDirectrix(kind,u)),0);
    close(dist(flatSavedPlotPoint(kind,u,v),flatCrossPoint(kind,u,u)),0);
    close(plotV(kind,u,0),u);
    close(plotV(kind,u,1),Math.PI);
  }
  assert.ok(dist(savedPlotPoint('tangent-both-3834',1.2,.5),
    canonicalDirectrix('tangent-both-3834',1.2))>.1);
  assert.equal(firstForm('tangent-both-3834',1.2,1.2).regular,false);
  assert.equal(firstForm('general-cone-3838',1.2,0).regular,false);
  assert.equal(firstForm('general-cylinder-3837',1.2,0).regular,true);
});

test('3D canonical plot and locally derived flat plot share the full first form',()=>{
  const points:[SavedCase,number,number][]=[
    ['tangent-clipped-3833',.6,1.1],['tangent-both-3834',1.2,.5],
    ['tangent-both-3834',1.2,2],['general-cylinder-3837',1.2,-.4],
    ['general-cone-3838',1.2,.6],['general-tangent-3839',.6,1.7],
  ];
  for(const [kind,u,v] of points){
    const form=firstForm(kind,u,v);
    assert.equal(form.regular,true);
    for(const f of [crossCurvePoint,flatCrossPoint]){
      const fn=(a:number,b:number)=>f(kind,a,b);
      const pu=partial(fn,u,v,'u'),pv=partial(fn,u,v,'v');
      close(dot(pu,pu),form.E,2e-9);
      close(dot(pu,pv),form.F,2e-9);
      close(dot(pv,pv),form.G,2e-9);
    }
  }
});

test('bounded samples are display geometry, including both and clipped branches',()=>{
  for(const kind of cases){
    const s=sampleSaved(kind,32,8);
    assert.equal(s.plotGrid.length,9);
    assert.equal(s.plotGrid[0].length,33);
    assert.equal(s.flatGrid.length,9);
    assert.equal(s.input.exactStraightCreaseFOLD,false);
  }
  assert.throws(()=>sampleSaved('tangent-both-3834',8));
  assert.throws(()=>plotV('general-cone-3838',1,.5+1));
});
