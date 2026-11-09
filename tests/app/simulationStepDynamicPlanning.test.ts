import test from 'node:test';
import assert from 'node:assert/strict';
import {planVerifiedSimulationStepAnimation} from '../../src/engine/simStepPlanning';
import {seedSimulationStepAnimation,validateSimulationStepAnimation,type SimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {createSimulationStepDynamicEvaluator} from '../../src/engine/simStepDynamic';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import {simulationStepAggregationFixture} from '../fixtures/simulationStepAggregation';
import {simulationDegreeFourFixture,simulationTwoHingeFixture} from '../fixtures/simulationStepComplex';
import {exportDiagramProject} from '../../src/app/diagramProject';
import type {FoldGraph} from '../../src/core/types';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {refineSimulationStepForBending} from '../../src/engine/simStepBending';

test('the actual eight-vertex aggregation obtains a seekable numerical trajectory without changing its CPs or fixed paper',()=>{
  const {project,clip}=simulationStepAggregationFixture(),savedProject=exportDiagramProject(project),savedClip=structuredClone(clip);
  const messages:string[]=[],result=planVerifiedSimulationStepAnimation(clip.fold,{...clip.animation,collisionPolicy:'allow',motionPolicy:'allow-dynamic'},message=>messages.push(message),{initialGeometry:clip.initialGeometry});
  assert.equal(result.method,'dynamic');assert.equal(result.checkedIntervals,0,'numerical playback never claims a continuous rigid collision certificate');
  assert.equal(result.fold,undefined,'a valid original-panel trajectory must not be replaced by a refined bending mesh');
  assert.ok(result.animation.dynamic);assert.equal(result.animation.motion,undefined);assert.equal(result.animation.flex,undefined);
  assert.ok(result.warnings?.some(message=>/数值求解|数值模拟/.test(message)&&/误差|偏差/.test(message)));
  assert.ok(messages.some(message=>/数值求解/.test(message)));
  const expected=result.fold?refineSimulationStepForBending(clip.fold,clip.animation).animation:clip.animation;
  const {prepared}=prepareSimulationDocument(result.fold??clip.fold);
  assert.deepEqual(result.animation.initialPositions,expected.initialPositions);
  assert.deepEqual(result.animation.fixedVertices,expected.fixedVertices);assert.deepEqual(result.animation.ranges,expected.ranges);
  assert(result.animation.dynamic!.maxEdgeStrain<=(result.animation.materialMode==='bendable'?.04:.12));
  assert(result.animation.dynamic!.maxAreaStrain<=(result.animation.materialMode==='bendable'?.08:.25));
  assert.deepEqual(result.animation.layerTimeline?.at(-1)?.faceOrders,[],'an approximate endpoint cannot invent a flat stacking certificate');
  const valid=validateSimulationStepAnimation(result.animation,prepared,expected.sourceSignature),evaluator=createSimulationStepDynamicEvaluator(prepared,valid,valid.dynamic!);
  const model=new OrigamiModel(prepared),rest=model.originalPositions.slice(),solver=new ReferenceSolver(model,{timeStepScale:.35,damping:.5});
  try{
    const seek=seedSimulationStepAnimation(solver,valid);assert.equal(typeof seek,'function');
    assert.deepEqual(model.positions,Float32Array.from(expected.initialPositions));
    let remembered:Float32Array|undefined;
    for(const progress of [0,.2,.75,.15,1,.5,0,.9,.5]){
      seek!(progress);solver.step(1);
      assert.deepEqual(model.positions,evaluator.evaluate(progress),'playback evaluates recorded progress rather than re-solving from the previous pose');
      for(const vertex of expected.fixedVertices)for(let axis=0;axis<3;axis++)assert.ok(model.positions[vertex*3+axis]===Math.fround(expected.initialPositions[vertex*3+axis]));
      if(progress===.5){if(remembered)assert.deepEqual(model.positions,remembered);else remembered=model.positions.slice();}
    }
    assert.ok(valid.dynamic!.keyframes.some(frame=>frame.positions.some((value,i)=>i%3===1&&Math.abs(value-expected.initialPositions[i])>.01)),'the aggregation actually leaves the unfolded plane');
    assert.deepEqual(model.originalPositions,rest,'recorded playback preserves the immutable material rest metric');
  }finally{solver.dispose();}
  assert.deepEqual(clip,savedClip);assert.equal(exportDiagramProject(project),savedProject,'temporary numerical preview never rewrites either CP or the saved diagram');
});

test('allowing intersections alone does not silently soften an unavailable rigid mechanism',()=>{
  const {fold,animation}=simulationDegreeFourFixture(2),saved=structuredClone(animation);
  const policies:Partial<SimulationStepAnimation>[]=[{}, {collisionPolicy:'allow'}, {motionPolicy:'allow-dynamic'}];
  for(const policy of policies)assert.throws(()=>planVerifiedSimulationStepAnimation(fold as FoldGraph,{...animation,...policy}),/连续刚性路径|无法找到|固定侧|材料连接/);
  assert.deepEqual(animation,saved);
});

test('an exact available path stays rigid and replanning discards an injected numerical recording',()=>{
  const {fold,prepared,animation}=simulationTwoHingeFixture(),input={...animation,collisionPolicy:'allow' as const,motionPolicy:'allow-dynamic' as const};
  const first=planVerifiedSimulationStepAnimation(fold as FoldGraph,input);
  assert.equal(first.method,'simultaneous');assert.ok(first.animation.motion);assert.equal(first.animation.dynamic,undefined);
  const injected:SimulationStepAnimation={...input,dynamic:{version:1,method:'dynamic',keyframes:[{progress:0,positions:[NaN]}],maxEdgeStrain:0,maxAreaStrain:0,maxAngleError:0,endAngleError:0,maxFixedDisplacement:0}};
  const replanned=planVerifiedSimulationStepAnimation(fold as FoldGraph,injected);
  assert.equal(replanned.method,'simultaneous');assert.deepEqual(replanned.animation.motion,first.animation.motion);assert.equal(replanned.animation.dynamic,undefined);
  assert.doesNotThrow(()=>validateSimulationStepAnimation(replanned.animation,prepared,animation.sourceSignature));
});

test('explicit numerical permission still rejects malformed or stretched starting paper before fallback',()=>{
  const {fold,animation}=simulationTwoHingeFixture(),policy={collisionPolicy:'allow' as const,motionPolicy:'allow-dynamic' as const};
  const invalid=structuredClone(animation);invalid.initialPositions[0]=NaN;
  assert.throws(()=>planVerifiedSimulationStepAnimation(fold as FoldGraph,{...invalid,...policy}),/初始.*坐标无效/);
  const stretched=structuredClone(animation);stretched.initialPositions[0]+=.1;
  assert.throws(()=>planVerifiedSimulationStepAnimation(fold as FoldGraph,{...stretched,...policy}),/拉伸/);
});
