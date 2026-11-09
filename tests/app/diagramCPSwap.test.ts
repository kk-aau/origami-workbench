import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc,line} from '../../src/app/state';
import {applySelectedFoldSwap,applyRegionalSwap} from '../../src/app/regionalSwap';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {normalizeDiagramCP} from '../../src/app/diagramCP';
import {computeFlatFold} from '../../src/core/flatFold';
import {applyDiagramCPEdit,getDiagramCPEditAccess} from '../../src/app/diagramCPEditing';
import {createDiagramProject,adoptDiagramPose,appendDiagramStep,updateDiagramFoldLink,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import type {Assignment,Doc} from '../../src/core/types';

test('selected CP conversion exchanges only selected M/V, preserving magnitude, unknown angles and nonfold data',()=>{
  const doc=blankDoc('选中谷峰转换',100,100),assignments:Assignment[]=['M','V','M','V','A','U','F'];
  const added=assignments.map((assignment,index)=>({...line([10,10+index*10],[90,10+index*10],assignment),id:`swap-${index}`}));
  added[0].angle=-63;added[1].angle=27;added[2].angle=null;added[3].angle=null;
  doc.segments.push(...added);doc.objects=[{id:'untouched-note',kind:'text',position:[10,10],text:'原注释',fontSize:5,color:'#123456'}];
  const before=structuredClone(doc),selected=new Set(doc.segments.map(segment=>segment.id));selected.delete('swap-3');
  const result=applySelectedFoldSwap(doc,selected);
  assert.equal(result.changed,3);assert.equal(result.matched,3);
  assert.deepEqual(result.doc.segments.slice(4).map(segment=>[segment.assignment,segment.angle]),[['V',63],['M',-27],['V',null],['V',null],['A',0],['U',null],['F',0]]);
  assert.equal(result.doc.objects,doc.objects);
  for(const segment of doc.segments){
    const changed=result.doc.segments.find(next=>next.id===segment.id)!;
    assert.equal(changed.a,segment.a);assert.equal(changed.b,segment.b);
    if(!['swap-0','swap-1','swap-2'].includes(segment.id))assert.equal(changed,segment);
  }
  assert.deepEqual(doc,before);assert.deepEqual(applySelectedFoldSwap(result.doc,selected).doc,doc);
});

test('empty, stale and nonfold-only selection is an identity, never an implicit whole-CP conversion',()=>{
  const doc=blankDoc('无选择',100,100);doc.segments.push({...line([0,50],[100,50],'V'),id:'keep-valley'});
  for(const selected of [new Set<string>(),new Set(['missing']),new Set(doc.segments.filter(segment=>segment.assignment==='B').map(segment=>segment.id))]){
    const result=applySelectedFoldSwap(doc,selected);
    assert.equal(result.doc,doc);assert.equal(result.changed,0);
  }
});

function linkedProject(){
  const doc=normalizeDiagramCP(blankDoc('谷峰工具联动',100,100)).doc;let sequence=0;
  let project=createDiagramProject(doc,()=>`cp-swap-${++sequence}`),step=project.steps[0];
  const pose=computeFlatFold(doc,undefined,{flatCreases:'marks'});assert.equal(pose.geometry.status,'ready');
  project=adoptDiagramPose(project,step.id,step.beforeId,pose);
  project=updateDiagramFoldLink(project,step.id,{enabled:true,layers:'all',selectedFaces:[]});
  const after:Doc={...doc,segments:[...doc.segments,{...line([0,25],[100,25],'V'),id:'operation-valley'},{...line([0,75],[100,75],'M'),id:'operation-mountain'}]};
  project=applyDiagramCPEdit(project,step.id,step.afterId,normalizeDiagramCP(after).doc);
  return project;
}

test('selected conversion uses the guarded CP transaction, updates linked drawing and shared next CP in one revision',()=>{
  let project=linkedProject(),sequence=0;project=appendDiagramStep(project,()=>`cp-next-${++sequence}`);
  const step=project.steps[0],before=project.states[0],after=project.states[1],nextStep=structuredClone(project.steps[1]),original=structuredClone(project);
  const valley=after.doc.segments.find(segment=>segment.assignment==='V')!,selected=new Set([valley.id]);
  const proposal=applySelectedFoldSwap(after.doc,selected),prepared=prepareEditorCommit(after.doc,proposal.doc);
  const edited=applyDiagramCPEdit(project,step.id,step.afterId,normalizeDiagramCP(prepared.doc).doc);
  assert.deepEqual(project,original);assert.deepEqual(edited.states[0],before);assert.deepEqual(edited.steps[0].pose,step.pose);
  assert.equal(edited.states[1].revision,after.revision+1);assert.equal(edited.steps[1].beforeId,step.afterId);assert.deepEqual(edited.steps[1],nextStep);
  const afterFolds=edited.states[1].doc.segments.filter(segment=>segment.assignment==='M'||segment.assignment==='V');
  assert.equal(afterFolds.length,2);assert.ok(afterFolds.every(segment=>segment.assignment==='M'&&segment.angle===-180));
  assert.equal(edited.steps[0].annotations?.some(annotation=>annotation.kind==='line'&&annotation.style==='valley'),false);
  assert.ok(edited.steps[0].annotations?.some(annotation=>annotation.kind==='line'&&annotation.style==='mountain'));
  const reopened=importDiagramProject(exportDiagramProject(edited));
  assert.deepEqual(reopened.states,edited.states);assert.deepEqual(reopened.steps[0].foldLink,edited.steps[0].foldLink);
  assert.equal(getDiagramCPEditAccess(edited,nextStep.id,step.afterId).editable,false);
  assert.throws(()=>applyDiagramCPEdit(edited,nextStep.id,step.afterId,after.doc),/上一步/);
});

test('point/box conversion follows the same guarded edit and cannot change the linked initial CP',()=>{
  const project=linkedProject(),step=project.steps[0],before=project.states[0],after=project.states[1];
  const point=applyRegionalSwap(after.doc,{kind:'point',point:[50,25],radius:2});assert.equal(point.changed,1);
  const edited=applyDiagramCPEdit(project,step.id,step.afterId,prepareEditorCommit(after.doc,point.doc).doc);
  assert.equal(edited.states[1].doc.segments.filter(segment=>segment.assignment==='V').length,0);
  const box=applyRegionalSwap(after.doc,{kind:'box',a:[40,20],b:[60,80]});assert.equal(box.changed,2);
  const converted=applyDiagramCPEdit(project,step.id,step.afterId,prepareEditorCommit(after.doc,box.doc).doc);
  assert.equal(converted.states[1].doc.segments.filter(segment=>segment.assignment==='V').length,1);
  assert.throws(()=>applyDiagramCPEdit(project,step.id,step.beforeId,box.doc),/停用联动/);assert.deepEqual(project.states[0],before);
});
