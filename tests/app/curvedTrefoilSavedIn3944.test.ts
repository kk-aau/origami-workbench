import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TREFOIL_IN3944,TREFOIL_REGULARITY,projectTrefoil,
  sampleTrefoilIn3944,trefoilFrame,trefoilJets,
  type TrefoilVec3,
} from '../../src/app/curvedTrefoilSavedIn3944';

const dot=(a:TrefoilVec3,b:TrefoilVec3)=>a.reduce((sum,value,i)=>sum+value*b[i],0);
const cross=(a:TrefoilVec3,b:TrefoilVec3):TrefoilVec3=>[
  a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0],
];
const near=(actual:number,expected:number,epsilon=1e-10)=>
  assert.ok(Math.abs(actual-expected)<epsilon,`${actual} ≠ ${expected}`);

test('In[3944] uses the directly evaluated KnotData branch and exact saved constants',()=>{
  assert.equal(TREFOIL_IN3944.sourceExpression,
    '{Sin[u] + 2 Sin[2 u], Cos[u] - 2 Cos[2 u], -Sin[3 u]}');
  assert.equal(TREFOIL_IN3944.foldAngleDeg,135);
  assert.equal(TREFOIL_IN3944.orientation,1);
  assert.equal(TREFOIL_IN3944.samplingSegments,256);
  near(TREFOIL_IN3944.parameterStart,Math.PI/3);
  near(TREFOIL_IN3944.parameterEnd,7*Math.PI/3);
  assert.equal(TREFOIL_IN3944.sourceEvaluations.length,2);
  const first=trefoilFrame(Math.PI/3);
  near(first.curve[0],3*Math.sqrt(3)/2);
  near(first.curve[1],1.5);
  near(first.curve[2],0);
  near(first.speed,3*Math.sqrt(2));
  near(first.curvature,.5);
  near(first.torsion,-2/9);
  near(first.geodesicCurvature,.5*Math.cos(3*Math.PI/8));
  near(first.foldAngleDeg,135);
  const frames=sampleTrefoilIn3944();
  assert.equal(frames.length,257);
  for(let i=0;i<3;i++)near(frames[0].curve[i],frames[256].curve[i]);
});

test('closed-interval regularity identities and both local source rulings hold',()=>{
  assert.equal(TREFOIL_REGULARITY.minimumSpeedSquared,137/9);
  assert.equal(TREFOIL_REGULARITY.conservativeMinimumCrossSquared,1170);
  for(let i=0;i<=48;i++){
    const u=Math.PI/3+2*Math.PI*i/48,{d1,d2}=trefoilJets(u);
    const c=Math.cos(3*u),speedSquared=dot(d1,d1),crossSquared=dot(cross(d1,d2),cross(d1,d2));
    near(speedSquared,17+8*c+9*c*c);
    near(crossSquared,2338+248*c-776*c*c-144*c*c*c);
    assert.ok(speedSquared>=137/9-1e-10);
    assert.ok(crossSquared>=1170-1e-10);
    const frame=trefoilFrame(u);
    for(const ruling of [frame.leftRuling,frame.rightRuling]){
      near(dot(ruling,ruling),1);
      assert.ok(Number.isFinite(dot(ruling,frame.tangent)));
    }
    const shifted=trefoilFrame(Math.min(TREFOIL_IN3944.parameterEnd,u+1e-5));
    if(i===48)continue;
    for(const rulingName of ['leftRuling','rightRuling'] as const){
      const ruling=frame[rulingName],next=shifted[rulingName];
      const derivative=next.map((v,k)=>(v-ruling[k])/1e-5) as TrefoilVec3;
      // A ruled generator must remain tangent to its developable surface.
      near(dot(d1,cross(ruling,derivative)),0,3e-4);
    }
  }
});

test('local projection stays finite and invalid positions cannot become geometry',()=>{
  const frame=trefoilFrame(Math.PI/2),projected=projectTrefoil(frame.curve,-38);
  assert.ok(projected.every(Number.isFinite));
  assert.throws(()=>trefoilFrame(0),/闭区间/);
  assert.throws(()=>trefoilJets(NaN),/闭区间/);
  assert.throws(()=>sampleTrefoilIn3944(513),/采样段数/);
  assert.throws(()=>projectTrefoil(frame.curve,181),/视角/);
  assert.equal('flatCrease' in frame,false);
  assert.equal('FOLD' in frame,false);
});
