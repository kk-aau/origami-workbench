import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {relativeLayerConstraintsMatch} from '../../src/core/relativeLayerConstraints';
import {createDiagramProject,adoptDiagramPose,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {diagramLayerAnalysisKey,applyDiagramLayerSolution,applyDiagramLayerAnalysis,validDiagramLayerCertificate} from '../../src/app/diagramLayerAnalysis';
import {moveFoldedVertices} from '../../src/app/foldedVertexEdit';
import {alignDiagramFoldResult} from '../../src/app/diagramFoldLink';
import ear from 'rabbit-ear';

function fixture(){const doc=blankDoc('上下关系工程',100,100);doc.segments.push({id:'v',a:[50,0],b:[50,100],assignment:'V',angle:180});let project=createDiagramProject(doc);project=adoptDiagramPose(project,project.activeStepId,project.steps[0].beforeId,computeFlatFold(doc,undefined,{flatCreases:'marks'}));const result=project.steps[0].pose!.result;const wanted=[{below:0,above:1}];if(!relativeLayerConstraintsMatch(result.geometry.vertices,result.geometry.faces,result.layers.faceOrders!,wanted))wanted[0]={below:1,above:0};return {project,wanted};}
test('required pairs apply atomically, invalidate old keys, survive project save, and follow the current view without reinterpreting data',()=>{
  const {project,wanted}=fixture(),stepId=project.activeStepId,key=diagramLayerAnalysisKey(project,stepId)!,old=structuredClone(project),pose=project.steps[0].pose!,solved=recomputeFlatLayers(pose.result,{relativeConstraints:wanted});
  assert.equal(applyDiagramLayerSolution(project,stepId,key,solved,0),project,'ordinary candidate selection cannot change saved constraints');
  const next=applyDiagramLayerSolution(project,stepId,key,solved,0,wanted);assert.notEqual(next,project);assert.deepEqual(project,old);assert.equal(next.steps[0].pose!.result.geometry,pose.result.geometry);assert.notEqual(diagramLayerAnalysisKey(next,stepId),key);assert.equal(applyDiagramLayerAnalysis(next,stepId,key,pose.result),next);
  const loaded=importDiagramProject(exportDiagramProject(next));assert.deepEqual(loaded.steps[0].pose!.result.layers.relativeConstraints,wanted);assert.equal(loaded.steps[0].pose!.result.layers.status,'unknown');
  const flipped=structuredClone(next);flipped.steps[0].pose!.view={...flipped.steps[0].pose!.view!,side:'back',rotation:0};assert.equal(diagramLayerAnalysisKey(flipped,stepId),diagramLayerAnalysisKey(next,stepId));assert.deepEqual(flipped.steps[0].pose!.result.layers.relativeConstraints,wanted);
});
test('unsatisfied, cancelled, missing-metadata and forged certificates retain the previous project',()=>{
  const {project,wanted}=fixture(),stepId=project.activeStepId,key=diagramLayerAnalysisKey(project,stepId)!,result=project.steps[0].pose!.result,reverse=wanted.map(({below,above})=>({below:above,above:below}));
  const failed=recomputeFlatLayers(result,{relativeConstraints:reverse});assert.equal(failed.layers.status,'no-solution');assert.equal(applyDiagramLayerSolution(project,stepId,key,failed,0,reverse),project);
  const fake=structuredClone(result);fake.layers.relativeConstraints=reverse;assert.equal(applyDiagramLayerSolution(project,stepId,key,fake,0,reverse),project);assert.equal(validDiagramLayerCertificate(fake,{...project.steps[0].pose!,result:fake}),false);
  assert.equal(applyDiagramLayerSolution(project,stepId,key,result,0,wanted),project);fake.layers={status:'cancelled',message:'停止',relativeConstraints:wanted};assert.equal(applyDiagramLayerSolution(project,stepId,key,fake,0,wanted),project);
});
test('manual geometry edits keep pending constraints and physical reflection reverses their fixed +Z direction',()=>{
  const {project,wanted}=fixture(),pose=project.steps[0].pose!,solved=recomputeFlatLayers(pose.result,{relativeConstraints:wanted});
  const moved=moveFoldedVertices(solved,{group:[0],selected:[0]},[1,1]);assert.equal(moved.layers.status,'unknown');assert.deepEqual(moved.layers.relativeConstraints,wanted);assert.notEqual(moved.layers.relativeConstraints,solved.layers.relativeConstraints);
  const reflected=alignDiagramFoldResult(pose.sourceDoc,solved,{point:[25,50],matrix:[-1,0,0,1,100,0]});assert.equal(reflected.layers.status,'unknown');assert.deepEqual(reflected.layers.relativeConstraints,wanted.map(({below,above})=>({below:above,above:below})));
  assert.equal(recomputeFlatLayers(reflected).layers.status,'solved');
});

test('certified unnumbered recovery applies required pairs without fabricating an enumerated candidate index',()=>{
  const {project,wanted}=fixture(),stepId=project.activeStepId,key=diagramLayerAnalysisKey(project,stepId)!,pose=project.steps[0].pose!;
  const original=ear.layer;
  (ear as any).layer=Object.assign(()=>{throw Error('no solution possible');},original);
  try{
    const solved=recomputeFlatLayers(pose.result,{solutionIndex:0,relativeConstraints:wanted});
    assert.equal(solved.layers.status,'solved');assert.equal(solved.layers.solutionIndex,undefined);
    assert.equal(applyDiagramLayerSolution(project,stepId,key,solved,0),project,'explicit candidate selection still requires its index');
    assert.equal(applyDiagramLayerSolution(project,stepId,key,solved,1,wanted),project,'an existence proof cannot satisfy a numbered request');
    const next=applyDiagramLayerSolution(project,stepId,key,solved,0,wanted),selected=next.steps[0].pose!;
    assert.notEqual(next,project);assert.equal(selected.result.geometry,pose.result.geometry);
    assert.equal(selected.layerSolutionIndex,undefined);assert.equal(selected.result.layers.solutionIndex,undefined);
    assert.deepEqual(selected.result.layers.relativeConstraints,wanted);
    assert.deepEqual(importDiagramProject(exportDiagramProject(next)).steps[0].pose!.result.layers.relativeConstraints,wanted);
    const reverse=wanted.map(({above,below})=>({above:below,below:above}));
    assert.equal(applyDiagramLayerSolution(project,stepId,key,solved,0,reverse),project,'a mismatched required relation remains rejected');
  }finally{(ear as any).layer=original;}
});
