import test from 'node:test';
import assert from 'node:assert/strict';
import {simulationDegreeFourFixture} from '../fixtures/simulationStepComplex';
import {simulationStepCameraBounds} from '../../src/engine/simStepCamera';
import {planSimulationStepPath,createSimulationStepPathEvaluator} from '../../src/engine/simStepPath';

test('the fixed playback camera encloses a whole nonlinear excursion even when its endpoints agree',()=>{
  const {prepared,animation}=simulationDegreeFourFixture(0,true),motion=planSimulationStepPath(prepared,animation);
  const input={...animation,motion},saved=structuredClone(input),bounds=simulationStepCameraBounds(prepared,input),path=createSimulationStepPathEvaluator(prepared,input,motion);
  for(let i=0;i<=256;i++){
    const pose=path.evaluate(i/256);
    for(let v=0;v<prepared.vertexCount;v++)assert.ok(Math.hypot(...bounds.center.map((value,axis)=>pose[v*3+axis]-value))<bounds.radius);
  }
  assert.deepEqual(input,saved,'camera preparation cannot translate or rescale the material or its pins');
});

test('translation of the whole initial material pose translates the camera without changing its scale',()=>{
  const {prepared,animation}=simulationDegreeFourFixture(0,true),motion=planSimulationStepPath(prepared,animation),input={...animation,motion};
  const bounds=simulationStepCameraBounds(prepared,input),offset=[4,-3,6];
  const shifted={...input,initialPositions:input.initialPositions.map((v,i)=>v+offset[i%3])};
  const translated=simulationStepCameraBounds(prepared,shifted);
  for(let axis=0;axis<3;axis++)assert.ok(Math.abs(translated.center[axis]-bounds.center[axis]-offset[axis])<1e-6);
  assert.ok(Math.abs(translated.radius-bounds.radius)<1e-6);
});
