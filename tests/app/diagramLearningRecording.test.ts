import test from 'node:test';
import assert from 'node:assert/strict';
import {recordedLearningTask,type LearningRecordedAction} from '../../src/app/diagramLearningRecording';
import {newLearningDesign,exportLearningDesign,importLearningDesign,checkLearningDesignTask} from '../../src/app/diagramLearningDesign';
import {importDiagramProject,appendDiagramStep,adoptDiagramPose} from '../../src/app/diagramProject';
import {computeFlatFold} from '../../src/core/flatFold';
import type {LearningObservation} from '../../src/app/diagramLearning';
const observation:LearningObservation={comparison:false,editCP:null,tool:'line',selectedLineCount:0,side:'front'};
const actions:LearningRecordedAction[]=[{guide:{kind:'control',control:{kind:'teach',value:'line',tag:'button',index:0}},label:'画折线'},{guide:{kind:'point',point:[0,0],tool:'line'},label:'点击起点'},{guide:{kind:'point',point:[200,200],tool:'line'},label:'点击终点'}];
test('a real demonstrated line becomes a verified task with ordered controls, endpoints and before/after projects',()=>{
 const d=newLearningDesign(),before=importDiagramProject(d.initial),after=structuredClone(before);after.steps[0].annotations=[{id:'recorded',kind:'line',style:'valley',a:[0,0],b:[200,200],color:'#123456',width:.7}];
 const t=recordedLearningTask(before,after,actions,'沿对角线画谷折。',observation);assert.equal(t.rule.kind,'line');assert.deepEqual(t.route,actions.map(a=>a.guide));assert.equal(importDiagramProject(t.scene!).steps[0].annotations?.length,0);assert.equal(importDiagramProject(t.demo!.after).steps[0].annotations?.length,1);assert.equal(checkLearningDesignTask(t,after,observation,before),true);
 d.tasks=[t];assert.deepEqual(importLearningDesign(exportLearningDesign(d)).tasks[0].route,t.route);assert.equal(before.steps[0].annotations?.length,0);
});
test('fixed and future layer choices come from actual recorded changes; an unresolved next step cannot be saved as successful',()=>{
 const before=importDiagramProject(newLearningDesign().initial),after=structuredClone(before);after.steps[0].foldLink!.fixed={point:[150,50],matrix:[1,0,0,1,0,0]};assert.equal(recordedLearningTask(before,after,[],'固定这边',observation).rule.kind,'fixed');
 delete after.steps[0].foldLink!.fixed;after.steps[0].foldLink!.layers='selected';after.steps[0].foldLink!.selectedFaces=[0];assert.equal(recordedLearningTask(before,after,[],'只画这层',observation).rule.kind,'scope');assert.equal(recordedLearningTask(before,after,[],'只画这层',{...observation,selectedLineCount:1}).rule.kind,'manual');
 const next=appendDiagramStep(before);assert.throws(()=>recordedLearningTask(before,next,[],'下一步',observation),/还在计算/);const solved=adoptDiagramPose(next,next.activeStepId,next.steps[1].beforeId,computeFlatFold(next.states[1].doc));assert.equal(recordedLearningTask(before,solved,[],'下一步',observation).rule.kind,'next');
});
test('UI-only actions become click checks, while unclassified project changes retain explicit manual confirmation',()=>{
 const before=importDiagramProject(newLearningDesign().initial),t=recordedLearningTask(before,before,actions.slice(0,1),'',observation);assert.equal(t.rule.kind,'click');assert.equal(t.message,'画折线');const after=structuredClone(before);after.steps[0].description='作者示范的额外编辑';assert.equal(recordedLearningTask(before,after,actions,'观察结果',observation).rule.kind,'manual');
 const restored=structuredClone(before);restored.steps[0].pose!.result.layers.status='solved';assert.equal(recordedLearningTask(before,restored,actions.slice(0,1),'点按钮',observation).rule.kind,'click','background certificate restoration must not turn a UI-only demonstration into manual configuration');
 const d=newLearningDesign();d.tasks=[t];const bad=JSON.parse(exportLearningDesign(d));bad.tasks[0].route[0]={kind:'point',point:[Infinity,0],tool:'line'};assert.throws(()=>importLearningDesign(JSON.stringify(bad)),/引导点无效/);
});
