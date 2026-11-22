import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {appendDiagramStep,adoptDiagramPose,createDiagramProject,updateDiagramCP} from '../../src/app/diagramProject';
import {createDiagramSpatialPose} from '../../src/app/diagramSpatialPose';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {targetForDiagramSinkLeg} from '../../src/app/diagramSinkTarget';
import {planDiagramSinkLeg} from '../../src/app/diagramSinkPlayback';
import {planDiagramStepPlayback} from '../../src/engine/simStepPlanning';
import {prepareSimulationDocument} from '../../src/engine/simmodel';

function leg(degrees:number){
  const doc=blankDoc('中间姿态',100,100);
  let project=createDiagramProject(doc);
  const folded={...doc,segments:[...doc.segments,{id:'hinge',a:[50,0] as [number,number],b:[50,100] as [number,number],assignment:degrees>0?'V' as const:'M' as const,angle:degrees}]};
  project=appendDiagramStep(updateDiagramCP(project,project.steps[0].afterId,folded));
  const next=project.steps[1],state=project.states[1],pose=createDiagramSpatialPose(state.doc);
  project=adoptDiagramPose(project,next.id,state.id,pose.result,undefined,pose.spatial);
  const clip=buildDiagramStepAnimation(project,project.steps[0].id);
  return {project,clip,prepared:prepareSimulationDocument(clip.fold).prepared,target:targetForDiagramSinkLeg(project,0,clip)!};
}

test('向前求解失败或走向相反的折角时，实际目标引导反求并沿正确方向播放',()=>{
  const {clip,target,prepared}=leg(90);
  const other=leg(-90).clip;
  const wrong=planDiagramStepPlayback(other.fold,other.animation,undefined,other);
  for(const forward of [()=>{throw Error('正向分支无解');},()=>wrong]){
    const result=planDiagramSinkLeg(prepared,clip,target,forward);
    const frames=result.animation.dynamic!.keyframes;
    assert.ok(frames.length>2);
    assert.ok(frames[0].positions.every((n,i)=>Math.abs(n-clip.animation.initialPositions[i])<2e-7));
    assert.ok(frames.at(-1)!.positions.every((n,i)=>Math.abs(n-target.positions[i])<2e-7));
    assert.ok(frames.every(frame=>clip.animation.fixedVertices.every(v=>[0,1,2].every(axis=>Math.abs(frame.positions[3*v+axis]-clip.animation.initialPositions[3*v+axis])<2e-6))));
  }
});

test('末尾没有下一张展示图时按操作后 CP 核验，过期或损坏的保存目标不可替代真实姿态',()=>{
  const {project,clip,target,prepared}=leg(90);
  assert.equal(targetForDiagramSinkLeg({...project,steps:project.steps.slice(0,1)},0,clip),undefined);
  const forward=()=>planDiagramStepPlayback(clip.fold,clip.animation,undefined,clip);
  assert.doesNotThrow(()=>planDiagramSinkLeg(prepared,clip,undefined,forward));
  const broken={...target,positions:target.positions.map((n,i)=>i===clip.animation.fixedVertices[0]*3?n+.1:n)};
  assert.throws(()=>planDiagramSinkLeg(prepared,clip,broken,forward),/固定面/);
  const stale={...project,states:project.states.map((s,i)=>i===1?{...s,revision:s.revision+1}:s)};
  assert.throws(()=>targetForDiagramSinkLeg(stale,0,clip),/来源 CP 已变化/);
});
