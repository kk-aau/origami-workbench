import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {createDiagramProject,updateDiagramCP} from '../../src/app/diagramProject';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {planSimulationStepDynamic,createSimulationStepDynamicEvaluator} from '../../src/engine/simStepDynamic';
import {compileSimulationStepRigidMechanism} from '../../src/engine/simStepRigid';

function clipFor(from:number,to:number){
  const doc=blankDoc('折叠状态转为折痕状态',100,100);
  doc.segments.push({id:'crease',a:[50,0],b:[50,100],assignment:from<0?'M':from>0?'V':'F',angle:from});
  let project=createDiagramProject(doc);const step=project.steps[0],after=structuredClone(doc),crease=after.segments.find(s=>s.id==='crease')!;
  crease.assignment=to<0?'M':to>0?'V':'F';crease.angle=to;
  project=updateDiagramCP(project,step.afterId,after);
  const saved=JSON.stringify(project),clip=buildDiagramStepAnimation(project,step.id);
  assert.equal(JSON.stringify(project),saved);
  return {...clip,prepared:prepareSimulationDocument(clip.fold).prepared};
}

for(const from of [-180,180])test(`a ${from} degree folded crease retains its unfolding drive when the target becomes F`,()=>{
  const {animation,prepared}=clipFor(from,0),input={...animation,materialMode:'bendable' as const,motionPolicy:'allow-dynamic' as const,collisionPolicy:'allow' as const};
  assert(input.ranges.some(r=>r.fromAngle===from&&r.toAngle===0));
  const motion=planSimulationStepDynamic(prepared,input,{steps:16,iterationsPerStep:80,finalIterations:24000});
  assert(motion.endAngleError<5,'the driven hinge must unfold; flexible panel seams need not reach a rigid flat sheet');
  assert(motion.maxEdgeStrain<=.04);assert(motion.maxAreaStrain<=.08);
  const evaluate=createSimulationStepDynamicEvaluator(prepared,input,motion).evaluate;
  assert.notDeepEqual(evaluate(1),evaluate(0));assert.deepEqual(evaluate(0),Float32Array.from(input.initialPositions));
  for(const p of [0,.75,.25,1])for(const v of input.fixedVertices)for(let axis=0;axis<3;axis++)assert.equal(evaluate(p)[v*3+axis],Math.fround(input.initialPositions[v*3+axis]));
});

test('a partial-angle step reaches its certified 90 degree pose through a checked terminal transition',()=>{
  const {animation,prepared}=clipFor(0,90),input={...animation,motionPolicy:'allow-dynamic' as const,collisionPolicy:'allow' as const};
  const motion=planSimulationStepDynamic(prepared,input);
  assert.equal(motion.settleStart,.9);assert(motion.endAngleError<.001);
  const evaluator=createSimulationStepDynamicEvaluator(prepared,input,motion);
  const target=compileSimulationStepRigidMechanism(prepared,input).validatePose(input.ranges.map(r=>r.toAngle));
  evaluator.evaluate(1).forEach((value,i)=>assert(Math.abs(value-target[i])<1e-6));
  assert.notDeepEqual(evaluator.evaluate(.5),evaluator.evaluate(0));
});
