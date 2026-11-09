import test from 'node:test';
import assert from 'node:assert/strict';
import {planVerifiedSimulationStepAnimation} from '../../src/engine/simStepPlanning';
import {createSimulationStepPathEvaluator,simulationStepMotionAngles} from '../../src/engine/simStepPath';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {validateSimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {simulationDegreeFourFixture,simulationObstructingFlapsFixture,simulationTwoHingeFixture,diagramComplexAnimationFixture} from '../fixtures/simulationStepComplex';
import {diagramSingleLayerCornerFixture} from '../fixtures/diagramStepAnimationScope';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import type {FoldGraph} from '../../src/core/types';

test('production planning replaces the real colliding flap motion with a continuously clear folding order',()=>{
  const {fold,prepared,animation}=simulationObstructingFlapsFixture(),input=structuredClone(animation),originalFold=structuredClone(fold),messages:string[]=[];
  const result=planVerifiedSimulationStepAnimation(fold as FoldGraph,animation,message=>messages.push(message));
  assert.equal(result.method,'sequential');assert.ok(result.checkedIntervals>=2);assert.ok(messages.length>=2);
  assert.deepEqual(animation,input,'planning does not write motion metadata into the saved step');
  assert.deepEqual(fold,originalFold,'avoidance timing does not change the user-requested CP');
  const validated=validateSimulationStepAnimation(result.animation,prepared,animation.sourceSignature);
  assert.deepEqual(validated.initialPositions,animation.initialPositions);assert.deepEqual(validated.fixedVertices,animation.fixedVertices);assert.deepEqual(validated.ranges,animation.ranges);
  const path=createSimulationStepPathEvaluator(prepared,result.animation,result.animation.motion!);
  assert.deepEqual(path.angles(0),animation.ranges.map(r=>r.fromAngle));assert.deepEqual(path.angles(1),prepared.creaseParams.map(c=>c.targetAngle));
});

test('simple existing step plans preserve their initial material pose, pins and requested hinge angles',()=>{
  const {fold,prepared,animation}=simulationTwoHingeFixture(),result=planVerifiedSimulationStepAnimation(fold as FoldGraph,animation);
  assert.equal(result.method,'simultaneous');assert.ok(result.checkedIntervals>0);
  assert.deepEqual(result.animation.initialPositions,animation.initialPositions);assert.deepEqual(result.animation.fixedVertices,animation.fixedVertices);
  assert.deepEqual(result.animation.ranges,animation.ranges);
  const middle=simulationStepMotionAngles(result.animation.motion!,.5);
  assert.deepEqual(middle,prepared.creaseParams.map(c=>c.targetAngle*.5));
});

test('production planning continuously certifies a real nonlinear four-crease mechanism and its precrease return',()=>{
  for(const precrease of [false,true]){
    const {fold,prepared,animation}=simulationDegreeFourFixture(0,precrease),result=planVerifiedSimulationStepAnimation(fold as FoldGraph,animation);
    assert.equal(result.method,'coupled');assert.ok(result.checkedIntervals>0);
    const path=createSimulationStepPathEvaluator(prepared,result.animation,result.animation.motion!),middle=path.angles(precrease?.25:.5);
    assert.ok(Math.max(...middle.map(Math.abs))-Math.min(...middle.map(Math.abs))>20);
    if(precrease)assert.deepEqual(Array.from(path.evaluate(0)),Array.from(path.evaluate(1)));
  }
});

test('a drawn nonlinear step and precrease retain their coupled paths after CP mapping and diagram round-trip',()=>{
  for(const precrease of [false,true]){
    const fixture=diagramComplexAnimationFixture('coupled',precrease),project=importDiagramProject(exportDiagramProject(fixture.project)),clip=buildDiagramStepAnimation(project,fixture.stepId);
    const result=planVerifiedSimulationStepAnimation(clip.fold,clip.animation,undefined,{initialGeometry:clip.initialGeometry});
    assert.equal(result.method,'coupled');assert.ok(result.checkedIntervals>0);
    assert.deepEqual(result.animation.initialPositions,clip.animation.initialPositions);assert.deepEqual(result.animation.fixedVertices,clip.animation.fixedVertices);
  }
});

test('the drawn two-flap step retains safe sequential folding after CP mapping and file round-trip',()=>{
  const fixture=diagramComplexAnimationFixture('sequential'),project=importDiagramProject(exportDiagramProject(fixture.project)),clip=buildDiagramStepAnimation(project,fixture.stepId);
  const result=planVerifiedSimulationStepAnimation(clip.fold,clip.animation);
  assert.equal(result.method,'sequential');assert.ok(result.checkedIntervals>=2);
  assert.deepEqual(result.animation.ranges,clip.animation.ranges);assert.deepEqual(result.animation.fixedVertices,clip.animation.fixedVertices);
});

test('single-layer scope remains unchanged through diagram export/import and production path planning',()=>{
  const fixture=diagramSingleLayerCornerFixture(),project=importDiagramProject(exportDiagramProject(fixture.project)),clip=buildDiagramStepAnimation(project,fixture.stepId);
  const originalProject=exportDiagramProject(project),result=planVerifiedSimulationStepAnimation(clip.fold,clip.animation,undefined,{initialGeometry:clip.initialGeometry}),{prepared}=prepareSimulationDocument(clip.fold);
  assert.equal(result.method,'simultaneous');assert.ok(result.checkedIntervals>0);assert.equal(exportDiagramProject(project),originalProject);
  const path=createSimulationStepPathEvaluator(prepared,result.animation,result.animation.motion!);
  for(const p of [.1,.5,.9,1,0]){
    const positions=path.evaluate(p);
    for(const v of clip.animation.fixedVertices)for(let axis=0;axis<3;axis++)assert.ok(positions[v*3+axis]===Math.fround(clip.animation.initialPositions[v*3+axis]));
  }
  assert.deepEqual(result.animation.ranges,clip.animation.ranges);assert.deepEqual(result.animation.fixedVertices,clip.animation.fixedVertices);
});

test('untrusted externally supplied motion metadata is removed and independently planned again',()=>{
  const {fold,animation}=simulationObstructingFlapsFixture(),external=structuredClone(animation);
  external.motion={version:1,method:'simultaneous',phases:[],knots:[],maxClosureResidual:0};
  const original=structuredClone(external),result=planVerifiedSimulationStepAnimation(fold as FoldGraph,external);
  assert.equal(result.method,'sequential');assert.ok(result.checkedIntervals>0);assert.ok(result.animation.motion!.phases.length>0);
  assert.deepEqual(external,original,'discarding stale or forged motion must not mutate caller data');
});
