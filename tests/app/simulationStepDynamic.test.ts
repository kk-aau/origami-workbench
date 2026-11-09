import test from 'node:test';
import assert from 'node:assert/strict';
import {simulationTwoHingeFixture} from '../fixtures/simulationStepComplex';
import {planSimulationStepDynamic,validateSimulationStepDynamicMotion,createSimulationStepDynamicEvaluator,simulationStepDynamicAngles} from '../../src/engine/simStepDynamic';
import type {SimulationStepAnimation} from '../../src/engine/simStepAnimation';

function fixture(precrease=false){
  const {prepared,animation}=simulationTwoHingeFixture();
  const second=animation.ranges.find(r=>r.toAngle<0)!;
  // A late second crease exercises per-hinge windows and a complete
  // outward/return excursion whose endpoint angles equal its starting angles.
  if(precrease){for(const r of animation.ranges){r.viaAngle=r.toAngle;r.toAngle=0;}}
  const input:SimulationStepAnimation={...animation,motionPolicy:'allow-dynamic',collisionPolicy:'allow',timings:[{edge:second.edge,start:.5,end:1}]};
  return {prepared,animation:input,second};
}

test('dynamic continuation keeps one material topology, pins, rest lengths and deterministic arbitrary seeks',()=>{
  const {prepared,animation}=fixture(),original=Array.from(prepared.originalPositions),input=JSON.stringify(animation),topology=JSON.stringify([prepared.indices,prepared.edgesVertices,prepared.facesVertices]);
  const motion=planSimulationStepDynamic(prepared,animation,{steps:96,iterationsPerStep:640,finalIterations:3000});
  const evaluator=createSimulationStepDynamicEvaluator(prepared,animation,motion),half=evaluator.evaluate(.5),end=evaluator.evaluate(1);
  assert.equal(motion.settleStart,.9,'a verified nearby flat target gets a visible final pressing interval');
  assert.ok(motion.endAngleError<.001,'100% reaches the actual hinge angles, not just their spring targets');
  assert.ok(Math.max(...Array.from(end).filter((_,i)=>i%3===1).map(Math.abs))<1e-6,'all terminal paper vertices lie in the fixed plane');
  const pressed={...animation,dynamic:motion};
  assert.equal(simulationStepDynamicAngles(pressed,.45)[animation.ranges.findIndex(r=>r.edge===animation.timings![0].edge)],0,'the delayed hinge uses the shared folding clock before the press');
  assert.equal(simulationStepDynamicAngles(pressed,.9)[animation.ranges.findIndex(r=>r.edge===animation.timings![0].edge)],-180,'the final press holds the complete requested fold angle');
  const height=(p:number)=>Math.max(...Array.from(evaluator.evaluate(p)).filter((_,i)=>i%3===1).map(Math.abs));
  assert.ok(height(.9)>height(.95)&&height(.95)>height(1),'the residual height decreases through multiple actual poses');
  assert.ok(motion.keyframes.length>2);
  assert.ok(motion.maxEdgeStrain<.03,'an ordinary hinge strip stays close to its material dimensions');
  assert.ok(motion.maxFixedDisplacement<1e-7);
  assert.ok(half.some((n,i)=>Math.abs(n-animation.initialPositions[i])>.05),'free material really folds');
  assert.ok(end.some((n,i)=>Math.abs(n-half[i])>.05),'the delayed second hinge also participates');
  for(const p of [.74,0,.3,1,.3,.5]){
    const pose=evaluator.evaluate(p);
    for(const v of animation.fixedVertices)for(let k=0;k<3;k++)assert.ok(Math.abs(pose[3*v+k]-animation.initialPositions[3*v+k])<1e-7);
  }
  assert.deepEqual(evaluator.evaluate(.5),half,'rewinding does not depend on the last visited progress');
  assert.deepEqual(evaluator.evaluate(1),end);
  assert.deepEqual(prepared.originalPositions,Float32Array.from(original));
  assert.equal(JSON.stringify([prepared.indices,prepared.edgesVertices,prepared.facesVertices]),topology);
  assert.equal(JSON.stringify(animation),input);
});

test('precrease return targets and delayed starts have their own progress clock',()=>{
  const {prepared,animation,second}=fixture(true),i=animation.ranges.findIndex(r=>r.edge===second.edge);
  assert.equal(simulationStepDynamicAngles(animation,.49)[i],0);
  assert.equal(simulationStepDynamicAngles(animation,.75)[i],-180);
  assert.equal(simulationStepDynamicAngles(animation,1)[i],0);
  const motion=planSimulationStepDynamic(prepared,animation,{steps:32,iterationsPerStep:640,finalIterations:3000});
  const evaluator=createSimulationStepDynamicEvaluator(prepared,animation,motion);
  assert.notDeepEqual(evaluator.evaluate(.25),evaluator.evaluate(.75),'equal global/outward angles do not replace actual history-dependent geometry');
  assert.ok(evaluator.evaluate(.25).some((n,i)=>Math.abs(n-animation.initialPositions[i])>.05));
  assert.deepEqual(evaluator.evaluate(0),Float32Array.from(animation.initialPositions));
});

test('serialized numerical diagnostics are recalculated and malformed, stretched or unpinned recordings are rejected',()=>{
  const {prepared,animation}=fixture(),motion=planSimulationStepDynamic(prepared,animation,{steps:64,iterationsPerStep:640,finalIterations:2000});
  const claimed={...motion,maxEdgeStrain:0,maxAreaStrain:0,maxAngleError:0,endAngleError:0,maxFixedDisplacement:0};
  assert.deepEqual(validateSimulationStepDynamicMotion(prepared,animation,claimed),motion,'claimed error bounds have no authority');
  const mutate=(change:(m:typeof motion)=>void)=>{const copy=structuredClone(motion);change(copy);return copy;};
  assert.throws(()=>validateSimulationStepDynamicMotion(prepared,animation,mutate(m=>m.keyframes[1].positions[0]=NaN)),/发散/);
  assert.throws(()=>validateSimulationStepDynamicMotion(prepared,animation,mutate(m=>m.keyframes[1].positions.pop())),/网格/);
  assert.throws(()=>validateSimulationStepDynamicMotion(prepared,animation,mutate(m=>m.keyframes[0].positions[0]+=.01)),/操作前姿态/);
  assert.throws(()=>validateSimulationStepDynamicMotion(prepared,animation,mutate(m=>{for(let i=0;i<m.keyframes[1].positions.length;i++)m.keyframes[1].positions[i]*=2;})),/变形过大|固定/);
  assert.throws(()=>validateSimulationStepDynamicMotion(prepared,animation,mutate(m=>{for(let i=0;i<m.keyframes[1].positions.length;i+=3)m.keyframes[1].positions[i]+=.01;})),/固定/);
  assert.throws(()=>validateSimulationStepDynamicMotion(prepared,animation,mutate(m=>m.keyframes[1].progress=0)),/网格/);
  assert.throws(()=>validateSimulationStepDynamicMotion(prepared,animation,mutate(m=>m.settleStart=0)),/压平时段/);
  assert.throws(()=>validateSimulationStepDynamicMotion(prepared,animation,mutate(m=>{for(let v=0;v<m.keyframes.at(-1)!.positions.length/3;v++)if(!animation.fixedVertices.includes(v))m.keyframes.at(-1)!.positions[v*3+1]+=.001;})),/目标姿态/);
  assert.throws(()=>planSimulationStepDynamic(prepared,{...animation,motionPolicy:undefined}),/明确允许/);
  assert.throws(()=>createSimulationStepDynamicEvaluator(prepared,animation,motion).evaluate(NaN),/进度/);
});
