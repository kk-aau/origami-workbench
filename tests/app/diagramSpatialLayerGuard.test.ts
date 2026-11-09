import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {adoptDiagramPose,createDiagramProject} from '../../src/app/diagramProject';
import {createDiagramSpatialPose} from '../../src/app/diagramSpatialPose';
import {applyDiagramStepLayerAnalysis,diagramLayerAnalysisKey,diagramPaperLayerAnalysisReason,validDiagramLayerCertificate} from '../../src/app/diagramLayerAnalysis';
import {diagramLayerDisplayState,startDiagramLayerDisplayPreparation} from '../../src/app/diagramLayerDisplay';

function fixture(){
  const doc=blankDoc('空间层序隔离',100,100);doc.segments.push({id:'hinge',a:[50,0],b:[50,100],assignment:'V',angle:90});
  const project=createDiagramProject(doc),computed=createDiagramSpatialPose(doc),step=project.steps[0];
  return adoptDiagramPose(project,step.id,step.beforeId,computed.result,undefined,computed.spatial);
}

test('a spatial pose cannot be enqueued or merged through flat-layer analysis',()=>{
  const project=fixture(),step=project.steps[0],pose=step.pose!,changed=structuredClone(pose.result);
  assert.match(diagramPaperLayerAnalysisReason(pose)!,/立体状态.*实际深度/);assert.equal(diagramLayerAnalysisKey(project,step.id),null);
  changed.layers={status:'solved',message:'平折结果',faceOrder:[...pose.result.layers.faceOrder!].reverse()};
  assert.equal(validDiagramLayerCertificate(changed,pose),false);assert.equal(applyDiagramStepLayerAnalysis(project,step.id,'stale-flat-key',changed),project);
});

test('spatial export preparation preserves certified depth without launching a flat-layer worker',async()=>{
  const project=fixture(),before=structuredClone(project),saved=globalThis.Worker;let attempts=0;
  globalThis.Worker=class{constructor(){attempts++;throw Error('不应调用平折worker');}} as unknown as typeof Worker;
  try{
    assert.deepEqual(diagramLayerDisplayState(project,project.activeStepId),{status:'ready',key:null});
    const result=await startDiagramLayerDisplayPreparation(project).promise;
    assert.deepEqual(result.issues,[]);assert.equal(result.cancelled,false);assert.deepEqual(result.project,before);assert.equal(attempts,0);
  }finally{globalThis.Worker=saved;}
});

test('an unknown or stale spatial certificate is reported rather than repaired by a flat solver or hidden by drawing order',async()=>{
  for(const mode of ['unknown','stale'] as const){
    const project=fixture(),pose=project.steps[0].pose!;
    if(mode==='unknown')pose.result.layers={status:'unknown',message:'未计算'};else project.states[0].revision++;
    const state=diagramLayerDisplayState(project,project.activeStepId);assert.equal(state.status,'unsupported');assert.match(state.message!,/空间/);
    const result=await startDiagramLayerDisplayPreparation(project).promise;assert.equal(result.issues.length,1);assert.match(result.issues[0].message,/空间/);
  }
});

test('export preparation rejects a changed projection that still carries old spatial metadata',async()=>{
  const project=fixture(),pose=project.steps[0].pose!;pose.result.geometry.vertices[0][0]+=5;
  const result=await startDiagramLayerDisplayPreparation(project).promise;assert.equal(result.issues.length,1);assert.match(result.issues[0].message,/空间/);
});
