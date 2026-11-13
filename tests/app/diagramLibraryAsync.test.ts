import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDiagramLibrary,DIAGRAM_LIBRARY_KEY,DIAGRAM_LEGACY_DRAFT_KEY,DiagramLibraryConflictError} from '../../src/app/diagramLibrary';
import {createDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {blankDoc} from '../../src/app/state';

function fixture(){return createDiagramProject(blankDoc('异步绘图',100,100));}
function store(){
  const disk=new Map<string,string>(),cache=new Map<string,string>(),reads:string[]=[];
  return {disk,cache,reads,getItem:(key:string)=>cache.get(key)??null,setItem:(key:string,value:string)=>{disk.set(key,value);cache.set(key,value);},
    compareAndSet:(key:string,expected:string|null,value:string)=>{if((disk.get(key)??null)!==expected)return false;disk.set(key,value);cache.set(key,value);return true;},
    async getItemAsync(key:string){reads.push(key);const value=disk.get(key)??null;if(value===null)cache.delete(key);else cache.set(key,value);return value;}};
}

test('async open reads a cold payload without synchronous disk access and validates before publishing',async()=>{
  const storage=store(),writer=createDiagramLibrary(storage),project=fixture(),entry=writer.save(project,{kind:'saved'});
  storage.cache.clear();const library=createDiagramLibrary(storage);let prepared=false;
  const loaded=await library.loadAsync(entry.id,async text=>{prepared=true;const payload=JSON.parse(text);return importDiagramProject(JSON.stringify(payload.project));});
  assert.equal(prepared,true);assert.equal(loaded.name,entry.name);assert.deepEqual(loaded.states,project.states);
  assert.ok(storage.reads.includes(entry.draftKey!));assert.ok(storage.reads.includes(DIAGRAM_LIBRARY_KEY));
});

test('an external revision arriving during async preparation is rejected without adopting its head',async()=>{
  const storage=store(),writer=createDiagramLibrary(storage),entry=writer.save(fixture(),{kind:'saved'}),library=createDiagramLibrary(storage);
  await assert.rejects(library.loadAsync(entry.id,async text=>{
    const index=JSON.parse(storage.disk.get(DIAGRAM_LIBRARY_KEY)!);index.documents[0].modifiedAt++;index.documents[0].name='外窗修改';storage.disk.set(DIAGRAM_LIBRARY_KEY,JSON.stringify(index));
    return importDiagramProject(JSON.stringify(JSON.parse(text).project));
  }),DiagramLibraryConflictError);
  assert.equal(library.read().documents[0].name,'外窗修改');
});

test('a worker-confirmed save refreshes the cached directory before the UI reads it',async()=>{
  const storage=store();let stamp=1;
  const worker=createDiagramLibrary({getItem:key=>storage.disk.get(key)??null,setItem:(key,value)=>storage.disk.set(key,value),compareAndSet:(key,expected,value)=>{if((storage.disk.get(key)??null)!==expected)return false;storage.disk.set(key,value);return true;}},{now:()=>stamp++});
  const library=createDiagramLibrary(storage,{backgroundSave:async request=>{
    if(!('project' in request))throw Error('unexpected promotion');const entry=worker.save(request.project,request.settings);
    return {entry,index:worker.read(),thumbnail:worker.getCachedThumbnail(entry.draftKey),warnings:[]};
  }});
  const entry=await library.saveAsync(fixture(),{kind:'draft'});
  assert.ok(library.read().documents.some(item=>item.id===entry.id));
});

test('a failed optional refresh cannot turn a worker-confirmed save into failure or hide its directory entry',async()=>{
  const storage=store(),warnings:string[]=[];
  const worker=createDiagramLibrary({getItem:key=>storage.disk.get(key)??null,setItem:(key,value)=>storage.disk.set(key,value)});
  const library=createDiagramLibrary({...storage,getItemAsync:async()=>{throw Error('目录刷新暂不可用');}},{onWarning:value=>warnings.push(value),backgroundSave:async request=>{
    if(!('project' in request))throw Error('unexpected');const entry=worker.save(request.project,request.settings);
    return {entry,index:worker.read(),thumbnail:null,warnings:[]};
  }});
  const entry=await library.saveAsync(fixture(),{kind:'draft'});
  assert.equal(library.read().documents[0].id,entry.id);assert.equal(warnings.length,1);
  assert.ok(JSON.parse(storage.disk.get(DIAGRAM_LIBRARY_KEY)!).documents.some((item:{id:string})=>item.id===entry.id));
});

test('legacy migration is asynchronous, and an existing empty library suppresses a legacy re-import',async()=>{
  const storage=store(),project=fixture();storage.disk.set(DIAGRAM_LEGACY_DRAFT_KEY,JSON.stringify(project));
  const library=createDiagramLibrary(storage,{backgroundSave:async request=>{
    const worker=createDiagramLibrary({getItem:key=>storage.disk.get(key)??null,setItem:(key,value)=>storage.disk.set(key,value)});
    if(!('project' in request))throw Error('unexpected');const entry=worker.save(request.project,request.settings);return {entry,index:worker.read(),thumbnail:null,warnings:[]};
  }});
  const migrated=await library.migrateLegacyAsync(async text=>importDiagramProject(text));assert.equal(migrated.documents.length,1);
  storage.disk.set(DIAGRAM_LIBRARY_KEY,JSON.stringify({format:'zhezhi-diagram-library',version:1,documents:[],folders:[],lastOpenId:null}));storage.cache.clear();
  const untouched=await createDiagramLibrary(storage).migrateLegacyAsync(async()=>{throw Error('must not load a deleted legacy draft');});assert.equal(untouched.documents.length,0);
});

test('two windows migrating the same legacy draft commit only one directory even when both prepare before saving',async()=>{
  const storage=store();storage.disk.set(DIAGRAM_LEGACY_DRAFT_KEY,JSON.stringify(fixture()));
  let prepared=0,release!:()=>void;const barrier=new Promise<void>(resolve=>{release=resolve;});
  const make=()=>createDiagramLibrary(storage,{backgroundSave:async request=>{
    const writer=createDiagramLibrary({getItem:key=>storage.disk.get(key)??null,setItem:(key,value)=>storage.disk.set(key,value),compareAndSet:(key,expected,value)=>{if((storage.disk.get(key)??null)!==expected)return false;storage.disk.set(key,value);return true;}});
    if(!('project' in request))throw Error('unexpected');const entry=writer.save(request.project,request.settings);return {entry,index:writer.read(),thumbnail:null,warnings:[]};
  }});
  const prepare=async(text:string)=>{if(++prepared===2)release();await barrier;return importDiagramProject(text);};
  const [a,b]=await Promise.all([make().migrateLegacyAsync(prepare),make().migrateLegacyAsync(prepare)]);
  assert.equal(a.documents.length,1);assert.equal(b.documents.length,1);assert.equal(JSON.parse(storage.disk.get(DIAGRAM_LIBRARY_KEY)!).documents.length,1);
});
