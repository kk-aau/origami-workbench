import test from 'node:test';
import assert from 'node:assert/strict';
import {CONIC_OPTICAL_EXAMPLES,conicOpticalFrameAt,sampleConicOptical,type ConicCell}
  from '../../src/app/curvedConicOptical';

const near=(actual:number,expected:number,tolerance=1e-12)=>
  assert.ok(Math.abs(actual-expected)<tolerance,`${actual} ≠ ${expected}`);

test('the six source cells and their focus, cross-curve, interval inputs remain exact',()=>{
  assert.deepEqual(CONIC_OPTICAL_EXAMPLES.map(x=>[x.cell,x.leftFocus,x.rightFocus,x.leftCross,x.rightCross,x.end]),[
    ['In[4020]',null,null,-1,1,Math.PI/2],
    ['In[4021]',-1,-1,-.5,.5,Math.PI/2],
    ['In[4022]',null,-1,-1.5,1.5,Math.PI/2],
    ['In[4023]',-1,null,-.5,1,Math.PI/2],
    ['In[4024]',-2,-1,-1.5,1,Math.PI/2],
    ['In[4025]',-2,1,-1.5,.5,Math.PI/4],
  ]);
  for(const item of CONIC_OPTICAL_EXAMPLES){
    assert.throws(()=>conicOpticalFrameAt(item.cell,-.01));
    assert.throws(()=>conicOpticalFrameAt(item.cell,item.end+.01));
  }
});

test('saved curves match independently simplified source anchors',()=>{
  const q=Math.PI/4;
  const anchors:[ConicCell,number,[number,number]][]=[
    ['In[4020]',Math.PI/2,[0,Math.PI/2]],
    ['In[4021]',Math.PI/2,[-1,1]],
    ['In[4022]',Math.PI/2,[-(Math.PI**2)/16,Math.PI/2]],
    ['In[4023]',Math.PI/2,[-(Math.PI**2)/16,Math.PI/2]],
    ['In[4024]',Math.PI/2,[-2,4/3]],
    ['In[4025]',q,[-2+4*Math.cos(q)/(-1+3*Math.cos(q)),
      4*Math.sin(q)/(-1+3*Math.cos(q))]],
  ];
  for(const [cell,t,expected] of anchors){
    const origin=conicOpticalFrameAt(cell,0);near(origin.fold[0],0);near(origin.fold[1],0);
    const end=conicOpticalFrameAt(cell,t);near(end.fold[0],expected[0]);near(end.fold[1],expected[1]);
  }
  const ellipse=conicOpticalFrameAt('In[4024]',Math.PI/2);
  near(ellipse.secondLeft[0],-2);near(ellipse.secondLeft[1],.5);
  near(ellipse.secondRight[0],-2.2);near(ellipse.secondRight[1],1.6);
});

test('all saved branches satisfy their independent conic, optical-ray and unit-director checks',()=>{
  for(const {cell} of CONIC_OPTICAL_EXAMPLES){
    const sample=sampleConicOptical(cell);
    assert.equal(sample.frames.length,97);
    assert.ok(sample.maxConicResidual<1e-12);
    assert.ok(sample.maxRayCollinearityResidual<1e-12);
    assert.ok(sample.maxDirectorUnitResidual<1e-12);
    assert.equal(sample.exactStraightCreaseFOLD,false);
    assert.equal(sample.deploymentPathChecked,false);
    assert.equal(sample.selfCollisionChecked,false);
    assert.equal(sample.machineReadableWolframOut,false);
  }
});

test('the paired parabola examples share the fold, but not the ray/directrix assignment',()=>{
  for(const t of [0,.3,.8,Math.PI/2]){
    const left=conicOpticalFrameAt('In[4022]',t);
    const right=conicOpticalFrameAt('In[4023]',t);
    near(left.fold[0],right.fold[0]);near(left.fold[1],right.fold[1]);
    near(left.directrixLeft[0],-1.5);near(right.directrixRight[0],1);
    near(left.directrixRight[0],-1);near(right.directrixLeft[0],-1);
    assert.notDeepEqual(left.secondLeft,right.secondLeft);
  }
});
