import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeDocumentId,documentWorkspaceCommand,artworkDocumentStatus,nextArtworkRecoveryScope,documentWorkingPreferenceKey,createArtworkSaveTracker} from '../../src/app/documentRuntime';
const first='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222',third='33333333-3333-4333-8333-333333333333';
test('native documents require their own valid id and never fall back to a shared recovery slot',()=>{
  assert.equal(nativeDocumentId(undefined),null);assert.equal(nativeDocumentId({role:'shell',documentId:first}),null);
  assert.equal(nativeDocumentId({role:'document',documentId:first,windowId:'one'}),first);
  assert.equal(nativeDocumentId({role:'document',documentId:first,windowId:'two'}),first);
  assert.throws(()=>nativeDocumentId({role:'document',documentId:null}),/编号无效/);
});
test('workspace commands have an exact bounded vocabulary',()=>{
  for(const name of ['edit','design','tess','sim','diagram'])assert.equal(documentWorkspaceCommand('workspace:'+name),name);
  for(const bad of ['workspace:','workspace:edit:other','edit','workspace:constructor'])assert.equal(documentWorkspaceCommand(bad),null);
});
test('document metadata includes hidden design and drawing changes and real busy work',()=>{
  const base={name:'CP',workspace:'edit' as const,creaseDirty:false,modelDirty:false,simulationDirty:false,constructionDirty:false,busy:false,saving:false,ready:true};
  assert.deepEqual(artworkDocumentStatus(base),{title:'CP',workspace:'edit',dirty:false,busy:false,saving:false,ready:true});
  const design={name:'设计',dirty:true,busy:true,present:true};
  assert.equal(artworkDocumentStatus({...base,design}).dirty,true);assert.equal(artworkDocumentStatus({...base,design}).busy,true);
  assert.equal(artworkDocumentStatus({...base,workspace:'design',design}).title,'设计');
  assert.equal(artworkDocumentStatus({...base,diagram:{name:'步骤',dirty:true,busy:false,present:true}}).dirty,true);
});
test('native recovery stays stable during moves and rotates owners when content is replaced',()=>{
  const a=nextArtworkRecoveryScope(undefined,0,first),b=nextArtworkRecoveryScope(undefined,0,second);
  assert.notEqual(a.owner,b.owner);assert.equal(a.owner.id,first);assert.equal(b.owner.id,second);
  a.owner.revision='old';a.owner.text='before';
  assert.equal(nextArtworkRecoveryScope(a,0,first),a,'moving the same live view cannot rotate its recovery owner');
  const next=nextArtworkRecoveryScope(a,1,first,()=>third);assert.notEqual(next,a);assert.notEqual(next.owner,a.owner);assert.equal(next.owner.id,third);
  // An old in-flight commit finishes only its old slot; it cannot change the new head.
  a.owner.revision='committed-after-replace';a.owner.text='old-scope';
  assert.equal(next.owner.revision,null);assert.equal(next.owner.text,'');assert.equal(b.owner.revision,null);
  assert.equal(nextArtworkRecoveryScope(next,1,first),next);
});
test('a changed document id cannot reuse another document owner or CAS revision',()=>{
  const a=nextArtworkRecoveryScope(undefined,0,first);a.owner.revision='private-head';
  const b=nextArtworkRecoveryScope(a,0,second);assert.notEqual(a.owner,b.owner);assert.equal(b.owner.revision,null);assert.equal(b.owner.id,second);
  assert.throws(()=>nextArtworkRecoveryScope(a,1,'invalid'),/编号无效/);
});
test('legacy single-window scope behavior still preserves older independent recovery records',()=>{
  const a=nextArtworkRecoveryScope(undefined,0,null,()=>first),b=nextArtworkRecoveryScope(a,1,null,()=>second);
  assert.equal(a.owner.id,first);assert.equal(b.owner.id,second);assert.notEqual(a.owner,b.owner);
});
test('only the current drawing working slot is namespaced; shared libraries and preferences retain CAS identity',()=>{
  const a=documentWorkingPreferenceKey('zhezhi.diagram-project.v1',first),b=documentWorkingPreferenceKey('zhezhi.diagram-project.v1',second);
  assert.notEqual(a,b);assert.match(a,/^zhezhi\.document-[a-p]{32}-diagram-project\.v1$/);
  for(const key of ['zhezhi.diagram-library.v1','zhezhi.base-design-library.v1','zhezhi.theme.v1'])assert.equal(documentWorkingPreferenceKey(key,first),key);
  assert.equal(documentWorkingPreferenceKey(a,first),a);assert.equal(documentWorkingPreferenceKey('zhezhi.diagram-project.v1'),'zhezhi.diagram-project.v1');
  assert.throws(()=>documentWorkingPreferenceKey('zhezhi.diagram-project.v1','not-an-id'),/编号无效/);
});
test('complete-work save acknowledges only the captured immutable content and never clears concurrent edits',()=>{
  const initial={},next={},tracker=createArtworkSaveTracker(initial);assert.equal(tracker.dirty(),false);
  tracker.observe(next);assert.equal(tracker.dirty(),true);const snapshot=tracker.capture();
  tracker.observe({});assert.equal(tracker.acknowledge(snapshot),false);assert.equal(tracker.dirty(),true);
  assert.equal(tracker.acknowledge(tracker.capture()),true);assert.equal(tracker.dirty(),false);
  tracker.observe(next);assert.equal(tracker.dirty(),true);
});
test('real simulation changes after a captured save remain dirty without walking any geometry',()=>{
  const tracker=createArtworkSaveTracker({get segments(){throw Error('geometry must not be visited');}});
  const snapshot=tracker.capture();tracker.simulationChanged();assert.equal(tracker.acknowledge(snapshot),false);assert.equal(tracker.dirty(),true);
  assert.equal(tracker.acknowledge(tracker.capture()),true);assert.equal(tracker.dirty(),false);
  tracker.simulationChanged();assert.equal(tracker.dirty(),true);
});
