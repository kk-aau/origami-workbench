import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {normalizeDiagramCP} from '../../src/app/diagramCP';
import {createDiagramProject,adoptDiagramPose,appendDiagramStep,updateDiagramFoldLink,updateDiagramAnnotations,updateDiagramAnnotationsBatch,updateDiagramCP,resyncDiagramStepViews,type DiagramProject} from '../../src/app/diagramProject';
import {prepareExistingCreases,refreshChangedViewDrawings} from '../../src/app/diagramProjectPreparation';
import {refreshDiagramFoldDrawing} from '../../src/app/diagramFoldTransactions';
import type {DiagramAnnotation} from '../../src/app/diagramAnnotations';

function fixture(){
  const raw=blankDoc('恢复绘图',100,100);
  raw.segments.push({id:'existing',a:[50,0],b:[50,100],assignment:'F',angle:0});
  const doc=normalizeDiagramCP(raw).doc;let i=0;
  let project=createDiagramProject(doc,()=>`prepare-${++i}`);
  project=adoptDiagramPose(project,project.activeStepId,project.states[0].id,computeFlatFold(doc));
  return updateDiagramFoldLink(project,project.activeStepId,{enabled:true,layers:'all',selectedFaces:[],drawingVersion:1});
}
function previousRestore(project:DiagramProject){
  let next=refreshChangedViewDrawings(resyncDiagramStepViews(project),project);
  for(const step of next.steps){
    if(!step.foldLink?.enabled||!step.pose||step.pose.sourceStateId!==step.beforeId)continue;
    if(!project.states.find(s=>s.id===step.afterId)?.doc.segments.some(s=>s.assignment==='F'))continue;
    try{next=refreshDiagramFoldDrawing(next,step.id,undefined,true);}catch{/* legacy recovery */}
  }
  return next;
}
test('missing and changed crease drawings restore exactly as the previous path',()=>{
  const original=fixture(),saved=structuredClone(original),restored=prepareExistingCreases(original);
  assert.deepEqual(restored,previousRestore(original));assert.deepEqual(original,saved);
  assert.ok(restored.steps[0].annotations?.some(a=>a.id.startsWith('cp-existing:')));
  const after=structuredClone(restored.states[1].doc);
  after.segments.push({id:'added-existing',a:[0,25],b:[100,25],assignment:'F',angle:0});
  const changed=updateDiagramCP(restored,restored.steps[0].afterId,normalizeDiagramCP(after).doc);
  assert.deepEqual(prepareExistingCreases(changed),previousRestore(changed));
  assert.notDeepEqual(prepareExistingCreases(changed).steps[0].annotations,restored.steps[0].annotations);
});
test('verified unchanged drawing arrays and geometry are reused',()=>{
  const saved=prepareExistingCreases(fixture()),restored=prepareExistingCreases(saved);
  assert.deepEqual(restored,previousRestore(saved));
  assert.equal(restored.steps[0].annotations,saved.steps[0].annotations);
  assert.equal(restored.steps[0].pose,saved.steps[0].pose);assert.equal(restored.states,saved.states);
});
test('batch commits preserve normal annotation bookkeeping and reject an invalid batch atomically',()=>{
  const project=appendDiagramStep(fixture(),()=> 'next-'+Math.random());
  const symbol:DiagramAnnotation={id:'flip',kind:'symbol',symbol:'flip',position:[25,25],size:20,rotation:0,color:'#345678',width:.7};
  const updates=[{stepId:project.steps[0].id,annotations:[symbol]},{stepId:project.steps[1].id,annotations:[]}];
  const baseline=updates.reduce((p,u)=>updateDiagramAnnotations(p,u.stepId,u.annotations),project);
  assert.deepEqual(updateDiagramAnnotationsBatch(project,updates),baseline);
  const saved=structuredClone(project);
  assert.throws(()=>updateDiagramAnnotationsBatch(project,[updates[0],{stepId:'missing',annotations:[]}]),/不存在/);
  assert.deepEqual(project,saved);
});
test('legacy symbol records and stale model snapshots retain previous recovery behavior',()=>{
  let project=prepareExistingCreases(fixture());
  project={...project,steps:project.steps.map(s=>({...s,firstSymbolPlaced:undefined,annotations:[...s.annotations!,{id:'symbol',kind:'symbol',symbol:'flip',position:[10,10],size:20,rotation:0,color:'#345678',width:.7} as DiagramAnnotation]}))};
  delete project.steps[0].firstSymbolPlaced;
  assert.deepEqual(prepareExistingCreases(project),previousRestore(project));
  const stale={...project,states:project.states.map((s,i)=>i===0?{...s,revision:s.revision+1}:s)};
  assert.deepEqual(prepareExistingCreases(stale),previousRestore(stale));
});
