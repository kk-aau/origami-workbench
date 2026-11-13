import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc,line} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {normalizeDiagramCP} from '../../src/app/diagramCP';
import {createDiagramProject,adoptDiagramPose,appendDiagramStep,updateDiagramFoldLink,updateDiagramCP,updateDiagramPoseResult,type DiagramProject} from '../../src/app/diagramProject';
import {getDiagramCPEditAccess,applyDiagramCPEdit,applyReturnedDiagramCP} from '../../src/app/diagramCPEditing';
import {findDiagramCPEdge,editDiagramCPEdge} from '../../src/app/diagramCPEdgeEdit';
import {moveFoldedVertices} from '../../src/app/foldedVertexEdit';

function fixture(linked=true){
  const doc=normalizeDiagramCP(blankDoc('CP 直接编辑保护',100,100)).doc;let sequence=0;
  let project=createDiagramProject(doc,()=>`direct-cp-${++sequence}`);
  const step=project.steps[0],result=computeFlatFold(doc,undefined,{flatCreases:'marks'});
  assert.equal(result.geometry.status,'ready');
  project=adoptDiagramPose(project,step.id,step.beforeId,result);
  return updateDiagramFoldLink(project,step.id,{enabled:linked,layers:'all',selectedFaces:[]});
}
function changedDoc(project:DiagramProject,stateId:string,assignment:'F'|'V'='V'){
  const doc=structuredClone(project.states.find(state=>state.id===stateId)!.doc);
  doc.segments.push({...line([0,50],[100,50],assignment),id:'direct-added-crease'});
  return normalizeDiagramCP(doc).doc;
}

test('shared before CP is read-only and identifies its preceding owner even with linking disabled',()=>{
  let id=0;const project=appendDiagramStep(fixture(false),()=>`shared-next-${++id}`),step=project.steps[1];
  assert.deepEqual(getDiagramCPEditAccess(project,step.id,step.beforeId),{editable:false,reason:'操作前 CP 与上一步的操作后 CP 共享；请到上一步修改操作后 CP。',ownerStepId:project.steps[0].id});
  const original=structuredClone(project);
  assert.throws(()=>applyDiagramCPEdit(project,step.id,step.beforeId,changedDoc(project,step.beforeId)),/上一步/);
  assert.deepEqual(project,original);
});

test('only current before and after states are accepted',()=>{
  let id=0;const project=appendDiagramStep(fixture(false),()=>`foreign-next-${++id}`),step=project.steps[0];
  assert.equal(getDiagramCPEditAccess(project,step.id,project.states[2].id).editable,false);
  assert.equal(getDiagramCPEditAccess(project,'missing-step',step.beforeId).editable,false);
  assert.equal(getDiagramCPEditAccess(project,step.id,'missing-state').editable,false);
});

test('initial CP is protected while linked and editable after linking is disabled',()=>{
  const linked=fixture(),step=linked.steps[0],original=structuredClone(linked);
  assert.match(getDiagramCPEditAccess(linked,step.id,step.beforeId).reason,/停用联动/);
  assert.throws(()=>applyDiagramCPEdit(linked,step.id,step.beforeId,changedDoc(linked,step.beforeId)),/停用联动/);
  assert.deepEqual(linked,original);
  const disabled=updateDiagramFoldLink(linked,step.id,{...step.foldLink!,enabled:false});
  assert.equal(getDiagramCPEditAccess(disabled,step.id,step.beforeId).editable,true);
  const edited=applyDiagramCPEdit(disabled,step.id,step.beforeId,changedDoc(disabled,step.beforeId));
  assert.equal(edited.states[0].revision,disabled.states[0].revision+1);
  assert.deepEqual(edited.states[1],disabled.states[1]);
  assert.deepEqual(edited.steps[0].pose,disabled.steps[0].pose);
  assert.notEqual(edited.steps[0].pose!.sourceRevision,edited.states[0].revision);
});

test('a real initial CP write clears source-dependent fixed/range/ownership but retains precrease intent',()=>{
  const initial=fixture(false),step=initial.steps[0],precrease=line([0,40],[100,40],'V');
  const project=updateDiagramFoldLink(initial,step.id,{enabled:false,layers:'selected',selectedFaces:[0],generated:[line([0,40],[100,40],'F')],precreases:[precrease],fixed:{point:[20,20],matrix:[1,0,0,1,0,0]}});
  const original=structuredClone(project),edited=applyDiagramCPEdit(project,step.id,step.beforeId,changedDoc(project,step.beforeId));
  assert.deepEqual(project,original);
  assert.deepEqual(edited.steps[0].foldLink,{enabled:false,layers:'selected',selectedFaces:[],precreases:[precrease]});
  assert.deepEqual(edited.steps[0].pose,project.steps[0].pose);
});

test('linked after editing requires a ready current before pose and exact source document',()=>{
  const base=fixture(),step=base.steps[0];
  const cases:DiagramProject[]=[];
  const absent=structuredClone(base);absent.steps[0].pose=null;cases.push(absent);
  const notReady=structuredClone(base);notReady.steps[0].pose!.result.geometry.status='error';cases.push(notReady);
  const wrongState=structuredClone(base);wrongState.steps[0].pose!.sourceStateId=step.afterId;cases.push(wrongState);
  cases.push(updateDiagramCP(base,step.beforeId,changedDoc(base,step.beforeId,'F')));
  const mismatchedDocument=structuredClone(base);mismatchedDocument.steps[0].pose!.sourceDoc.name='同修订号但不同来源内容';cases.push(mismatchedDocument);
  for(const project of cases){
    const original=structuredClone(project),access=getDiagramCPEditAccess(project,step.id,step.afterId);
    assert.equal(access.editable,false);assert.match(access.reason,/计算操作前 CP/);
    assert.throws(()=>applyDiagramCPEdit(project,step.id,step.afterId,changedDoc(base,step.afterId)),/计算操作前 CP/);
    assert.deepEqual(project,original);
  }
});

test('a current linked after edit updates main drawing handles and preserves the before pose',()=>{
  const project=fixture(),step=project.steps[0],original=structuredClone(project);
  const edited=applyDiagramCPEdit(project,step.id,step.afterId,changedDoc(project,step.afterId));
  assert.deepEqual(project,original);
  assert.deepEqual(edited.states[0],project.states[0]);assert.deepEqual(edited.steps[0].pose,step.pose);
  assert.equal(edited.states[1].revision,project.states[1].revision+1);
  assert.ok(edited.steps[0].annotations?.some(annotation=>annotation.kind==='line'&&annotation.style==='valley'&&annotation.foldFaces?.includes(0)));
  assert.ok(edited.steps[0].foldLink?.generated?.some(segment=>segment.assignment==='V'));
});

test('a linked F mark is synchronized as an existing crease without an active fold',()=>{
  const project=fixture(),step=project.steps[0],edited=applyDiagramCPEdit(project,step.id,step.afterId,changedDoc(project,step.afterId,'F'));
  assert.ok(edited.steps[0].annotations?.some(annotation=>annotation.kind==='line'&&annotation.style==='crease'&&annotation.id.startsWith('cp-existing:')));
  assert.equal(edited.steps[0].annotations?.some(annotation=>annotation.kind==='line'&&(annotation.style==='valley'||annotation.style==='mountain')),false);
});

test('editing a shared after CP preserves the next pose as a stale snapshot',()=>{
  let id=0,project=appendDiagramStep(fixture(),()=>`dependent-next-${++id}`);
  const first=project.steps[0],second=project.steps[1],source=project.states.find(state=>state.id===second.beforeId)!;
  project=adoptDiagramPose(project,second.id,second.beforeId,computeFlatFold(source.doc,undefined,{flatCreases:'marks'}));
  const snapshot=structuredClone(project.steps[1]),edited=applyDiagramCPEdit(project,first.id,first.afterId,changedDoc(project,first.afterId));
  assert.equal(edited.steps[1].beforeId,first.afterId);assert.deepEqual(edited.steps[1],snapshot);
  assert.notEqual(edited.steps[1].pose!.sourceRevision,edited.states.find(state=>state.id===second.beforeId)!.revision);
});

test('unlinked after CP editing does not require a pose and does not invent drawing geometry',()=>{
  const project=fixture(false),step=project.steps[0];project.steps[0].pose=null;
  const edited=applyDiagramCPEdit(project,step.id,step.afterId,changedDoc(project,step.afterId));
  assert.equal(edited.states[1].revision,1);assert.deepEqual(edited.steps[0].annotations,[]);assert.equal(edited.steps[0].pose,null);
});

test('unchanged allowed writes preserve project identity, history revision and disabled settings',()=>{
  for(const linked of [true,false]){
    const project=fixture(linked),step=project.steps[0];
    assert.equal(applyDiagramCPEdit(project,step.id,step.afterId,structuredClone(project.states[1].doc)),project);
    if(!linked)assert.equal(applyDiagramCPEdit(project,step.id,step.beforeId,structuredClone(project.states[0].doc)),project);
  }
});

test('pulled paper blocks direct whole CP edits and failed mapping is atomic',()=>{
  const project=fixture(),step=project.steps[0],vertices=step.pose!.result.geometry.vertices,index=vertices.findIndex(point=>point[0]===100&&point[1]===0);
  const result=moveFoldedVertices(step.pose!.result,{group:[index],selected:[index]},[120,-20]),pulled=updateDiagramPoseResult(project,step.id,result),original=structuredClone(pulled);
  assert.match(getDiagramCPEditAccess(pulled,step.id,step.afterId).reason,/平整/);
  assert.throws(()=>applyDiagramCPEdit(pulled,step.id,step.afterId,changedDoc(project,step.afterId)),/平整/);assert.deepEqual(pulled,original);
  const conflict=changedDoc(project,step.afterId);conflict.segments.push({...line([0,50],[100,50],'M'),id:'conflicting-mountain'});
  const pristine=structuredClone(project);assert.throws(()=>applyDiagramCPEdit(project,step.id,step.afterId,conflict),/冲突/);assert.deepEqual(project,pristine);
});

test('read-only before editing does not block selecting its existing edge to operate on current after CP',()=>{
  let project=fixture();const step=project.steps[0],withMark=changedDoc(project,step.beforeId,'F');
  project=updateDiagramCP(project,step.beforeId,withMark);project=updateDiagramCP(project,step.afterId,withMark);
  project=adoptDiagramPose(project,step.id,step.beforeId,computeFlatFold(withMark,undefined,{flatCreases:'marks'}));
  assert.equal(getDiagramCPEditAccess(project,step.id,step.beforeId).editable,false);
  const edge=findDiagramCPEdge(project.states[0],{a:[0,50],b:[100,50]}),edited=editDiagramCPEdge(project,step.id,step.beforeId,edge,'V');
  assert.deepEqual(edited.states[0],project.states[0]);assert.ok(edited.states[1].doc.segments.some(segment=>segment.assignment==='V'));
});

test('returning an initial CP refreshes its source and preserves the fold link',()=>{
  const project=fixture(),step=project.steps[0],state=project.states[0],edited=changedDoc(project,state.id);
  const updated=applyReturnedDiagramCP(project,step.id,state.id,state.revision,edited);
  assert.deepEqual(updated.states[0].doc,edited);
  assert.equal(updated.states[0].revision,state.revision+1);
  assert.equal(updated.steps[0].foldLink?.enabled,true);
  assert.throws(()=>applyReturnedDiagramCP(updated,step.id,state.id,state.revision,edited),/来源 CP 已修改/);
  assert.throws(()=>applyReturnedDiagramCP(project,'removed',state.id,state.revision,edited),/已被移除/);
});

test('returning a shared before CP edits its owner even after navigating to another step',()=>{
  const project=appendDiagramStep(fixture(false)),step=project.steps[1],state=project.states[1];
  const navigated={...project,activeStepId:project.steps[0].id};
  const updated=applyReturnedDiagramCP(navigated,step.id,state.id,state.revision,changedDoc(project,state.id));
  assert.equal(updated.states[1].revision,state.revision+1);
  assert.equal(updated.states[0].revision,project.states[0].revision);
  assert.equal(updated.activeStepId,navigated.activeStepId);
});
