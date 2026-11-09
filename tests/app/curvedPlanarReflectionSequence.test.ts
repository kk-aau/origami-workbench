import test from 'node:test';
import assert from 'node:assert/strict';
import {cutDistances,flatPoint,metric,sampleSequence,savedCurve,
  sequenceInput,stageSurface,type ReflectionSequenceCase} from '../../src/app/curvedPlanarReflectionSequence';

const cases:ReflectionSequenceCase[]=['cone-symbolic','cylinder-symbolic','cone-numeric-input'];
const distance=(a:number[],b:number[])=>Math.hypot(...a.map((x,i)=>x-b[i]));
const dot=(a:number[],b:number[])=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const partial=(fn:(u:number,v:number)=>number[],u:number,v:number,du:number,dv:number)=>{
  const h=1e-5,a=fn(u+h*du,v+h*dv),b=fn(u-h*du,v-h*dv);
  return a.map((x,i)=>(x-b[i])/(2*h));
};

test('three saved inputs preserve plane list, ranges and ComposeReflections',()=>{
  const cone=sequenceInput('cone-symbolic'),cylinder=sequenceInput('cylinder-symbolic');
  const numeric=sequenceInput('cone-numeric-input');
  assert.deepEqual(cone.sourceCells,['In[4038]','In[4039]']);
  assert.deepEqual(cylinder.sourceCells,['In[4038]','In[4040]']);
  assert.deepEqual(numeric.sourceCells,['In[4042]','In[4043]']);
  assert.equal(cone.composeReflections,true);
  assert.equal(cylinder.composeReflections,false);
  assert.equal(numeric.composeReflections,true);
  assert.deepEqual(cone.uRange,[0,Math.PI]);
  assert.deepEqual(cylinder.uRange,[-Math.PI/4,Math.PI/4]);
  assert.deepEqual([cone.planes.length,cylinder.planes.length],[4,2]);
  assert.ok(Math.abs(cone.planes[1].normal[1]+Math.sin(Math.PI/18))<1e-14);
  assert.ok(Math.abs(cone.planes[2].normal[0]-Math.sin(Math.PI/18))<1e-14);
  for(const kind of cases){
    const input=sequenceInput(kind);
    assert.equal(input.continuousLocalIsometryVerified,true);
    for(const key of ['numericInterpolationReproduced','exactStraightCreaseFOLD',
      'adoptableCreasePattern','mountainValleyVerified','layerOrderVerified',
      'motionVerified','selfCollisionVerified'] as const)assert.equal(input[key],false);
  }
});

test('saved cut curves are ordered and match exact cone and cylinder formulas',()=>{
  const s=.5,c=Math.cos(Math.PI/6),st=Math.sin(Math.PI/18),ct=Math.cos(Math.PI/18);
  for(let i=0;i<=64;i++){
    const u=Math.PI*i/64,a=cutDistances('cone-symbolic',u);
    const expected=[0,1/c,2*ct/(c*ct-s*st*Math.sin(u)),
      3*ct/(c*ct+s*st*Math.cos(u)),4/c];
    assert.ok(distance(a,expected)<1e-11);
    assert.ok(a.every((v,j)=>j===0||v>a[j-1]));
    assert.deepEqual(a,cutDistances('cone-numeric-input',u));
    const uc=-Math.PI/4+i*Math.PI/128,b=cutDistances('cylinder-symbolic',uc);
    assert.ok(distance(b,[0,Math.cos(uc),1+Math.cos(uc),3])<1e-11);
    assert.ok(b.every((v,j)=>j===0||v>b[j-1]));
  }
});

test('adjacent reflected 3D patches share all curved crease points',()=>{
  for(const kind of cases){
    const input=sequenceInput(kind),[lo,hi]=input.uRange;
    for(let i=0;i<=16;i++){
      const u=lo+(hi-lo)*i/16,cuts=cutDistances(kind,u);
      for(let fold=1;fold<=input.planes.length;fold++){
        const before=stageSurface(kind,u,cuts[fold],fold-1);
        const after=stageSurface(kind,u,cuts[fold],fold);
        assert.ok(distance(before,after)<1e-12);
        assert.ok(distance(before,savedCurve(kind,u,fold))<1e-12);
      }
      if(kind==='cylinder-symbolic')assert.ok(distance(savedCurve(kind,u,3),
        stageSurface(kind,u,3,2))<1e-12);
    }
  }
});

test('each smooth 2D and 3D patch has the same first fundamental form',()=>{
  for(const kind of cases){
    const [lo,hi]=sequenceInput(kind).uRange;
    for(const fraction of [.2,.5,.8]){
      const u=lo+(hi-lo)*fraction,cuts=cutDistances(kind,u);
      for(let stage=0;stage<cuts.length-1;stage++){
        const v=(cuts[stage]+cuts[stage+1])/2,want=metric(kind,v);
        for(const fn of [(uu:number,vv:number)=>stageSurface(kind,uu,vv,stage),
                          (uu:number,vv:number)=>flatPoint(kind,uu,vv)]){
          const pu=partial(fn,u,v,1,0),pv=partial(fn,u,v,0,1);
          assert.ok(Math.abs(dot(pu,pu)-want.E)<2e-8);
          assert.ok(Math.abs(dot(pu,pv))<2e-8);
          assert.ok(Math.abs(dot(pv,pv)-want.G)<2e-8);
        }
        assert.equal(want.regular,true);
      }
    }
  }
  assert.equal(metric('cone-symbolic',0).regular,false);
  assert.equal(metric('cylinder-symbolic',0).regular,true);
});

test('display samples and numeric-input replay never create a FOLD candidate',()=>{
  for(const kind of cases){
    const sample=sampleSequence(kind,32),count=sample.input.curveCount;
    assert.equal(sample.uValues.length,33);
    assert.equal(sample.curves3D.length,count);
    assert.equal(sample.curves2D.length,count);
    assert.ok(sample.curves3D.every(curve=>curve.length===33));
    assert.equal('faces_vertices' in sample,false);
  }
  for(const u of [0,Math.PI/7,Math.PI/2,Math.PI])
    for(let stage=0;stage<5;stage++)
      assert.deepEqual(stageSurface('cone-symbolic',u,2,stage),
        stageSurface('cone-numeric-input',u,2,stage));
  assert.throws(()=>sampleSequence('cone-symbolic',8));
  assert.throws(()=>cutDistances('cone-symbolic',Math.PI+.1));
});
