import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {createDiagramProject,appendDiagramStep,updateDiagramCP} from '../../src/app/diagramProject';
import {blankDoc} from '../../src/app/state';
import {diagramAnimationPreparation} from '../../src/app/diagramAnimationPreparation';

test('repeat preview shares preparation, editing its target CP or drawing invalidates it',()=>{
  const project=createDiagramProject(blankDoc()),id=project.steps[0].id;
  const first=diagramAnimationPreparation(project,id);
  assert.equal(diagramAnimationPreparation({...project},id).preparation,first.preparation);
  const changed={...project,states:project.states.map((state,i)=>i===1?{...state,revision:state.revision+1}:state)};
  const second=diagramAnimationPreparation(changed,id);
  assert.notEqual(second.preparation,first.preparation);
  const edited={...changed,steps:changed.steps.map(step=>({...step,canvas:{...step.canvas,drawingRotation:90}}))};
  assert.notEqual(diagramAnimationPreparation(edited,id).preparation,second.preparation);
});

test('changing a fold angle rebuilds the clip with the edited target',()=>{
  const doc=blankDoc('角度改变',100,100),base=createDiagramProject(doc),step=base.steps[0];
  const folded=(angle:number)=>updateDiagramCP(base,step.afterId,{...doc,segments:[...doc.segments,
    {id:'hinge',a:[50,0],b:[50,100],assignment:'V',angle}]});
  const initial=folded(180),first=diagramAnimationPreparation(initial,step.id);
  const clip=buildDiagramStepAnimation(first.workerProject(),step.id);
  first.rememberClip({...clip,warnings:['x'.repeat(17*1024*1024)]});
  assert.equal(first.preparation.clip,undefined,'oversized worker results are not retained');
  first.rememberClip(clip);
  assert.equal(diagramAnimationPreparation(initial,step.id).preparation.clip,clip);
  const edited=folded(90),next=diagramAnimationPreparation(edited,step.id);
  assert.equal(next.preparation.clip,undefined);
  const changed=buildDiagramStepAnimation(next.workerProject(),step.id);
  assert.deepEqual(changed,buildDiagramStepAnimation(edited,step.id));
  assert.ok(changed.animation.ranges.some(r=>Math.abs(r.toAngle)===90));
});

test('a flat step sends its CP pair only, preserving the original label index independently',()=>{
  const base=createDiagramProject(blankDoc()),project=appendDiagramStep(base);
  const input=diagramAnimationPreparation(project,project.activeStepId);
  assert.equal(input.index,1);
  assert.equal(input.workerProject().steps.length,1);
  assert.deepEqual(input.workerProject().states,project.states.slice(1,3));
});
