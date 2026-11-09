import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {createDiagramProject} from '../../src/app/diagramProject';
import {prepareDiagramEditorCP} from '../../src/app/diagramEditorCP';
import {emptyEditorHistory,editorHistoryReducer} from '../../src/app/editorHistory';
import {validateDoc} from '../../src/core/types';
import {materialSlitFixture} from '../fixtures/materialModel';

test('opening a CP prepares an independent editable copy without changing the shared diagram boundaries',()=>{
  const source=blankDoc('本步骤 CP',100,100);
  source.segments.push({id:'horizontal',a:[0,50],b:[100,50],assignment:'V',angle:180},
    {id:'vertical',a:[50,0],b:[50,100],assignment:'F',angle:0});
  let index=0;const project=createDiagramProject(source,()=>`editor-${++index}`),before=structuredClone(project);
  const editor=prepareDiagramEditorCP(project.states[0].doc);assert.doesNotThrow(()=>validateDoc(editor));
  assert.equal(editor.segments.filter(s=>s.assignment==='V').length,2);
  assert.equal(editor.segments.filter(s=>s.assignment==='F').length,2);
  assert.ok(editor.segments.filter(s=>s.assignment!=='B').every(s=>[s.a,s.b].some(p=>p[0]===50&&p[1]===50)));
  editor.name='编辑区副本';editor.segments[0].a[0]=4;
  assert.deepEqual(project,before);assert.deepEqual(project.states[0].doc,source);
});

test('a CP handoff keeps the prior unsaved document and earlier edits in ordinary undo/redo history',()=>{
  const original=blankDoc('已有未保存工程',180,120),edited={...structuredClone(original),name:'已有未保存修改'};
  edited.segments.push({id:'user-line',a:[0,0],b:[180,120],assignment:'M',angle:-180});
  let history=editorHistoryReducer(emptyEditorHistory(original),{type:'commit',doc:edited});
  const source=blankDoc('步骤副本',100,100),prepared=prepareDiagramEditorCP(source),prior=structuredClone(history);
  history=editorHistoryReducer(history,{type:'commit',doc:prepared});
  assert.deepEqual(history.past,[original,edited]);assert.equal(history.present.name,source.name);
  history=editorHistoryReducer(history,{type:'undo'});assert.deepEqual(history.present,edited);
  history=editorHistoryReducer(history,{type:'undo'});assert.deepEqual(history.present,original);
  history=editorHistoryReducer(history,{type:'redo'});assert.deepEqual(history.present,edited);
  history=editorHistoryReducer(history,{type:'redo'});assert.deepEqual(history.present,prepared);
  assert.equal(history.error,null);assert.deepEqual(prior.present,edited);assert.equal(prior.past.length,1);
});

test('opening a material CP retains separate cut banks and source incidence rather than joining coincident edges',()=>{
  const {source}=materialSlitFixture(),before=structuredClone(source),prepared=prepareDiagramEditorCP(source);
  assert.deepEqual(prepared,{...source,objects:source.objects??[]});assert.notEqual(prepared,source);assert.notEqual(prepared.metadata,source.metadata);
  assert.deepEqual(source,before);assert.doesNotThrow(()=>validateDoc(prepared));
});

test('invalid CP copies are rejected before reaching editor history and preserve their supplied source',()=>{
  const broken=blankDoc('无效 CP',100,100);broken.paper.width=Infinity;
  const before=structuredClone(broken),history=emptyEditorHistory(blankDoc('保留当前工程',200,200)),oldHistory=structuredClone(history);
  assert.throws(()=>prepareDiagramEditorCP(broken));assert.deepEqual(broken,before);assert.deepEqual(history,oldHistory);
});
