import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSavedProjectImport} from '../../src/app/prepareProjectImport';
import {validSavedProjectHead} from '../../src/app/projectImportProtocol';
import {registerPreparedEditorImport,getPreparedEditorSignature} from '../../src/app/editorImportPreparation';
const doc={schemaVersion:2,name:'独立草稿',paper:{width:100,height:100},objects:[],segments:[{id:'m',a:[0,0],b:[100,100],assignment:'M',angle:-180}],metadata:{kept:'独立作品'}};
test('an unsaved private workspace draft keeps the null shared head and complete source',()=>{
  const result=prepareSavedProjectImport(JSON.stringify({doc,draft:true,workspaceDraft:true,revision:null}));
  assert.equal(result.savedProject.revision,null);assert.equal(result.savedProject.workspaceDraft,true);assert.equal(result.savedProject.draft,true);assert.deepEqual(result.doc,doc);
  registerPreparedEditorImport({...result,warnings:[]});assert.equal(getPreparedEditorSignature(result.doc),result.savedProject.preparedSignature);
});
test('a private draft conflict reaches the document UI after complete validation',()=>{
  const result=prepareSavedProjectImport(JSON.stringify({doc,draft:false,revision:'shared-head',workspaceDraftConflict:true}));
  assert.equal(result.savedProject.workspaceDraftConflict,true);assert.equal(result.savedProject.revision,'shared-head');assert.deepEqual(result.doc,doc);
});
test('ordinary broken records cannot use a null revision or forge a malformed workspace marker',()=>{
  for(const extra of [{draft:true},{workspaceDraft:true},{draft:false,workspaceDraft:true},{draft:true,workspaceDraft:'yes'}]){
    assert.equal(validSavedProjectHead({revision:null,...extra}),false);
    assert.throws(()=>prepareSavedProjectImport(JSON.stringify({doc,revision:null,...extra})),/不完整/);
  }
  assert.throws(()=>prepareSavedProjectImport(JSON.stringify({doc:{...doc,segments:[{...doc.segments[0],a:['wrong',0]}]},draft:true,workspaceDraft:true,revision:null})));
});
