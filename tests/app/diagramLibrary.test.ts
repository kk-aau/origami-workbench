import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {appendDiagramStep,createDiagramProject,exportDiagramProject,adoptDiagramPose,updateDiagramHiddenFaces,updateDiagramPoseResult} from '../../src/app/diagramProject';
import {createDiagramLibrary,diagramLibraryIsDraft,diagramLibraryThumbnail,findDiagramLibraryDocument,DIAGRAM_LIBRARY_KEY,DIAGRAM_LEGACY_DRAFT_KEY} from '../../src/app/diagramLibrary';
import {computeFlatFold} from '../../src/core/flatFold';
import {moveFoldedVertices} from '../../src/app/foldedVertexEdit';
import {recordDiagramPaperPull,switchDiagramPaperState} from '../../src/app/diagramPaperState';

function fixture(){let nextId=0;return createDiagramProject(blankDoc('小鸟折序',100,100),()=>`step-${++nextId}`);}
function storage(){const values=new Map<string,string>(),reads:string[]=[],writes:{key:string;value:string}[]=[];let reject:((key:string,value:string)=>boolean)|null=null;return {values,reads,writes,getItem:(key:string)=>{reads.push(key);return values.get(key)??null;},setItem:(key:string,value:string)=>{if(reject?.(key,value))throw new Error('模拟存储已满');writes.push({key,value});values.set(key,value);},fail:(predicate:typeof reject)=>{reject=predicate;}};}
function repository(backing=storage()){let next=0,stamp=100;return {backing,library:createDiagramLibrary(backing,{idFactory:()=>`document-${++next}`,now:()=>stamp++})};}

test('an open drawing reconnects to its imported copy when the old id belongs to a different drawing',()=>{
  const {library}=repository(),old=fixture(),current=fixture();current.steps[0].description='当前浏览器绘图';
  const conflicting=library.save(old,{kind:'saved'}),imported=library.save(current,{kind:'draft'});library.renameDocument(imported.id,'浏览器副本');
  const match=findDiagramLibraryDocument(library.read(),current,id=>library.load(id),conflicting.id);
  assert.equal(match?.id,imported.id);assert.equal(match?.name,'浏览器副本');
  assert.equal(library.load(conflicting.id).steps[0].description,'');
});

test('directory changes keep a matching current id and leave an unmatched draft unattached',()=>{
  const {library}=repository(),current=fixture(),saved=library.save(current,{kind:'saved'}),duplicate=library.save(current,{kind:'draft'});
  assert.equal(findDiagramLibraryDocument(library.read(),current,id=>library.load(id),duplicate.id)?.id,duplicate.id);
  assert.equal(findDiagramLibraryDocument(library.read(),current,id=>library.load(id),saved.id)?.id,saved.id);
  const changed=structuredClone(current);changed.steps[0].description='尚未保存的不同稿';
  assert.equal(findDiagramLibraryDocument(library.read(),changed,id=>library.load(id),saved.id),null);
});

test('a live computed paper still matches its saved snapshot after transient solver certificates are discarded',()=>{
  const {library}=repository(),source=blankDoc('平折定位',100,100);source.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'V',angle:180});
  let project=createDiagramProject(source),step=project.steps[0];project=adoptDiagramPose(project,step.id,step.beforeId,computeFlatFold(source));
  const saved=library.save(project,{kind:'saved'});
  assert.equal(findDiagramLibraryDocument(library.read(),project,id=>library.load(id),saved.id)?.id,saved.id);
});

test('independent document snapshots and last open record survive creating a fresh repository',()=>{
  const {backing,library}=repository(),project=fixture(),first=library.save(project,{kind:'saved'});
  const other=fixture();other.name='另一份绘图';const second=library.save(other,{kind:'draft'});
  project.name='未记录修改';other.states[0].doc.name='外部修改';
  const reloaded=createDiagramLibrary(backing);
  assert.equal(reloaded.read().documents.length,2);assert.equal(reloaded.read().lastOpenId,second.id);assert.equal(reloaded.load(first.id).name,'小鸟折序');assert.equal(reloaded.load(second.id).name,'另一份绘图');assert.equal(reloaded.load(second.id).states[0].doc.name,'小鸟折序');
  const copy=reloaded.load(first.id);copy.states[0].doc.paper.width=30;assert.equal(reloaded.load(first.id).states[0].doc.paper.width,100);
  assert.equal(diagramLibraryIsDraft(first),false);assert.equal(diagramLibraryIsDraft(second),true);
});

test('large drawing snapshots and library indexes persist beyond their former byte ceilings',()=>{
  const {backing,library}=repository(),project=fixture(),padding='x'.repeat(32*1024*1024+1);
  project.states[0].doc.metadata={padding};
  const deletedLegacy=Array.from({length:16_000},(_,index)=>index.toString(16).padStart(64,'0'));
  backing.setItem(DIAGRAM_LIBRARY_KEY,JSON.stringify({format:'zhezhi-diagram-library',version:1,documents:[],folders:[],lastOpenId:null,deletedLegacy}));
  assert.ok(Buffer.byteLength(backing.getItem(DIAGRAM_LIBRARY_KEY)!)>1_000_000);
  const entry=library.save(project,{kind:'saved'}),reloaded=createDiagramLibrary(backing);
  assert.ok(Buffer.byteLength(backing.getItem(entry.savedKey!)!)>32*1024*1024);
  assert.equal(reloaded.load(entry.id).states[0].doc.metadata?.padding,padding);
  assert.deepEqual(reloaded.read().deletedLegacy,deletedLegacy);
  reloaded.renameDocument(entry.id,'大绘图');
  assert.equal(createDiagramLibrary(backing).load(entry.id).name,'大绘图');
});

test('automatic draft updates retain the distinct manually saved version and clear only superseded draft payloads',()=>{
  const {backing,library}=repository(),project=fixture(),saved=library.save(project,{kind:'saved'});
  const changed=structuredClone(project);changed.steps[0].description='第一次改动';const draft=library.save(changed,{id:saved.id,kind:'draft'});
  assert.notEqual(draft.draftKey,saved.savedKey);assert.equal(draft.savedKey,saved.savedKey);
  changed.steps[0].description='第二次改动';const latest=library.save(changed,{id:saved.id,kind:'draft'});
  assert.equal(backing.getItem(draft.draftKey!),'');assert.ok(backing.getItem(saved.savedKey!));
  assert.equal(library.load(saved.id,'saved').steps[0].description,'');assert.equal(library.load(saved.id).steps[0].description,'第二次改动');
  const resaved=library.save(changed,{id:saved.id,kind:'saved'});assert.equal(resaved.savedKey,latest.draftKey);assert.equal(resaved.savedKey,resaved.draftKey);assert.equal(backing.getItem(saved.savedKey!),'');assert.equal(diagramLibraryIsDraft(resaved),false);
});

test('an unchanged draft keeps its key and avoids repeatedly writing the full project',()=>{
  const {backing,library}=repository(),project=fixture(),entry=library.save(project,{kind:'draft'}),snapshotWrites=backing.writes.filter(write=>write.key.startsWith('zhezhi.diagram-library-doc-')).length;
  for(let i=0;i<12;i++){const next=library.save(project,{id:entry.id,kind:'draft'});assert.equal(next.draftKey,entry.draftKey);}
  assert.equal(backing.writes.filter(write=>write.key.startsWith('zhezhi.diagram-library-doc-')).length,snapshotWrites);
});

test('many draft changes and manual saves reuse three atomic slots without accumulating empty keys or changing other documents',()=>{
  const {backing,library}=repository(),project=fixture(),entry=library.save(project,{kind:'saved'}),other=library.save(fixture(),{kind:'saved'}),otherSnapshot=backing.getItem(other.savedKey!);
  for(let i=0;i<80;i++){project.steps[0].description=`第 ${i} 次修改`;library.save(project,{id:entry.id,kind:i%5===0?'saved':'draft'});assert.equal(backing.getItem(other.savedKey!),otherSnapshot);}
  assert.equal([...backing.values.keys()].filter(key=>key.startsWith('zhezhi.diagram-library-doc-')).length,4);
  assert.equal(library.load(entry.id).steps[0].description,'第 79 次修改');assert.equal(library.load(entry.id,'saved').steps[0].description,'第 75 次修改');
});

test('snapshot write failure leaves the previous index, saved document, draft and last open record intact',()=>{
  const {backing,library}=repository(),entry=library.save(fixture(),{kind:'saved'}),old=backing.getItem(DIAGRAM_LIBRARY_KEY),oldSnapshot=backing.getItem(entry.savedKey!);
  const changed=fixture();changed.steps[0].description='不能丢掉原版本';backing.fail((key,value)=>key.startsWith('zhezhi.diagram-library-doc-')&&value!=='');
  assert.throws(()=>library.save(changed,{id:entry.id,kind:'draft'}),/存储已满/);assert.equal(backing.getItem(DIAGRAM_LIBRARY_KEY),old);assert.equal(backing.getItem(entry.savedKey!),oldSnapshot);
  assert.equal(library.load(entry.id).steps[0].description,'');
});

test('index write failure cleans the staged snapshot without falsely marking the new drawing saved',()=>{
  const {backing,library}=repository(),entry=library.save(fixture(),{kind:'saved'}),oldIndex=backing.getItem(DIAGRAM_LIBRARY_KEY);
  const changed=fixture();changed.steps[0].description='索引提交前中断';backing.fail(key=>key===DIAGRAM_LIBRARY_KEY);
  assert.throws(()=>library.save(changed,{id:entry.id,kind:'saved'}));assert.equal(backing.getItem(DIAGRAM_LIBRARY_KEY),oldIndex);assert.equal(library.load(entry.id,'saved').steps[0].description,'');
  const keys=[...backing.values.keys()].filter(key=>key.startsWith('zhezhi.diagram-library-doc-')&&key!==entry.savedKey);assert.equal(keys.length,1);assert.equal(backing.getItem(keys[0]),'');
});

test('a cleanup failure reports a warning but keeps the successfully committed new draft and saved archive',()=>{
  const backing=storage(),warnings:string[]=[];let id=0;const library=createDiagramLibrary(backing,{idFactory:()=>`doc-${++id}`,onWarning:message=>warnings.push(message)}),entry=library.save(fixture(),{kind:'saved'});
  const changed=fixture();changed.steps[0].description='草稿一';const draft=library.save(changed,{id:entry.id,kind:'draft'});
  backing.fail((key,value)=>key===draft.draftKey&&value==='');changed.steps[0].description='草稿二';const updated=library.save(changed,{id:entry.id,kind:'draft'});
  assert.equal(updated.savedKey,entry.savedKey);assert.equal(warnings.length,1);assert.ok(backing.getItem(draft.draftKey!));assert.equal(library.load(entry.id).steps[0].description,'草稿二');assert.equal(library.load(entry.id,'saved').steps[0].description,'');
});

test('old draft migrates once as an unsaved last drawing without modifying its legacy backup',()=>{
  const {backing,library}=repository(),legacy=exportDiagramProject(fixture());backing.setItem(DIAGRAM_LEGACY_DRAFT_KEY,legacy);
  const migrated=library.migrateLegacy();assert.equal(migrated.documents.length,1);assert.equal(migrated.lastOpenId,migrated.documents[0].id);assert.equal(migrated.documents[0].savedKey,null);assert.equal(library.load(migrated.lastOpenId!).name,'小鸟折序');assert.equal(backing.getItem(DIAGRAM_LEGACY_DRAFT_KEY),legacy);
  assert.deepEqual(library.migrateLegacy(),migrated);assert.equal(library.read().documents.length,1);
});

test('migration never overwrites an existing library or drops it because the legacy draft is corrupt',()=>{
  const {backing,library}=repository(),saved=library.save(fixture(),{kind:'saved'}),before=library.read();backing.setItem(DIAGRAM_LEGACY_DRAFT_KEY,'invalid legacy JSON');
  assert.deepEqual(library.migrateLegacy(),before);assert.equal(library.load(saved.id).name,'小鸟折序');
  backing.setItem(DIAGRAM_LIBRARY_KEY,'invalid directory JSON');assert.throws(()=>library.migrateLegacy(),/目录损坏/);assert.equal(backing.getItem(DIAGRAM_LIBRARY_KEY),'invalid directory JSON');
});

test('folder creation, nested movement and rename keep complete documents and independent folders',()=>{
  const {library}=repository(),saved=library.save(fixture(),{kind:'saved'}),folder=library.createFolder('动物'),child=library.createFolder('鸟类',folder.id);
  library.moveDocument(saved.id,child.id);library.renameDocument(saved.id,'丹顶鹤');
  const index=library.read();assert.equal(index.documents[0].folderId,child.id);assert.equal(library.load(saved.id).name,'丹顶鹤');assert.equal(library.load(saved.id,'saved').name,'丹顶鹤');assert.equal(index.folders[1].parentId,folder.id);
  assert.throws(()=>library.createFolder('鸟类',folder.id),/已有/);assert.throws(()=>library.moveDocument(saved.id,'missing-folder'),/找不到/);assert.equal(library.read().documents[0].folderId,child.id);
  library.moveDocument(saved.id,null);assert.equal(library.read().documents[0].folderId,null);assert.equal(library.read().documents.length,1);
});

test('project snapshots retain all shared CP states, active step, drawing objects and folder-independent recents',()=>{
  const {library}=repository();let project=fixture(),nextId=10;project=appendDiagramStep(project,()=>`step-${++nextId}`);project.steps[1].description='第二步';project.steps[1].annotations=[{id:'arrow',kind:'symbol',symbol:'fold',position:[12,12],size:22,rotation:30,color:'#293d35',width:.7}];
  const entry=library.save(project,{kind:'draft'}),second=library.save(fixture(),{kind:'saved'});library.markOpen(entry.id);
  assert.equal(library.read().lastOpenId,entry.id);assert.equal(library.read().documents.find(doc=>doc.id===entry.id)!.stepCount,2);assert.equal(library.read().documents.length,2);assert.notEqual(second.id,entry.id);assert.deepEqual(library.load(entry.id),project);
  assert.throws(()=>library.load(entry.id,'saved'),/尚无手动保存版本/);
});

test('thumbnail SVG comes from actual drawing geometry and falls back to its real CP when there is no folded model',()=>{
  const project=fixture();project.states[0].doc.segments.push({id:'diagonal',a:[0,0],b:[100,100],assignment:'V',angle:180});
  assert.match(diagramLibraryThumbnail(project),/M 0 0 L 100 100/);
  project.steps[0].annotations=[{id:'line',kind:'line',a:[11,22],b:[33,44],style:'valley',color:'#293d35',width:.7}];
  const preview=diagramLibraryThumbnail(project);assert.match(preview,/<svg/);assert.match(preview,/11/);assert.match(preview,/22/);
});

test('a library reload restores both flat and pulled model snapshots with their source CP, pose, drawing order and hidden layers',()=>{
  const {library}=repository(),source=blankDoc('模型状态',100,100);source.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'V',angle:180},{id:'mark',a:[0,50],b:[100,50],assignment:'F',angle:0});
  let id=0,project=createDiagramProject(source,()=>`model-${++id}`);const step=project.steps[0],result=computeFlatFold(source,undefined,{flatCreases:'marks'});
  project=adoptDiagramPose(project,step.id,step.beforeId,result);const flat=project.steps[0].pose!;
  project=recordDiagramPaperPull(updateDiagramPoseResult(project,step.id,moveFoldedVertices(flat.result,{group:[0],selected:[0]},[120,-10])),step.id,flat,[]);
  project=updateDiagramHiddenFaces(project,step.id,[1]);const entry=library.save(project,{kind:'saved'}),loaded=library.load(entry.id);
  assert.equal(loaded.steps[0].paperStates!.active,'pulled');assert.deepEqual(loaded.steps[0].pose!.hiddenFaces,[1]);assert.deepEqual(loaded.steps[0].pose!.result.geometry.vertices,project.steps[0].pose!.result.geometry.vertices);assert.deepEqual(loaded.states,project.states);
  const restoredFlat=switchDiagramPaperState(loaded,step.id,'flat');assert.deepEqual(restoredFlat.steps[0].pose!.result.geometry.vertices,flat.result.geometry.vertices);assert.deepEqual(restoredFlat.steps[0].pose!.hiddenFaces,[1]);
});

test('corrupt stored documents and cyclic folder indexes reject without silently recreating a blank library',()=>{
  const {backing,library}=repository(),entry=library.save(fixture(),{kind:'saved'}),original=backing.getItem(DIAGRAM_LIBRARY_KEY)!;
  backing.setItem(entry.savedKey!,'null');assert.throws(()=>library.load(entry.id),/格式损坏/);assert.equal(backing.getItem(DIAGRAM_LIBRARY_KEY),original);
  const index=JSON.parse(original);index.folders=[{id:'cycle',name:'错误文件夹',parentId:'cycle',createdAt:100}];backing.setItem(DIAGRAM_LIBRARY_KEY,JSON.stringify(index));
  assert.throws(()=>library.read(),/关系损坏/);assert.throws(()=>library.save(fixture(),{kind:'draft'}),/关系损坏/);assert.deepEqual(JSON.parse(backing.getItem(DIAGRAM_LIBRARY_KEY)!),index);
});

test('a library grid reads the directory once and each thumbnail at most once, while explicit opens still validate fresh snapshots',()=>{
  const {backing,library}=repository();for(let i=0;i<8;i++){const project=fixture();project.name=`绘图 ${i}`;library.save(project,{kind:'saved'});}
  const reloaded=createDiagramLibrary(backing);backing.reads.length=0;const index=reloaded.read();
  for(let cycle=0;cycle<3;cycle++)for(const entry of index.documents)assert.match(reloaded.getThumbnail(entry.id)!,/<svg/);
  assert.equal(backing.reads.filter(key=>key===DIAGRAM_LIBRARY_KEY).length,1);assert.equal(backing.reads.length,9);
  const first=index.documents[0];backing.setItem(first.savedKey!,'null');assert.throws(()=>reloaded.load(first.id),/格式损坏/);
});

test('reusing a staging slot invalidates cached thumbnails and a newly read external revision updates its preview',()=>{
  const {backing,library}=repository(),project=fixture(),entry=library.save(project,{kind:'saved'});const previews:string[]=[];
  for(let i=0;i<7;i++){project.steps[0].annotations=[{id:'line',kind:'line',a:[i+10,22],b:[33,44],style:'valley',color:'#293d35',width:.7}];library.save(project,{id:entry.id,kind:'draft'});previews.push(library.getThumbnail(entry.id)!);}
  assert.equal(new Set(previews).size,7);
  const external=createDiagramLibrary(backing);external.load(entry.id);project.steps[0].annotations![0]={id:'line',kind:'line',a:[88,22],b:[99,44],style:'valley',color:'#293d35',width:.7};external.save(project,{id:entry.id,kind:'draft'});
  library.read();assert.notEqual(library.getThumbnail(entry.id),previews.at(-1));assert.match(library.getThumbnail(entry.id)!,/88/);
});

test('deleting a drawing commits its directory first, clears every owned revision and cache, and retains other drawings and folders',async()=>{
  const {backing,library}=repository(),folder=library.createFolder('保留文件夹'),other=library.save(fixture(),{kind:'saved',folderId:folder.id});
  const project=fixture(),entry=library.save(project,{kind:'saved'});project.steps[0].description='草稿一';library.save(project,{id:entry.id,kind:'draft'});project.steps[0].description='草稿二';library.save(project,{id:entry.id,kind:'draft'});
  const target=library.read().documents.find(doc=>doc.id===entry.id)!,keys=[...new Set([target.draftKey,target.savedKey,...(target.spareKeys??[])])].filter((key):key is string=>!!key);
  assert.equal(keys.length,3);assert.ok(library.getThumbnail(entry.id));const otherBody=backing.getItem(other.savedKey!);backing.writes.length=0;
  const result=await library.deleteDocument(entry.id);
  assert.equal(result.warning,null);assert.equal(backing.writes[0].key,DIAGRAM_LIBRARY_KEY);assert.equal(JSON.parse(backing.writes[0].value).documents.some((doc:{id:string})=>doc.id===entry.id),false);
  assert.ok(backing.writes.slice(1).every(write=>keys.includes(write.key)&&write.value===''));
  for(const key of keys)assert.equal(backing.getItem(key),'');
  assert.equal(backing.getItem(other.savedKey!),otherBody);assert.deepEqual(result.index.documents.map(doc=>doc.id),[other.id]);assert.equal(result.index.lastOpenId,null);assert.deepEqual(result.index.folders,[folder]);
  assert.throws(()=>library.getThumbnail(entry.id),/找不到/);assert.throws(()=>library.load(entry.id),/找不到/);assert.equal(library.load(other.id).name,'小鸟折序');
  const reloaded=createDiagramLibrary(backing);assert.deepEqual(reloaded.read(),result.index);
});

test('deleting another drawing retains the current last-open record and does not clear an unrelated legacy draft',async()=>{
  const {backing,library}=repository(),removed=library.save(fixture(),{kind:'saved'}),current=library.save(fixture(),{kind:'draft'});
  const legacy=fixture();legacy.name='其他未迁移草稿';legacy.steps[0].description='不能误清';const raw=exportDiagramProject(legacy);backing.setItem(DIAGRAM_LEGACY_DRAFT_KEY,raw);
  const result=await library.deleteDocument(removed.id);
  assert.equal(result.index.lastOpenId,current.id);assert.equal(result.warning,null);assert.equal(backing.getItem(DIAGRAM_LEGACY_DRAFT_KEY),raw);assert.equal(result.index.deletedLegacy,undefined);
  assert.equal(library.load(current.id).name,'小鸟折序');
});

test('deletion index write failure preserves saved, draft, spare, legacy and the last-open record without reporting success',async()=>{
  const backing=storage(),warnings:string[]=[],library=createDiagramLibrary(backing,{onWarning:message=>warnings.push(message)}),project=fixture(),entry=library.save(project,{kind:'saved'});
  project.steps[0].description='当前草稿';library.save(project,{id:entry.id,kind:'draft'});backing.setItem(DIAGRAM_LEGACY_DRAFT_KEY,exportDiagramProject(project));
  const before=[...backing.values];backing.fail(key=>key===DIAGRAM_LIBRARY_KEY);
  await assert.rejects(library.deleteDocument(entry.id),/存储已满/);
  assert.deepEqual([...backing.values],before);assert.deepEqual(warnings,[]);assert.equal(library.read().lastOpenId,entry.id);assert.ok(library.getThumbnail(entry.id));
  assert.equal(library.load(entry.id,'saved').steps[0].description,'');assert.equal(library.load(entry.id).steps[0].description,'当前草稿');
});

test('successful deletion records an exact legacy tombstone before cleanup and survives payload or warning callback failures',async()=>{
  const backing=storage(),warnings:string[]=[],library=createDiagramLibrary(backing,{onWarning:message=>{warnings.push(message);throw Error('提示回调失败');}}),project=fixture(),entry=library.save(project,{kind:'saved'});
  const raw=exportDiagramProject(project);backing.setItem(DIAGRAM_LEGACY_DRAFT_KEY,raw);backing.fail((_key,value)=>value==='');backing.writes.length=0;
  const result=await library.deleteDocument(entry.id);
  assert.match(result.warning!,/已删除.*暂未清理/);assert.equal(warnings.length,1);assert.equal(result.index.documents.length,0);assert.equal(result.index.lastOpenId,null);
  assert.match(result.index.deletedLegacy![0],/^[a-f0-9]{64}$/);assert.deepEqual(JSON.parse(backing.writes[0].value).deletedLegacy,result.index.deletedLegacy);
  assert.equal(backing.getItem(entry.savedKey!),JSON.stringify({format:'zhezhi-diagram-library-document',version:1,project,thumbnail:diagramLibraryThumbnail(project)}));assert.equal(backing.getItem(DIAGRAM_LEGACY_DRAFT_KEY),raw);
  assert.deepEqual(createDiagramLibrary(backing).migrateLegacy(),result.index);assert.throws(()=>library.getThumbnail(entry.id),/找不到/);
});

test('a matching legacy saved version is cleared while deletion also removes its newer draft',async()=>{
  const {backing,library}=repository(),project=fixture(),entry=library.save(project,{kind:'saved'});backing.setItem(DIAGRAM_LEGACY_DRAFT_KEY,exportDiagramProject(project));
  project.steps[0].description='更新草稿';const draft=library.save(project,{id:entry.id,kind:'draft'});
  const result=await library.deleteDocument(entry.id);assert.equal(result.warning,null);assert.equal(backing.getItem(DIAGRAM_LEGACY_DRAFT_KEY),'');assert.equal(backing.getItem(entry.savedKey!),'');assert.equal(backing.getItem(draft.draftKey!),'');
  assert.equal(createDiagramLibrary(backing).migrateLegacy().documents.length,0);
});

test('changes while hashing a matching legacy snapshot abort deletion rather than overwriting concurrent drawing edits',async()=>{
  for(const changed of ['index','legacy']){
    const {backing,library}=repository(),project=fixture(),entry=library.save(project,{kind:'saved'});backing.setItem(DIAGRAM_LEGACY_DRAFT_KEY,exportDiagramProject(project));const body=backing.getItem(entry.savedKey!);
    const pending=library.deleteDocument(entry.id);
    if(changed==='index')library.renameDocument(entry.id,'并发保留的新名称');else backing.setItem(DIAGRAM_LEGACY_DRAFT_KEY,exportDiagramProject({...project,name:'其他草稿'}));
    await assert.rejects(pending,/删除期间发生变化/);assert.equal(library.read().documents.length,1);assert.equal(backing.getItem(entry.savedKey!),body);assert.equal(library.read().deletedLegacy,undefined);
    if(changed==='index')assert.equal(library.load(entry.id).name,'并发保留的新名称');else assert.equal(JSON.parse(backing.getItem(DIAGRAM_LEGACY_DRAFT_KEY)!).name,'其他草稿');
  }
});

test('a snapshot still referenced by another drawing is never cleared by deletion',async()=>{
  const {backing,library}=repository(),first=library.save(fixture(),{kind:'saved'}),second=library.save(fixture(),{kind:'saved'}),index=library.read();
  index.documents[1].savedKey=first.savedKey;index.documents[1].draftKey=first.draftKey;backing.setItem(DIAGRAM_LIBRARY_KEY,JSON.stringify(index));const shared=backing.getItem(first.savedKey!);
  await library.deleteDocument(first.id);assert.equal(backing.getItem(first.savedKey!),shared);assert.equal(library.load(second.id).name,'小鸟折序');
});

test('unknown or repeated deletions reject without changing the remaining directory',async()=>{
  const {backing,library}=repository(),entry=library.save(fixture(),{kind:'saved'});const before=[...backing.values];
  await assert.rejects(library.deleteDocument('missing'),/找不到/);assert.deepEqual([...backing.values],before);
  await library.deleteDocument(entry.id);const deleted=[...backing.values];await assert.rejects(library.deleteDocument(entry.id),/找不到/);assert.deepEqual([...backing.values],deleted);
});

test('a post-commit legacy cleanup read error reports a warning without falsely rejecting the deletion',async()=>{
  const backing=storage();let committed=false;
  const access={getItem(key:string){if(committed&&key===DIAGRAM_LEGACY_DRAFT_KEY)throw Error('清理读取失败');return backing.getItem(key);},setItem(key:string,value:string){backing.setItem(key,value);if(key===DIAGRAM_LIBRARY_KEY&&JSON.parse(value).documents.length===0)committed=true;}};
  const library=createDiagramLibrary(access),project=fixture(),entry=library.save(project,{kind:'saved'});backing.setItem(DIAGRAM_LEGACY_DRAFT_KEY,exportDiagramProject(project));
  const result=await library.deleteDocument(entry.id);assert.equal(result.index.documents.length,0);assert.match(result.warning!,/已删除.*暂未清理/);assert.equal(library.read().documents.length,0);assert.equal(backing.getItem(entry.savedKey!),'');
});
