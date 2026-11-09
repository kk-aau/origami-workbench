import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {createDiagramProject,adoptDiagramPose,advanceDiagramStep,inheritDiagramCurrentPose,updateDiagramPaperPose,validateDiagramProject,exportDiagramProject,importDiagramProject,updateDiagramCP} from '../../src/app/diagramProject';
import {recordDiagramPaperPull,switchDiagramPaperState} from '../../src/app/diagramPaperState';
import {moveDiagramPaperVertices,diagramPaperVertices} from '../../src/app/diagramPaperDeformation';

function fixture(){
 const doc=blankDoc('拖角连续步骤',100,100);let serial=0;const id=()=>`pull-next-${++serial}`;
 let project=createDiagramProject(doc,id),step=project.steps[0];project=adoptDiagramPose(project,step.id,step.beforeId,computeFlatFold(doc));
 const original=project.steps[0].pose!,pose=moveDiagramPaperVertices(original,{group:[0],selected:[0]},[-20,-10]);
 project=recordDiagramPaperPull(updateDiagramPaperPose(project,step.id,pose),step.id,original,[]);
 return {project,id,stepId:step.id,original};
}
test('Next inherits a pulled drawing and both switchable states without sharing or replacing source geometry',()=>{
 const {project,id,stepId,original}=fixture(),before=structuredClone(project),advanced=advanceDiagramStep(project,id),next=inheritDiagramCurrentPose(advanced,stepId,advanced.activeStepId),step=next.steps[1];
 assert.equal(step.paperStates?.active,'pulled');assert.deepEqual(diagramPaperVertices(step.pose!),diagramPaperVertices(project.steps[0].pose!));
 assert.equal(step.pose!.sourceStateId,step.beforeId);assert.equal(step.paperStates!.flat!.sourceStateId,step.beforeId);assert.equal(step.paperStates!.pulled!.sourceStateId,step.beforeId);assert.deepEqual(project,before);
 const flat=switchDiagramPaperState(next,step.id,'flat');assert.deepEqual(diagramPaperVertices(flat.steps[1].pose!),diagramPaperVertices(original));
 const restored=switchDiagramPaperState(flat,step.id,'pulled');assert.deepEqual(diagramPaperVertices(restored.steps[1].pose!),diagramPaperVertices(step.pose!));
 assert.doesNotThrow(()=>validateDiagramProject(importDiagramProject(exportDiagramProject(restored))));
 const previous=restored.steps[1].pose!,moved=moveDiagramPaperVertices(previous,{group:[0],selected:[0]},[-30,-20]);
 const edited=recordDiagramPaperPull(updateDiagramPaperPose(restored,step.id,moved),step.id,previous,[]);
 assert.notDeepEqual(diagramPaperVertices(edited.steps[1].pose!),diagramPaperVertices(previous));assert.deepEqual(edited.steps[0],project.steps[0]);
});
test('a changed CP cannot silently inherit the old pulled geometry and an existing next drawing stays authoritative',()=>{
 const {project,id,stepId}=fixture(),advanced=advanceDiagramStep(project,id),inherited=inheritDiagramCurrentPose(advanced,stepId,advanced.activeStepId);
 assert.throws(()=>inheritDiagramCurrentPose(inherited,stepId,inherited.activeStepId),/没有可继承/);
 const doc=structuredClone(project.states[1].doc);doc.segments.push({id:'new',a:[50,0],b:[50,100],assignment:'M',angle:-180});
 const changed=advanceDiagramStep(updateDiagramCP(project,project.states[1].id,doc),id);
 assert.throws(()=>inheritDiagramCurrentPose(changed,stepId,changed.activeStepId),/CP 已变化/);
});
