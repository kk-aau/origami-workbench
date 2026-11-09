import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {createDiagramProject} from '../../src/app/diagramProject';
import {createDiagramLibrary,DiagramLibraryConflictError,DIAGRAM_LEGACY_DRAFT_KEY,type DiagramLibraryBackgroundRequest} from '../../src/app/diagramLibrary';
import {runDiagramLibraryBackgroundSave} from '../../src/app/diagramLibraryBackgroundSave';

function backing(){
  const entries=new Map<string,string>();
  return {entries,getItem:(key:string)=>entries.get(key)??null,setItem:(key:string,value:string)=>{entries.set(key,value);},compareAndSet(key:string,expected:string|null,value:string){if((entries.get(key)??null)!==expected)return false;entries.set(key,value);return true;}};
}
const project=()=>createDiagramProject(blankDoc('后台绘图',100,100));
function gate(){let release!:()=>void;const ready=new Promise<void>(resolve=>{release=resolve;});return {ready,release};}

test('background saves retain the original opened head and reject a later external revision',async()=>{
  const store=backing(),initial=createDiagramLibrary(store),entry=initial.save(project(),{kind:'saved'});
  const wait=gate(),ui=createDiagramLibrary(store,{backgroundSave:async request=>{await wait.ready;return runDiagramLibraryBackgroundSave(request,store);}}),external=createDiagramLibrary(store);
  const loaded=ui.load(entry.id),old={...loaded,steps:loaded.steps.map(step=>({...step,description:'旧窗口编辑'}))},changed=external.load(entry.id);changed.steps[0].description='其他窗口新版本';
  const saving=ui.saveAsync(old,{id:entry.id,kind:'draft'});
  assert.equal(ui.hasPendingSave(),true);
  external.save(changed,{id:entry.id,kind:'saved'});wait.release();
  await assert.rejects(saving,DiagramLibraryConflictError);
  assert.equal(external.load(entry.id).steps[0].description,'其他窗口新版本');
  assert.equal(ui.hasExternalChanges(entry.id),true);assert.equal(ui.hasPendingSave(),false);
});

test('queued automatic drafts coalesce while manual saves keep their own snapshot and advance the confirmed head',async()=>{
  const store=backing(),wait=gate(),requests:DiagramLibraryBackgroundRequest[]=[];
  const ui=createDiagramLibrary(store,{backgroundSave:async request=>{requests.push(request);if(requests.length===1)await wait.ready;return runDiagramLibraryBackgroundSave(request,store);}});
  const entry=ui.save(project(),{kind:'saved'}),base=ui.load(entry.id);
  const changed=(caption:string)=>({...base,steps:base.steps.map((step,index)=>index?step:{...step,description:caption})});
  const first=ui.saveAsync(changed('正在写入'),{id:entry.id,kind:'draft'},{coalesce:true});
  const superseded=ui.saveAsync(changed('待写入旧稿'),{id:entry.id,kind:'draft'},{coalesce:true});
  const latest=ui.saveAsync(changed('待写入新稿'),{id:entry.id,kind:'draft'},{coalesce:true});
  const manual=ui.saveAsync(changed('明确手动保存'),{id:entry.id,kind:'saved'});
  assert.throws(()=>ui.save(base,{id:entry.id,kind:'saved'}),/后台保存/);
  let idle=false;const drained=ui.waitForPendingSaves().then(()=>{idle=true;});await Promise.resolve();assert.equal(idle,false);
  wait.release();const receipts=await Promise.all([first,superseded,latest,manual]);await drained;
  assert.equal(requests.length,3);assert.deepEqual(requests.map(request=>request.project.steps[0].description),['正在写入','待写入新稿','明确手动保存']);
  assert.equal(receipts[1].draftKey,receipts[2].draftKey);
  assert.equal(ui.hasExternalChanges(entry.id),false);assert.equal(ui.hasPendingSave(),false);
  const getItem=store.getItem;store.getItem=key=>{assert.ok(!key.startsWith('zhezhi.diagram-library-doc-'),'the returned thumbnail must not reread a full project');return getItem(key);};
  assert.match(ui.getThumbnail(entry.id)!,/<svg/);store.getItem=getItem;
  assert.equal(ui.load(entry.id,'saved').steps[0].description,'明确手动保存');
});

test('a compatibility recovery write failure preserves the successfully committed library receipt',()=>{
  const store=backing(),storage={...store,setItem(key:string,value:string){if(key===DIAGRAM_LEGACY_DRAFT_KEY)throw Error('恢复目录不可写');store.setItem(key,value);}};
  const result=runDiagramLibraryBackgroundSave({project:project(),settings:{kind:'draft'},legacyDraft:true},storage);
  assert.equal(result.warnings.length,1);assert.match(result.warnings[0],/文档库/);
  assert.equal(createDiagramLibrary(store).load(result.entry.id).name,'后台绘图');
});

test('invalid background geometry fails before any draft or legacy payload is written',()=>{
  const store=backing(),invalid=project();invalid.states[0].doc.paper.width=NaN;
  assert.throws(()=>runDiagramLibraryBackgroundSave({project:invalid,settings:{kind:'draft'},legacyDraft:true},store));
  assert.equal(store.entries.size,0);
});

test('unchanged checkpoints do not dispatch a worker and manual draft promotion writes only metadata',async()=>{
  const store=backing(),requests:DiagramLibraryBackgroundRequest[]=[];
  const ui=createDiagramLibrary(store,{backgroundSave:async request=>{requests.push(request);return runDiagramLibraryBackgroundSave(request,store);}});
  const entry=ui.save(project(),{kind:'draft'}),loaded=ui.load(entry.id),beforePayload=store.getItem(entry.draftKey!);
  await ui.saveAsync({...loaded},{id:entry.id,kind:'draft'},{legacyDraft:true});assert.equal(requests.length,0);
  const saved=await ui.saveAsync(loaded,{id:entry.id,kind:'saved'});
  assert.equal(requests.length,1);assert.ok('promoteDraftKey' in requests[0]);assert.equal('project' in requests[0],false);
  assert.equal(saved.savedKey,entry.draftKey);assert.equal(store.getItem(entry.draftKey!),beforePayload);
  await ui.saveAsync(loaded,{id:entry.id,kind:'saved'});assert.equal(requests.length,1);
});

test('an undo queued behind an in-flight changed draft is saved rather than incorrectly skipped against the old baseline',async()=>{
  const store=backing(),wait=gate();let calls=0;
  const ui=createDiagramLibrary(store,{backgroundSave:async request=>{if(++calls===1)await wait.ready;return runDiagramLibraryBackgroundSave(request,store);}});
  const entry=ui.save(project(),{kind:'saved'}),original=ui.load(entry.id),changed={...original,steps:original.steps.map(step=>({...step,title:'中途修改'}))};
  const first=ui.saveAsync(changed,{id:entry.id,kind:'draft'}),undo=ui.saveAsync(original,{id:entry.id,kind:'draft'});
  wait.release();await Promise.all([first,undo]);assert.equal(calls,2);assert.equal(ui.load(entry.id).steps[0].title,'');
});
