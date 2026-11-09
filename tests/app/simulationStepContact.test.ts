import test from 'node:test';
import assert from 'node:assert/strict';
import {simulationObstructingFlapsFixture} from '../fixtures/simulationStepComplex';
import {planSimulationStepDynamic,validateSimulationStepDynamicMotion} from '../../src/engine/simStepDynamic';
import {planVerifiedSimulationStepAnimation} from '../../src/engine/simStepPlanning';
import {createSimulationStepPathEvaluator} from '../../src/engine/simStepPath';
import type {FoldGraph} from '../../src/core/types';

test('contact protection truncates obstructing flap playback and never resumes after contact',()=>{
  const {prepared,animation}=simulationObstructingFlapsFixture();
  const input={...animation,motionPolicy:'allow-dynamic' as const,collisionPolicy:'contact' as const};
  const motion=planSimulationStepDynamic(prepared,input,{steps:32,iterationsPerStep:160,finalIterations:640,maxTimeMs:20000});
  assert.ok(motion.contactStop,'both flaps cannot continue through each other');
  assert.ok(motion.contactStop.progress>0&&motion.contactStop.progress<1);
  const at=motion.keyframes.find(frame=>frame.progress===motion.contactStop!.progress)!;
  assert.ok(motion.keyframes.filter(frame=>frame.progress>=at.progress).every(frame=>frame.positions.every((n,i)=>n===at.positions[i])));
  assert.ok(motion.endAngleError>1,'blocked paper does not advertise the requested complete fold');
  const changed=structuredClone(motion);changed.keyframes.at(-1)!.positions[0]+=.001;
  assert.throws(()=>validateSimulationStepDynamicMotion(prepared,input,changed),/碰撞停止后仍改变/);
});

test('a known intersecting initial pose is rejected rather than frozen as a valid protected animation',()=>{
  const {fold,prepared,animation}=simulationObstructingFlapsFixture();
  const planned=planVerifiedSimulationStepAnimation(fold as FoldGraph,{...animation,collisionPolicy:'allow'});
  const path=createSimulationStepPathEvaluator(prepared,planned.animation,planned.animation.motion!);
  const at=.65,initialPositions=Array.from(path.evaluate(at)),angles=path.angles(at);
  const input={...animation,initialPositions,ranges:animation.ranges.map((r,i)=>({...r,fromAngle:angles[i]})),motionPolicy:'allow-dynamic' as const,collisionPolicy:'contact' as const};
  assert.throws(()=>planSimulationStepDynamic(prepared,input,{steps:16,iterationsPerStep:80,finalIterations:80}),/操作前纸面.*碰撞保护/);
});
