import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateBrowserPreferenceStorage} from '../../src/app/browserPreferenceMigration';
import {createDiagramLibrary,DIAGRAM_LIBRARY_KEY,DIAGRAM_LEGACY_DRAFT_KEY} from '../../src/app/diagramLibrary';
import {createDiagramProject,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {blankDoc} from '../../src/app/state';
import {initializeStoragePreferences,applyStorageDirectories,storageBootstrapError,storageBootstrapStatus} from '../../src/app/storageSettings';
import {preferenceStorage,setPreferenceService} from '../../src/app/preferenceStorage';

function store(){const values=new Map<string,string>(),writes:{key:string;value:string}[]=[];let fail:((key:string,value:string)=>boolean)|null=null;return {values,writes,get length(){return values.size;},key:(index:number)=>[...values.keys()][index]??null,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{if(fail?.(key,value))throw Error('模拟迁移写入失败');values.set(key,value);writes.push({key,value});},reject:(predicate:typeof fail)=>{fail=predicate;}};}
function project(name='同名绘图',description=''){let id=0;const p=createDiagramProject(blankDoc(name,100,100),()=>`step-${++id}`);p.steps[0].description=description;return p;}
function repo(ids:string[]=[]){const backing=store();let id=0;return {backing,library:createDiagramLibrary(backing,{idFactory:()=>ids[id++]??`doc-${id}`,now:()=>100+id})};}
const names=(backing:ReturnType<typeof store>)=>createDiagramLibrary(backing).read().documents.map(entry=>entry.name);

test('local index A and service index B are merged with both drawings accessible and local untouched',async()=>{
  const local=repo(['local-a']),disk=repo(['service-b']);local.library.save(project('浏览器绘图 A'),{kind:'saved'});const old=disk.library.save(project('磁盘绘图 B'),{kind:'saved'}),before=[...local.backing.values];
  const result=await migrateBrowserPreferenceStorage(local.backing,disk.backing);assert.equal(result.importedDocuments,1);assert.deepEqual(names(disk.backing),['磁盘绘图 B','浏览器绘图 A']);assert.equal(disk.library.load(old.id).name,'磁盘绘图 B');assert.deepEqual([...local.backing.values],before);
  assert.equal(disk.backing.writes.at(-1)!.key,DIAGRAM_LIBRARY_KEY);
});

test('merged library indexes above 1 MB retain all deletion records and source drawings',async()=>{
  const local=repo(['local-a']),disk=repo(['service-b']);local.library.save(project('浏览器绘图 A'),{kind:'saved'});disk.library.save(project('磁盘绘图 B'),{kind:'saved'});
  const deletedLegacy=Array.from({length:16_000},(_,index)=>index.toString(16).padStart(64,'0'));
  const localIndex={...local.library.read(),deletedLegacy};local.backing.setItem(DIAGRAM_LIBRARY_KEY,JSON.stringify(localIndex));
  const before=[...local.backing.values];
  const result=await migrateBrowserPreferenceStorage(local.backing,disk.backing);
  assert.equal(result.importedDocuments,1);assert.ok(Buffer.byteLength(disk.backing.getItem(DIAGRAM_LIBRARY_KEY)!)>1_000_000);
  assert.deepEqual(disk.library.read().deletedLegacy,deletedLegacy);assert.deepEqual(names(disk.backing),['磁盘绘图 B','浏览器绘图 A']);
  assert.deepEqual([...local.backing.values],before);
  assert.equal((await migrateBrowserPreferenceStorage(local.backing,disk.backing)).indexChanged,false);
});
test('an intentionally empty target library does not swallow a nonempty browser library',async()=>{
  const local=repo(),disk=repo();local.library.save(project('浏览器绘图'),{kind:'draft'});disk.backing.setItem(DIAGRAM_LIBRARY_KEY,JSON.stringify(disk.library.read()));await migrateBrowserPreferenceStorage(local.backing,disk.backing);assert.deepEqual(names(disk.backing),['浏览器绘图']);
});
test('same ID and same saved/latest snapshot are deduplicated without overwriting service metadata',async()=>{
  const local=repo(['shared']),disk=repo(['shared']),p=project('原绘图');local.library.save(p,{kind:'saved'});const existing=disk.library.save(p,{kind:'saved'});disk.library.renameDocument(existing.id,'磁盘中的新名称');
  const result=await migrateBrowserPreferenceStorage(local.backing,disk.backing);assert.equal(result.importedDocuments,0);assert.deepEqual(names(disk.backing),['磁盘中的新名称']);assert.equal(disk.library.read().lastOpenId,existing.id);
});
test('same ID with different saved and draft versions retains both original service and browser histories',async()=>{
  const local=repo(['shared']),disk=repo(['shared']);const saved=local.library.save(project('同名绘图','浏览器手动保存'),{kind:'saved'});local.library.save(project('同名绘图','浏览器未保存修改'),{id:saved.id,kind:'draft'});const original=disk.library.save(project('同名绘图','磁盘原绘图'),{kind:'saved'});
  await migrateBrowserPreferenceStorage(local.backing,disk.backing);const index=disk.library.read(),imported=index.documents.find(entry=>entry.id!==original.id)!;
  assert.equal(index.documents.length,2);assert.notEqual(imported.name,index.documents[0].name);assert.equal(disk.library.load(original.id).steps[0].description,'磁盘原绘图');assert.equal(disk.library.load(imported.id).steps[0].description,'浏览器未保存修改');assert.equal(disk.library.load(imported.id,'saved').steps[0].description,'浏览器手动保存');
});
test('conflicting payload keys are remapped and never overwrite the target body',async()=>{
  const local=repo(['local']),disk=repo(['disk']),a=local.library.save(project('A','local body'),{kind:'saved'}),b=disk.library.save(project('B','disk body'),{kind:'saved'});
  const localRaw=local.backing.getItem(a.savedKey!)!,diskRaw=disk.backing.getItem(b.savedKey!)!,index=local.library.read();index.documents[0].savedKey=b.savedKey;index.documents[0].draftKey=b.savedKey;local.backing.setItem(b.savedKey!,localRaw);local.backing.setItem(DIAGRAM_LIBRARY_KEY,JSON.stringify(index));
  await migrateBrowserPreferenceStorage(local.backing,disk.backing);const imported=disk.library.read().documents.find(entry=>entry.id==='local')!;
  assert.notEqual(imported.savedKey,b.savedKey);assert.equal(disk.backing.getItem(b.savedKey!),diskRaw);assert.equal(disk.library.load(imported.id).steps[0].description,'local body');assert.equal(disk.library.load(b.id).steps[0].description,'disk body');
});
test('colliding folders and document IDs preserve the browser parent chain without merging different folder names',async()=>{
  const local=repo(['shared','child','local-a']),disk=repo(['shared','child']);const targetFolder=disk.library.createFolder('磁盘分类');disk.library.save(project('磁盘图'),{kind:'saved'});const parent=local.library.createFolder('动物'),child=local.library.createFolder('鸟类',parent.id);local.library.save(project('鹤'),{kind:'saved',folderId:child.id});
  await migrateBrowserPreferenceStorage(local.backing,disk.backing);const index=disk.library.read(),animal=index.folders.find(folder=>folder.name==='动物')!,bird=index.folders.find(folder=>folder.name==='鸟类')!,drawing=index.documents.find(entry=>entry.name==='鹤')!;
  assert.notEqual(animal.id,targetFolder.id);assert.notEqual(bird.id,'child');assert.equal(bird.parentId,animal.id);assert.equal(drawing.folderId,bird.id);assert.equal(index.folders.length,3);
});
test('same folder paths merge even when their source IDs differ, and service last-open remains authoritative',async()=>{
  const local=repo(['local-folder','local-doc']),disk=repo(['disk-folder','disk-doc']);const a=local.library.createFolder('折纸'),b=disk.library.createFolder('折纸'),last=disk.library.save(project('原图'),{kind:'saved',folderId:b.id});local.library.save(project('新图'),{kind:'saved',folderId:a.id});
  await migrateBrowserPreferenceStorage(local.backing,disk.backing);const index=disk.library.read();assert.equal(index.folders.length,1);assert.ok(index.documents.every(entry=>entry.folderId===b.id));assert.equal(index.lastOpenId,last.id);
});
test('repeat import remains idempotent after the service edits and resaves an imported drawing',async()=>{
  const local=repo(['local']),disk=repo(['disk']);local.library.save(project('A','旧浏览器内容'),{kind:'saved'});disk.library.save(project('B'),{kind:'saved'});await migrateBrowserPreferenceStorage(local.backing,disk.backing);
  const imported=disk.library.read().documents.find(entry=>entry.id==='local')!;const changed=disk.library.load(imported.id);changed.steps[0].description='磁盘已经修改并手动保存';disk.library.save(changed,{id:imported.id,kind:'saved'});const before=disk.backing.getItem(DIAGRAM_LIBRARY_KEY),writes=disk.backing.writes.length;
  const again=await migrateBrowserPreferenceStorage(local.backing,disk.backing);assert.equal(again.importedDocuments,0);assert.equal(again.indexChanged,false);assert.equal(disk.backing.writes.length,writes);assert.equal(disk.backing.getItem(DIAGRAM_LIBRARY_KEY),before);assert.equal(disk.library.load(imported.id).steps[0].description,'磁盘已经修改并手动保存');assert.equal(disk.library.read().documents.length,2);
});
test('a genuinely new local revision is kept separately without replacing the prior imported service drawing',async()=>{
  const local=repo(['same']),disk=repo();const a=local.library.save(project('A','版本一'),{kind:'saved'});await migrateBrowserPreferenceStorage(local.backing,disk.backing);local.library.save(project('A','版本二'),{id:a.id,kind:'saved'});await migrateBrowserPreferenceStorage(local.backing,disk.backing);
  const index=disk.library.read();assert.equal(index.documents.length,2);assert.equal(new Set(index.documents.map(entry=>entry.name)).size,2);assert.deepEqual(new Set(index.documents.map(entry=>disk.library.load(entry.id).steps[0].description)),new Set(['版本一','版本二']));
});
test('different browser and service legacy drafts remain openable even with an existing library',async()=>{
  const local=repo(),disk=repo(['existing']);disk.library.save(project('已有图 C'),{kind:'saved'});local.backing.setItem(DIAGRAM_LEGACY_DRAFT_KEY,exportDiagramProject(project('浏览器旧草稿 A')));const serviceLegacy=exportDiagramProject(project('磁盘旧草稿 B'));disk.backing.setItem(DIAGRAM_LEGACY_DRAFT_KEY,serviceLegacy);
  await migrateBrowserPreferenceStorage(local.backing,disk.backing);assert.deepEqual(new Set(names(disk.backing)),new Set(['已有图 C','磁盘旧草稿 B','浏览器旧草稿 A']));assert.equal(disk.backing.getItem(DIAGRAM_LEGACY_DRAFT_KEY),serviceLegacy);for(const entry of disk.library.read().documents)assert.equal(disk.library.load(entry.id).steps.length,1);
});
test('the copied legacy backup cannot resurrect a stale drawing after later service saves',async()=>{
  const local=repo(),disk=repo();local.backing.setItem(DIAGRAM_LEGACY_DRAFT_KEY,exportDiagramProject(project('旧草稿','原内容')));await migrateBrowserPreferenceStorage(local.backing,disk.backing);const original=disk.library.read().documents[0],changed=disk.library.load(original.id);changed.steps[0].description='后来修改';disk.library.save(changed,{id:original.id,kind:'saved'});
  const again=await migrateBrowserPreferenceStorage(local.backing,disk.backing);assert.equal(again.importedDocuments,0);assert.equal(disk.library.read().documents.length,1);assert.equal(disk.library.load(original.id).steps[0].description,'后来修改');
});
test('legacy snapshots already present in saved/draft history do not create duplicate drawings',async()=>{
  const local=repo(['a']),disk=repo();const p=project('A');local.library.save(p,{kind:'saved'});local.backing.setItem(DIAGRAM_LEGACY_DRAFT_KEY,exportDiagramProject(p));await migrateBrowserPreferenceStorage(local.backing,disk.backing);assert.equal(disk.library.read().documents.length,1);
});
test('deletion cleanup failure cannot resurrect a service legacy draft during repeated browser migrations',async()=>{
  const local=repo(),disk=repo(),p=project('已删除旧草稿'),entry=disk.library.save(p,{kind:'saved'}),legacy=exportDiagramProject(p);
  disk.backing.setItem(DIAGRAM_LEGACY_DRAFT_KEY,legacy);disk.backing.reject((_key,value)=>value==='');
  const deleted=await disk.library.deleteDocument(entry.id);assert.ok(deleted.warning);disk.backing.reject(null);
  const other=local.library.save(project('保留浏览器绘图'),{kind:'saved'});
  for(let round=0;round<2;round++)await migrateBrowserPreferenceStorage(local.backing,disk.backing);
  assert.deepEqual(names(disk.backing),['保留浏览器绘图']);assert.equal(disk.library.load(other.id).name,'保留浏览器绘图');assert.equal(disk.backing.getItem(DIAGRAM_LEGACY_DRAFT_KEY),legacy);
  assert.deepEqual(disk.library.read().deletedLegacy,deleted.index.deletedLegacy);
});
test('browser deletion tombstones travel with migration and suppress copying a deleted legacy into an empty service',async()=>{
  const local=repo(),disk=repo(),p=project('浏览器已删除'),entry=local.library.save(p,{kind:'draft'}),legacy=exportDiagramProject(p);
  local.backing.setItem(DIAGRAM_LEGACY_DRAFT_KEY,legacy);local.backing.reject((_key,value)=>value==='');await local.library.deleteDocument(entry.id);local.backing.reject(null);
  const before=[...local.backing.values],result=await migrateBrowserPreferenceStorage(local.backing,disk.backing);
  assert.equal(result.importedDocuments,0);assert.equal(disk.library.read().documents.length,0);assert.equal(disk.backing.getItem(DIAGRAM_LEGACY_DRAFT_KEY),null);assert.deepEqual(disk.library.read().deletedLegacy,local.library.read().deletedLegacy);assert.deepEqual([...local.backing.values],before);
  const again=await migrateBrowserPreferenceStorage(local.backing,disk.backing);assert.equal(again.indexChanged,false);assert.equal(again.importedDocuments,0);
});
test('a deleted exact legacy signature never suppresses an unrelated legacy drawing or an explicitly saved drawing',async()=>{
  const local=repo(),disk=repo(),deleted=project('已删除','旧内容'),entry=disk.library.save(deleted,{kind:'saved'});
  disk.backing.setItem(DIAGRAM_LEGACY_DRAFT_KEY,exportDiagramProject(deleted));await disk.library.deleteDocument(entry.id);
  const other=exportDiagramProject(project('另一个旧草稿','其他内容'));local.backing.setItem(DIAGRAM_LEGACY_DRAFT_KEY,other);local.library.save(deleted,{kind:'saved'});
  await migrateBrowserPreferenceStorage(local.backing,disk.backing);
  assert.deepEqual(new Set(names(disk.backing)),new Set(['已删除','另一个旧草稿']));assert.equal(disk.backing.getItem(DIAGRAM_LEGACY_DRAFT_KEY),'');
});
test('deleting an imported drawing preserves import receipts so the unchanged browser document cannot reappear',async()=>{
  const local=repo(['imported']),disk=repo(),p=project('已导入后删除'),entry=local.library.save(p,{kind:'saved'});local.backing.setItem(DIAGRAM_LEGACY_DRAFT_KEY,exportDiagramProject(p));
  await migrateBrowserPreferenceStorage(local.backing,disk.backing);await disk.library.deleteDocument(entry.id);
  const result=await migrateBrowserPreferenceStorage(local.backing,disk.backing);assert.equal(result.importedDocuments,0);assert.equal(disk.library.read().documents.length,0);assert.equal(disk.library.read().lastOpenId,null);
});
test('a local body key colliding with another legacy project derived key cannot alias two different projects',async()=>{
  const local=repo(['a']),disk=repo(),a=local.library.save(project('A','图 A 内容'),{kind:'saved'}),legacy=exportDiagramProject(project('B','图 B 旧稿'));
  const digest=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),value=>value.toString(16).padStart(2,'0')).join('');
  const signature=await digest(JSON.stringify(importDiagramProject(legacy))),address=await digest('legacy-payload:'+signature),collisionKey=`zhezhi.diagram-library-doc-${Array.from(address.slice(0,32),digit=>'abcdefghijklmnop'[parseInt(digit,16)]).join('')}.v1`;
  const originalBody=local.backing.getItem(a.savedKey!)!,index=local.library.read();index.documents[0].draftKey=collisionKey;index.documents[0].savedKey=collisionKey;local.backing.setItem(collisionKey,originalBody);local.backing.setItem(DIAGRAM_LIBRARY_KEY,JSON.stringify(index));local.backing.setItem(DIAGRAM_LEGACY_DRAFT_KEY,legacy);
  await migrateBrowserPreferenceStorage(local.backing,disk.backing);const drawings=disk.library.read().documents;assert.equal(drawings.length,2);assert.notEqual(drawings[0].draftKey,drawings[1].draftKey);assert.deepEqual(new Set(drawings.map(entry=>disk.library.load(entry.id).steps[0].description)),new Set(['图 A 内容','图 B 旧稿']));
});
test('payload write failure cannot publish a half-populated index, and retry adds only one copy',async()=>{
  const local=repo(['a','c']),disk=repo(['b']);local.library.save(project('A'),{kind:'saved'});local.library.save(project('C'),{kind:'saved'});const b=disk.library.save(project('B'),{kind:'saved'}),before=disk.backing.getItem(DIAGRAM_LIBRARY_KEY);let writes=0;disk.backing.reject(key=>key.startsWith('zhezhi.diagram-library-doc-')&&++writes===2);
  await assert.rejects(migrateBrowserPreferenceStorage(local.backing,disk.backing),/写入失败/);assert.equal(disk.backing.getItem(DIAGRAM_LIBRARY_KEY),before);assert.equal(disk.library.load(b.id).name,'B');assert.deepEqual(names(disk.backing),['B']);disk.backing.reject(null);await migrateBrowserPreferenceStorage(local.backing,disk.backing);assert.deepEqual(names(disk.backing),['B','A','C']);
});
test('index write failure preserves previous references and does not mark migration imported',async()=>{
  const local=repo(['a']),disk=repo(['b']);local.library.save(project('A'),{kind:'saved'});const b=disk.library.save(project('B'),{kind:'saved'}),before=disk.backing.getItem(DIAGRAM_LIBRARY_KEY),body=disk.backing.getItem(b.savedKey!);disk.backing.reject(key=>key===DIAGRAM_LIBRARY_KEY);
  await assert.rejects(migrateBrowserPreferenceStorage(local.backing,disk.backing),/写入失败/);assert.equal(disk.backing.getItem(DIAGRAM_LIBRARY_KEY),before);assert.equal(disk.backing.getItem(b.savedKey!),body);disk.backing.reject(null);await migrateBrowserPreferenceStorage(local.backing,disk.backing);assert.deepEqual(names(disk.backing),['B','A']);
});
test('corrupt local indexes, missing snapshots and invalid legacy drafts reject before any target write',async()=>{
  for(const failure of ['index','body','legacy']){const local=repo(['a']),disk=repo(['b']);const a=local.library.save(project('A'),{kind:'saved'});disk.library.save(project('B'),{kind:'saved'});if(failure==='index')local.backing.setItem(DIAGRAM_LIBRARY_KEY,'broken');if(failure==='body')local.backing.values.delete(a.savedKey!);if(failure==='legacy')local.backing.setItem(DIAGRAM_LEGACY_DRAFT_KEY,'broken');const target=[...disk.backing.values],writes=disk.backing.writes.length;await assert.rejects(migrateBrowserPreferenceStorage(local.backing,disk.backing));assert.deepEqual([...disk.backing.values],target);assert.equal(disk.backing.writes.length,writes);}
});
test('existing ordinary service preferences win while missing ordinary values copy before the final index',async()=>{
  const local=repo(['a']),disk=repo(['b']);local.library.save(project('A'),{kind:'saved'});disk.library.save(project('B'),{kind:'saved'});local.backing.setItem('zhezhi.theme.v1','local');disk.backing.setItem('zhezhi.theme.v1','service');local.backing.setItem('zhezhi.angle-settings.v1','angles');
  await migrateBrowserPreferenceStorage(local.backing,disk.backing,{keys:['zhezhi.theme.v1','zhezhi.angle-settings.v1',...local.backing.values.keys()]});assert.equal(disk.backing.getItem('zhezhi.theme.v1'),'service');assert.equal(disk.backing.getItem('zhezhi.angle-settings.v1'),'angles');assert.equal(disk.backing.writes.at(-1)!.key,DIAGRAM_LIBRARY_KEY);
});
test('a concurrent target index edit is detected rather than overwritten by the planned merge',async()=>{
  const local=repo(['a']),disk=repo(['b']);local.library.save(project('A'),{kind:'saved'});disk.library.save(project('B'),{kind:'saved'});let changed=false;
  const target={getItem:disk.backing.getItem,setItem(key:string,value:string){disk.backing.setItem(key,value);if(!changed&&key.startsWith('zhezhi.diagram-library-doc-')){changed=true;const index=disk.library.read();index.documents[0].name='其他窗口修改的 B';disk.backing.setItem(DIAGRAM_LIBRARY_KEY,JSON.stringify(index));}}};
  await assert.rejects(migrateBrowserPreferenceStorage(local.backing,target),/其他窗口/);assert.deepEqual(names(disk.backing),['其他窗口修改的 B']);await migrateBrowserPreferenceStorage(local.backing,disk.backing);assert.deepEqual(names(disk.backing),['其他窗口修改的 B','A']);
});
test('atomic CAS closes the final directory check/write race without overwriting a concurrent rename',async()=>{
  const local=repo(['a']),disk=repo(['b']);local.library.save(project('A'),{kind:'saved'});const b=disk.library.save(project('B'),{kind:'saved'}),source=[...local.backing.values];let injected=false;
  const target={getItem:disk.backing.getItem,setItem:disk.backing.setItem,compareAndSet(key:string,expected:string|null,value:string){
    if(key===DIAGRAM_LIBRARY_KEY&&!injected){injected=true;disk.library.renameDocument(b.id,'并发重命名 B');}
    if(disk.backing.getItem(key)!==expected)return false;disk.backing.setItem(key,value);return true;
  }};
  await assert.rejects(migrateBrowserPreferenceStorage(local.backing,target),/其他窗口/);assert.deepEqual(names(disk.backing),['并发重命名 B']);assert.deepEqual([...local.backing.values],source);
  await migrateBrowserPreferenceStorage(local.backing,target);assert.deepEqual(names(disk.backing),['并发重命名 B','A']);
});
test('a payload allocated by another window is never overwritten during migration staging',async()=>{
  const local=repo(['a']),disk=repo(['b']);const a=local.library.save(project('A'),{kind:'saved'});disk.library.save(project('B'),{kind:'saved'});const before=disk.backing.getItem(DIAGRAM_LIBRARY_KEY);let racedKey='';
  const target={getItem:disk.backing.getItem,setItem:disk.backing.setItem,compareAndSet(key:string,expected:string|null,value:string){
    if(!racedKey&&key.startsWith('zhezhi.diagram-library-doc-')){racedKey=key;disk.backing.setItem(key,'other window payload');}
    if(disk.backing.getItem(key)!==expected)return false;disk.backing.setItem(key,value);return true;
  }};
  await assert.rejects(migrateBrowserPreferenceStorage(local.backing,target),/其他窗口/);assert.equal(disk.backing.getItem(DIAGRAM_LIBRARY_KEY),before);assert.equal(disk.backing.getItem(racedKey),'other window payload');assert.ok(local.backing.getItem(a.savedKey!));
});
test('an identical unreferenced old body cannot be adopted while another window clears it',async()=>{
  const local=repo(['a']),disk=repo(['b']);const a=local.library.save(project('A'),{kind:'saved'});disk.library.save(project('B'),{kind:'saved'});const oldKey=a.savedKey!,body=local.backing.getItem(oldKey)!;
  disk.backing.setItem(oldKey,body);let cleared=false;
  const target={getItem:disk.backing.getItem,setItem:disk.backing.setItem,compareAndSet(key:string,expected:string|null,value:string){
    if(key===DIAGRAM_LIBRARY_KEY&&!cleared){cleared=true;assert.equal(disk.backing.getItem(oldKey),body);disk.backing.setItem(oldKey,'');}
    if(disk.backing.getItem(key)!==expected)return false;disk.backing.setItem(key,value);return true;
  }};
  await migrateBrowserPreferenceStorage(local.backing,target);const imported=disk.library.read().documents.find(entry=>entry.id===a.id)!;assert.notEqual(imported.savedKey,oldKey);assert.equal(disk.backing.getItem(oldKey),'');assert.equal(disk.library.load(a.id).name,'A');
});

async function withBrowserService(source:ReturnType<typeof store>,target:ReturnType<typeof store>,run:()=>Promise<void>,statusCode=200) {
  const names=['window','localStorage','fetch','XMLHttpRequest'] as const,original=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const status={configured:false,paths:{projectsDir:'D:/test/projects',diagramsDir:'D:/test/diagrams',dataDir:'D:/test/data'},defaults:{projectsDir:'D:/test/projects',diagramsDir:'D:/test/diagrams',dataDir:'D:/test/data'},busy:false,platform:'win32',pickerAvailable:true};
  class PreferenceRequest {
    status=200;responseText='';method='GET';url='';open(method:string,url:string){this.method=method;this.url=url;}setRequestHeader(){}
    send(body?:string){try{if(this.method==='GET'){const key=new URL(this.url,'http://isolated.test').searchParams.get('key')!;this.responseText=JSON.stringify({value:target.getItem(key)});}else{const value=JSON.parse(body!);if(Object.hasOwn(value,'expectedValue')&&target.getItem(value.key)!==value.expectedValue){this.status=409;this.responseText=JSON.stringify({error:'绘图库已在其他窗口修改'});return;}target.setItem(value.key,value.value);this.responseText=JSON.stringify({value:null});}}catch(error){this.status=507;this.responseText=JSON.stringify({error:(error as Error).message});}}
  }
  try {
    for(const [name,value] of [['window',{}],['localStorage',source],['XMLHttpRequest',PreferenceRequest],['fetch',async(url:string)=>new Response(JSON.stringify(statusCode===200?(url.endsWith('/storage/apply')?{...status,configured:true,copiedFiles:0,retainedSource:true}:status):{error:'旧服务未提供设置路由'}),{status:statusCode,headers:{'content-type':'application/json'}})]] as const)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
    await run();
  }finally{setPreferenceService(undefined);for(const name of names){const descriptor=original.get(name);if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}}
}
test('browser initialization awaits complete merging before activating disk preferences and clears its warning',async()=>{
  const local=repo(['a']),disk=repo(['b']);local.library.save(project('A'),{kind:'saved'});disk.library.save(project('B'),{kind:'saved'});local.backing.setItem('zhezhi.theme.v1','local');disk.backing.setItem('zhezhi.theme.v1','disk');
  await withBrowserService(local.backing,disk.backing,async()=>{await initializeStoragePreferences();assert.deepEqual(names(disk.backing),['B','A']);assert.equal(preferenceStorage.getItem('zhezhi.theme.v1'),'disk');assert.equal(storageBootstrapError(),'');assert.equal(storageBootstrapStatus()!.paths.diagramsDir,'D:/test/diagrams');});
});
test('a migration failure leaves the local provider active and exposes an actionable initialization warning',async()=>{
  const local=repo(['a']),disk=repo(['b']);local.library.save(project('A'),{kind:'saved'});disk.library.save(project('B'),{kind:'saved'});local.backing.setItem('zhezhi.theme.v1','local');disk.backing.setItem('zhezhi.theme.v1','disk');const before=disk.backing.getItem(DIAGRAM_LIBRARY_KEY);disk.backing.reject(key=>key===DIAGRAM_LIBRARY_KEY);
  await withBrowserService(local.backing,disk.backing,async()=>{setPreferenceService({getItem:()=> 'previous provider',setItem(){}});await assert.rejects(initializeStoragePreferences(),/写入失败/);assert.equal(preferenceStorage.getItem('zhezhi.theme.v1'),'local');assert.equal(storageBootstrapStatus(),null);assert.match(storageBootstrapError(),/浏览器绘图尚未迁移/);assert.match(storageBootstrapError(),/原浏览器数据.*保留/);assert.equal(disk.backing.getItem(DIAGRAM_LIBRARY_KEY),before);});
});
test('an old service route failure is distinguished from a browser migration error',async()=>{
  await withBrowserService(store(),store(),async()=>{await assert.rejects(initializeStoragePreferences(),/旧服务/);assert.equal(storageBootstrapError(),'');assert.equal(storageBootstrapStatus(),null);},404);
});
test('a successful settings retry after import failure activates disk preferences and clears the bootstrap warning',async()=>{
  const local=repo(['a']),disk=repo(['b']);local.library.save(project('A'),{kind:'saved'});disk.library.save(project('B'),{kind:'saved'});local.backing.setItem('zhezhi.theme.v1','local');disk.backing.setItem('zhezhi.theme.v1','disk');disk.backing.reject(key=>key===DIAGRAM_LIBRARY_KEY);
  await withBrowserService(local.backing,disk.backing,async()=>{await assert.rejects(initializeStoragePreferences());assert.equal(preferenceStorage.getItem('zhezhi.theme.v1'),'local');assert.ok(storageBootstrapError());disk.backing.reject(null);const result=await applyStorageDirectories({});assert.equal(result.configured,true);assert.equal(storageBootstrapStatus()!.configured,true);assert.equal(storageBootstrapError(),'');assert.equal(preferenceStorage.getItem('zhezhi.theme.v1'),'disk');assert.deepEqual(names(disk.backing),['B','A']);});
});
