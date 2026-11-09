import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../fixtures/diagramPartialCrease';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {planVerifiedSimulationStepAnimation} from '../../src/engine/simStepPlanning';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {createSimulationStepFlexEvaluator,validateSimulationStepFlexMotion} from '../../src/engine/simStepFlex';
import {retimeSimulationStepFlexMotions} from '../../src/engine/simStepFlexTiming';
import {seedSimulationStepAnimation,simulationStepFoldProfile,validateSimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import {partialCreaseDiagramProjectFixture} from '../fixtures/partialCreaseDiagramProject';
import {simulationStepAxisGroups} from '../../src/engine/simStepScheduling';

test('a local short crease waits for its specified window and returns to its exact saved pose',()=>{
  const {project,stepId}=fixture('single'),clip=buildDiagramStepAnimation(project,stepId),{prepared}=prepareSimulationDocument(clip.fold);
  const edges=clip.animation.ranges.filter(r=>r.viaAngle!==undefined&&r.viaAngle!==r.fromAngle).map(r=>r.edge);
  const input={...clip.animation,collisionPolicy:'allow' as const,timings:edges.map(edge=>({edge,start:.25,end:.75}))};
  const result=planVerifiedSimulationStepAnimation(clip.fold,input,undefined,{initialGeometry:clip.initialGeometry});
  assert.equal(result.method,'local-flex');assert.deepEqual(result.animation.timings,input.timings);
  const animation=validateSimulationStepAnimation(result.animation,prepared,clip.animation.sourceSignature),motion=animation.flex!,path=createSimulationStepFlexEvaluator(prepared,animation,motion),seed=Array.from(path.evaluate(0));
  assert.deepEqual(motion.batches,[{start:.25,end:.75,edges}]);
  for(const p of [0,.1,.25,.75,.9,1])assert.ok(Array.from(path.evaluate(p)).every((v,i)=>v===seed[i]));
  assert.ok(Array.from(path.evaluate(.5)).some((v,i)=>Math.abs(v-seed[i])>.001));
  assert.ok(path.angles(.4).some((v,i)=>Math.abs(v-path.initialAngles[i])>1));
  const model=new OrigamiModel(prepared),solver=new ReferenceSolver(model);seedSimulationStepAnimation(solver,animation);
  for(const progress of [.1,.4,.5,.6,.9,1]){
    solver.setFoldProfile(simulationStepFoldProfile(animation,progress));solver.setFoldPercent(progress*100);solver.step(1);
    const expected=path.evaluate(progress);
    assert.ok(Array.from(model.positions).every((v,i)=>Math.abs(v-expected[i])<2e-7),'outward and return seeks follow the requested window');
  }
  solver.dispose();
  assert.ok(motion.maxEdgeStrain<2e-4);assert.ok(motion.maxAreaStrain<8e-4);
});

test('explicit flex windows are enforced instead of silently accepting the original schedule',()=>{
  const {project,stepId}=fixture('single'),clip=buildDiagramStepAnimation(project,stepId),{prepared}=prepareSimulationDocument(clip.fold),result=planVerifiedSimulationStepAnimation(clip.fold,{...clip.animation,collisionPolicy:'allow'},undefined,{initialGeometry:clip.initialGeometry});
  const edges=clip.animation.ranges.filter(r=>r.viaAngle!==undefined&&r.viaAngle!==r.fromAngle).map(r=>r.edge),animation={...clip.animation,timings:edges.map(edge=>({edge,start:.8,end:1}))};
  assert.throws(()=>validateSimulationStepFlexMotion(prepared,animation,result.animation.flex),/启动时段/);
  const retimed=retimeSimulationStepFlexMotions(prepared,animation,[{motion:result.animation.flex!,edges}]);
  assert.equal(retimed.batches![0].start,.8);assert.equal(retimed.batches![0].end,1);
  const invalid=structuredClone(retimed);invalid.keyframes.find(k=>k.progress>.8&&k.progress<1)!.positions[0]+=.05;
  assert.throws(()=>validateSimulationStepFlexMotion(prepared,animation,invalid),/固定侧|曲面|材料|误差/);
});

test('multiple local curves obey custom windows and reject incompatible overlap instead of stretching material',()=>{
  const {project,stepId}=partialCreaseDiagramProjectFixture({activeRoutes:[0,2]}),clip=buildDiagramStepAnimation(project,stepId),{prepared}=prepareSimulationDocument(clip.fold),groups=simulationStepAxisGroups(prepared,clip.animation);
  assert.equal(groups.length,2);
  const overlap=groups.flatMap((g,i)=>g.creases.map(c=>({edge:prepared.creaseParams[c].edge,start:i===0?0:.4,end:i===0?.8:1})));
  assert.throws(()=>planVerifiedSimulationStepAnimation(clip.fold,{...clip.animation,collisionPolicy:'allow',timings:overlap},undefined,{initialGeometry:clip.initialGeometry}),/启动时段无法同时保持材料连接|边长误差/);
  const timings=groups.flatMap((g,i)=>g.creases.map(c=>({edge:prepared.creaseParams[c].edge,start:i===0?.1:.55,end:i===0?.45:.95}))),input={...clip.animation,collisionPolicy:'allow' as const,timings};
  const result=planVerifiedSimulationStepAnimation(clip.fold,input,undefined,{initialGeometry:clip.initialGeometry}),motion=result.animation.flex!,path=createSimulationStepFlexEvaluator(prepared,result.animation,motion);
  assert.equal(motion.batches!.length,2);assert.equal(motion.batches![1].start,.55);
  for(const [i,group] of groups.entries())assert.ok(group.creases.some(c=>Math.abs(path.angles(i===0?.275:.75)[c]-path.initialAngles[c])>1));
  const seed=path.evaluate(0);assert.ok(Array.from(path.evaluate(.5)).every((v,i)=>v===seed[i]));
  for(const progress of [.2,.35,.5,.6,.7,.9]){
    const positions=path.evaluate(progress),driven=path.driver(path.angles(progress));
    assert.ok(Array.from(positions).every((v,i)=>Math.abs(v-driven[i])<3e-7),'driver follows each outward and return state without shifting the requested windows');
  }
  assert.ok(motion.maxEdgeStrain<2e-4);assert.ok(motion.maxAreaStrain<8e-4);
});
