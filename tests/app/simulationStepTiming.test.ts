import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulationStepPathEvaluator,planSimulationStepPath,simulationStepMotionAngles,validateSimulationStepMotion,SimulationStepPathError} from '../../src/engine/simStepPath';
import {validateSimulationStepAnimation,simulationStepFoldProfile} from '../../src/engine/simStepAnimation';
import type {SimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {simulationDegreeFourFixture,simulationTwoHingeFixture} from '../fixtures/simulationStepComplex';

const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} should equal ${b}`);
const active=(animation:SimulationStepAnimation)=>animation.ranges.filter(r=>r.fromAngle!==r.toAngle||r.viaAngle!==undefined&&r.viaAngle!==r.fromAngle);
const windows=(animation:SimulationStepAnimation,delay:number)=>{
  const [a,b]=active(animation),duration=1+delay;
  return [{edge:a.edge,start:0,end:1/duration},{edge:b.edge,start:delay/duration,end:1}];
};

for(const delay of [0,.8,1])test(`the second crease starts at the first crease's ${delay*100}% without changing its requested endpoint`,()=>{
  const {prepared,animation}=simulationTwoHingeFixture();animation.timings=windows(animation,delay);
  const motion=planSimulationStepPath(prepared,animation),path=createSimulationStepPathEvaluator(prepared,animation,motion),[a,b]=active(animation);
  const ai=prepared.creaseParams.findIndex(c=>c.edge===a.edge),bi=prepared.creaseParams.findIndex(c=>c.edge===b.edge),start=animation.timings[1].start,finish=animation.timings[0].end;
  assert.equal(motion.method,'scheduled');
  near(path.angles(start)[ai],a.toAngle*delay);near(path.angles(start)[bi],0);
  if(start>0){near(path.angles(start/2)[bi],0);near(path.angles(start-1e-6)[bi],0);}
  near(path.angles(finish)[ai],a.toAngle);near(path.angles((start+1)/2)[bi],b.toAngle/2);
  assert.deepEqual(path.angles(1),prepared.creaseParams.map(c=>c.targetAngle));
  for(const progress of [0,.413,.1,1,.9,start,.5,finish,.1,0]){
    const pose=path.evaluate(progress),angles=path.angles(progress);
    assert.ok(path.mechanism.evaluateAngles(angles).maxResidual<2e-5,'every independently requested pose retains material closure');
    for(const vertex of animation.fixedVertices)for(let axis=0;axis<3;axis++)assert.equal(pose[vertex*3+axis],Math.fround(animation.initialPositions[vertex*3+axis]));
    assert.deepEqual(path.angles(progress),simulationStepMotionAngles(motion,progress));
  }
  const validated=validateSimulationStepAnimation({...animation,motion},prepared,animation.sourceSignature);
  for(const p of [start/2,start,(start+1)/2,1]){
    const profile=simulationStepFoldProfile(validated,p),angles=path.angles(p);
    for(const edge of [a.edge,b.edge])near(profile.ranges.find(r=>r.edge===edge)!.toAngle,angles[prepared.creaseParams.findIndex(c=>c.edge===edge)]);
  }
});

test('a delayed precrease window contains its own complete fold and return, including exact seekable apex',()=>{
  const {prepared,animation}=simulationTwoHingeFixture();
  animation.ranges=animation.ranges.map(r=>({...r,toAngle:0,viaAngle:r.toAngle}));animation.timings=windows(animation,.8);
  const motion=planSimulationStepPath(prepared,animation),path=createSimulationStepPathEvaluator(prepared,animation,motion),[a,b]=active(animation);
  for(const range of [a,b]){
    const window=animation.timings.find(t=>t.edge===range.edge)!,index=prepared.creaseParams.findIndex(c=>c.edge===range.edge),apex=(window.start+window.end)/2;
    near(path.angles(window.start)[index],0);near(path.angles(apex)[index],range.viaAngle!);near(path.angles(window.end)[index],0);
    near(path.angles(window.start+(window.end-window.start)*.25)[index],range.viaAngle!/2);
    near(path.angles(window.start+(window.end-window.start)*.75)[index],range.viaAngle!/2);
    assert.ok(motion.phases.some(p=>p.end===apex),'every precrease peak remains an explicit phase boundary');
  }
  for(const progress of [.01,.8,.31,1,0,.75,.31])path.evaluate(progress);
  assert.deepEqual(Array.from(path.evaluate(1)),Array.from(path.evaluate(0)));
});

test('unspecified active creases retain the default full timeline while a selected crease is delayed',()=>{
  const {prepared,animation}=simulationTwoHingeFixture(),[a,b]=active(animation);
  animation.timings=[{edge:b.edge,start:.75,end:1}];
  const path=createSimulationStepPathEvaluator(prepared,animation,planSimulationStepPath(prepared,animation));
  const ai=prepared.creaseParams.findIndex(c=>c.edge===a.edge),bi=prepared.creaseParams.findIndex(c=>c.edge===b.edge);
  near(path.angles(.5)[ai],a.toAngle/2);near(path.angles(.5)[bi],0);near(path.angles(.875)[bi],b.toAngle/2);
});

test('a scheduled serialized path cannot ignore changed timing, a delayed start, or its scheduling method',()=>{
  const {prepared,animation}=simulationTwoHingeFixture();animation.timings=windows(animation,.8);
  const original=planSimulationStepPath(prepared,animation);
  const earlier={...animation,timings:windows(animation,.5)};
  assert.throws(()=>validateSimulationStepMotion(prepared,earlier,original),/自定义.*时序/);
  const simultaneous={...animation};delete simultaneous.timings;
  assert.throws(()=>validateSimulationStepMotion(prepared,animation,planSimulationStepPath(prepared,simultaneous)),/自定义.*时序/);
  const forged=structuredClone(original);forged.method='simultaneous';
  assert.throws(()=>validateSimulationStepMotion(prepared,animation,forged),/自定义.*时序/);
  assert.throws(()=>validateSimulationStepMotion(prepared,simultaneous,original),/缺少折痕启动/);
});

test('invalid timing windows and inactive or missing crease references fail before path search',()=>{
  const {prepared,animation}=simulationTwoHingeFixture(),edge=active(animation)[0].edge;
  for(const timings of [[],[{edge,start:-.01,end:1}],[{edge,start:0,end:1.01}],[{edge,start:.8,end:.8}],[{edge,start:.9,end:.2}],[{edge,start:NaN,end:1}],[{edge,start:0,end:Infinity}],[{edge:99999,start:0,end:1}],[{edge,start:0,end:1},{edge,start:.1,end:1}]]){
    const input={...animation,timings};
    assert.throws(()=>validateSimulationStepAnimation(input,prepared,animation.sourceSignature),/时段|启动|活动|参与/);
    assert.throws(()=>planSimulationStepPath(prepared,input),/时段|参与|边界/);
  }
  const inactive={...animation,ranges:animation.ranges.map(r=>({...r,toAngle:0})),timings:[{edge,start:0,end:1}]};
  assert.throws(()=>planSimulationStepPath(prepared,inactive),/参与运动/);
});

test('an impossible independent delay of a coupled material vertex reports the actual timing constraint instead of changing the schedule',()=>{
  const {prepared,animation}=simulationDegreeFourFixture();
  animation.timings=[{edge:animation.ranges[0].edge,start:.5,end:1}];
  let checks=0;
  assert.throws(()=>planSimulationStepPath(prepared,animation,{checkPath(){checks++;return {status:'clear'};}}),error=>error instanceof SimulationStepPathError&&error.reason==='geometry'&&/几何耦合.*独立延迟/.test(error.message));
  assert.equal(checks,0,'collision permission cannot turn a broken material loop into a valid path');
});

for(const precrease of [false,true])test(`a common participation window retains the nonlinear coupled ${precrease?'precrease':'folding'} branch`,()=>{
  const {prepared,animation}=simulationDegreeFourFixture(0,precrease),original=planSimulationStepPath(prepared,animation),reference=createSimulationStepPathEvaluator(prepared,animation,original);
  animation.timings=active(animation).map(r=>({edge:r.edge,start:.2,end:.8}));
  const motion=planSimulationStepPath(prepared,animation),path=createSimulationStepPathEvaluator(prepared,animation,motion);
  assert.equal(motion.method,'scheduled');assert.ok(motion.phases.some(p=>p.kind==='tangent'),'equal windows must not replace a physical nonlinear branch with independent linear hinge angles');
  assert.deepEqual(path.angles(.1),reference.angles(0));assert.deepEqual(path.angles(.9),reference.angles(1));
  for(const local of [0,.01,.17,.5,.71,.99,1]){
    const progress=.2+.6*local,a=path.angles(progress),b=reference.angles(local);
    a.forEach((angle,i)=>near(angle,b[i]));path.evaluate(progress);
  }
  if(precrease)path.angles(.5).forEach((angle,i)=>near(angle,animation.ranges[i].viaAngle!));
  const validated=validateSimulationStepAnimation({...animation,motion},prepared,animation.sourceSignature);
  assert.equal(validated.motion!.method,'scheduled');
});

test('an explicit schedule is checked once and never silently reordered by a collision checker',()=>{
  const {prepared,animation}=simulationTwoHingeFixture();animation.timings=windows(animation,.8);
  for(const status of ['collision','inconclusive'] as const){
    let checks=0;
    assert.throws(()=>planSimulationStepPath(prepared,animation,{checkPath(_path,motion){checks++;assert.equal(motion.method,'scheduled');return {status};}}),error=>error instanceof SimulationStepPathError&&error.reason===status);
    assert.equal(checks,1);
  }
});
