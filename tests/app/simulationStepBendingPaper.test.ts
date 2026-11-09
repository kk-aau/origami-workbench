import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {createDiagramProject,updateDiagramCP} from '../../src/app/diagramProject';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {planVerifiedSimulationStepAnimation} from '../../src/engine/simStepPlanning';
import {validateSimulationStepAnimationStructure} from '../../src/engine/simStepAnimation';
import {createSimulationStepDynamicEvaluator,validateSimulationStepDynamicMotion} from '../../src/engine/simStepDynamic';

function fixture(){
  const doc=blankDoc('短折痕周围纸面弯曲',100,100);
  doc.segments.push(
    {id:'up',a:[50,0],b:[50,50],assignment:'F',angle:0},
    {id:'down',a:[50,50],b:[50,100],assignment:'F',angle:0},
    {id:'left',a:[0,50],b:[50,50],assignment:'F',angle:0},
    {id:'right',a:[50,50],b:[100,50],assignment:'F',angle:0});
  let id=0,project=createDiagramProject(doc,()=>`curve-${++id}`);
  const step=project.steps[0],after=structuredClone(doc);
  after.segments.find(s=>s.id==='up')!.assignment='V';after.segments.find(s=>s.id==='up')!.angle=90;
  project=updateDiagramCP(project,step.afterId,after);
  return {project,stepId:step.id};
}

test('a closed rigid loop becomes a refined bendable-paper clip without changing either CP',()=>{
  const {project,stepId}=fixture(),saved=JSON.stringify(project),clip=buildDiagramStepAnimation(project,stepId);
  assert.equal(clip.animation.materialMode,'bendable');
  assert.equal(clip.animation.motionPolicy,'allow-dynamic');
  const {prepared}=prepareSimulationDocument(clip.fold);
  assert.ok(prepared.vertexCount>9,'extra shared material vertices allow curvature');
  assert.ok(clip.animation.fixedVertices.length<prepared.vertexCount,'a closed loop does not pin the entire paper');
  assert.ok(clip.animation.ranges.some(r=>r.fromAngle===0&&r.toAngle===90));
  assert.ok(clip.animation.ranges.filter(r=>r.toAngle!==0).every(r=>prepared.edgesAssignment[r.edge]==='V'));
  assert.doesNotThrow(()=>validateSimulationStepAnimationStructure(clip.animation,prepared,clip.animation.sourceSignature));
  assert.equal(JSON.stringify(project),saved);
});

test('curved playback keeps its anchor and material metric and reports target error honestly',()=>{
  const {project,stepId}=fixture(),clip=buildDiagramStepAnimation(project,stepId),{prepared}=prepareSimulationDocument(clip.fold);
  const result=planVerifiedSimulationStepAnimation(clip.fold,{...clip.animation,collisionPolicy:'allow'});
  assert.equal(result.method,'dynamic');
  const motion=result.animation.dynamic!;
  assert.ok(motion.maxEdgeStrain<=.04);assert.ok(motion.maxAreaStrain<=.08);
  assert.ok(motion.maxFixedDisplacement<2e-6);assert.ok(Number.isFinite(motion.endAngleError));
  assert.ok(result.warnings?.some(w=>w.includes('终点折角误差')));
  const evaluator=createSimulationStepDynamicEvaluator(prepared,result.animation,motion);
  const mid=evaluator.evaluate(.5),end=evaluator.evaluate(1);
  assert.ok(mid.some((v,i)=>i%3===1&&Math.abs(v)>.01),'the sheet actually leaves the plane');
  assert.notDeepEqual(mid,end);
  for(const progress of [.5,1,.1,0,.5]){
    const positions=evaluator.evaluate(progress);
    for(const v of clip.animation.fixedVertices)for(let k=0;k<3;k++)assert.ok(Math.abs(positions[3*v+k]-clip.animation.initialPositions[3*v+k])<2e-6);
  }
  assert.deepEqual(evaluator.evaluate(.5),mid,'seeking a curved recording is deterministic');
  const forged=structuredClone(motion);forged.keyframes[1].positions=forged.keyframes[1].positions.map(v=>v*1.1);
  assert.throws(()=>validateSimulationStepDynamicMotion(prepared,result.animation,forged),/变形过大|固定/);
});

test('collision protection permits a free curved-paper motion and certifies the actual continuous playback',()=>{
  const {project,stepId}=fixture(),clip=buildDiagramStepAnimation(project,stepId),{prepared}=prepareSimulationDocument(clip.fold);
  const result=planVerifiedSimulationStepAnimation(clip.fold,{...clip.animation,collisionPolicy:'contact'});
  assert.equal(result.method,'dynamic');assert.equal(result.animation.collisionPolicy,'contact');
  assert.ok(result.checkedIntervals>0);
  const motion=result.animation.dynamic!;
  assert.ok(motion.keyframes.some(frame=>frame.positions.some((n,i)=>Math.abs(n-clip.animation.initialPositions[i])>.01)),'enabling contact must not reject every bent sheet');
  assert.doesNotThrow(()=>validateSimulationStepDynamicMotion(prepared,result.animation,motion));
  if(motion.contactStop){
    const last=motion.keyframes.find(frame=>frame.progress===motion.contactStop!.progress)!;
    assert.ok(motion.keyframes.filter(frame=>frame.progress>=last.progress).every(frame=>frame.positions.every((n,i)=>n===last.positions[i])));
  }
});
