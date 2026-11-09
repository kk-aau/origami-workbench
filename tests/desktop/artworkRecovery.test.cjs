const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {createArtworkRecovery}=require('../../desktop/artworkRecovery.cjs');
const {createStorageLocations}=require('../../desktop/storageLocations.cjs');
const base=path.resolve(__dirname,'../../output/artwork-recovery-tests');
const artwork=name=>JSON.stringify({format:'zhezhi-artwork',version:1,editor:{schemaVersion:2,name,paper:{width:100,height:100},segments:[],objects:[],metadata:{original:'保留'}},models:null,diagram:null,simulation:null,construction:{tessellation:{family:'ring'},curve:null}});
async function fixture(options={}){await fs.mkdir(base,{recursive:true});const directory=await fs.mkdtemp(path.join(base,'recovery-'));return {directory,store:createArtworkRecovery({directory,...options}),file:id=>path.join(directory,`artwork-recovery-${id}.json`),async dispose(){assert.equal(path.dirname(directory),base);await fs.rm(directory,{recursive:true,force:true});}};}

test('independent window slots survive reopening and never overwrite each other',async()=>{
  const task=await fixture();try{
    const a=randomUUID(),b=randomUUID();const saved=await task.store.save({id:a,expectedRevision:null,text:artwork('窗口A')});await task.store.save({id:b,expectedRevision:null,text:artwork('窗口B')});
    const reopened=createArtworkRecovery({directory:task.directory}),list=await reopened.list();assert.equal(list.entries.length,2);assert.deepEqual(list.warnings,[]);
    const loaded=await reopened.load(a);assert.equal(JSON.parse(loaded.text).editor.name,'窗口A');assert.equal(loaded.summary.revision,saved.revision);
    assert.equal(JSON.parse((await reopened.load(b)).text).editor.name,'窗口B');
  }finally{await task.dispose();}
});

test('complete artwork recovers model-source data above the former 32 MiB file limit',async()=>{
  const task=await fixture();try{
    const id=randomUUID(),raw=JSON.parse(artwork('大模型来源'));
    const source={...raw.editor,metadata:{padding:'x'.repeat(32*1024*1024+1)}};
    // The store validates envelopes and source documents; model topology is
    // validated by the renderer codec when restoring the complete artwork.
    raw.models={activeId:'large-model',entries:[{id:'large-model',name:'大模型',snapshot:{format:'zhezhi-folded-model',version:2,source,model:{vertices:[]}},view:{}}]};
    const text=JSON.stringify(raw),saved=await task.store.save({id,expectedRevision:null,text});
    const reopened=createArtworkRecovery({directory:task.directory}),loaded=await reopened.load(id);
    assert.equal(loaded.text,text);assert.equal(loaded.summary.revision,saved.revision);assert.equal(loaded.summary.models,1);
  }finally{await task.dispose();}
});

test('a failed atomic replacement retains exact old bytes and cleans temporary files',async()=>{
  const task=await fixture();try{
    const id=randomUUID(),saved=await task.store.save({id,expectedRevision:null,text:artwork('原稿')}),before=await fs.readFile(task.file(id));
    const failing=createArtworkRecovery({directory:task.directory,beforeCommit(){throw Error('磁盘提交失败');}});
    await assert.rejects(failing.save({id,expectedRevision:saved.revision,text:artwork('失败的新稿')}),/磁盘提交失败/);
    assert.deepEqual(await fs.readFile(task.file(id)),before);assert.deepEqual(await fs.readdir(task.directory),[path.basename(task.file(id))]);
  }finally{await task.dispose();}
});

test('compare-and-swap gives one concurrent same-slot winner and allows independent slots',async()=>{
  const task=await fixture();try{
    const id=randomUUID(),saved=await task.store.save({id,expectedRevision:null,text:artwork('原稿')}),other=createArtworkRecovery({directory:task.directory});
    const result=await Promise.allSettled([task.store,other].map((store,i)=>store.save({id,expectedRevision:saved.revision,text:artwork(`分支${i}`)})));
    assert.equal(result.filter(row=>row.status==='fulfilled').length,1);assert.equal(result.find(row=>row.status==='rejected').reason.code,'artwork_recovery_conflict');
    await Promise.all([task.store,other].map((store,i)=>store.save({id:randomUUID(),expectedRevision:null,text:artwork(`独立${i}`)})));
    assert.equal((await task.store.list()).entries.length,3);
  }finally{await task.dispose();}
});

test('deletion keeps a durable tombstone and stale autosaves cannot resurrect the slot',async()=>{
  const task=await fixture();try{
    const id=randomUUID(),saved=await task.store.save({id,expectedRevision:null,text:artwork('待删除')});
    await task.store.remove({id,expectedRevision:saved.revision});assert.equal((await task.store.list()).entries.length,0);
    const reopened=createArtworkRecovery({directory:task.directory});await assert.rejects(reopened.load(id),{status:404});
    for(const expectedRevision of [null,saved.revision])await assert.rejects(reopened.save({id,expectedRevision,text:artwork('过期自动保存')}),{status:409});
    await reopened.save({id:randomUUID(),expectedRevision:null,text:artwork('新窗口')});assert.equal((await reopened.list()).entries.length,1);
  }finally{await task.dispose();}
});

test('invalid version, fields, document or text cannot replace a valid record',async()=>{
  const task=await fixture();try{
    const id=randomUUID(),saved=await task.store.save({id,expectedRevision:null,text:artwork('原稿')}),before=await fs.readFile(task.file(id));
    for(const mutate of [raw=>raw.version=2,raw=>raw.other=true,raw=>raw.editor.paper.width=-1,raw=>raw.construction={},raw=>raw.models={activeId:'missing',entries:[]}]){
      const raw=JSON.parse(artwork('无效'));mutate(raw);await assert.rejects(task.store.save({id,expectedRevision:saved.revision,text:JSON.stringify(raw)}));assert.deepEqual(await fs.readFile(task.file(id)),before);
    }
    for(const text of [null,{},'中'.repeat(1024)])await assert.rejects(task.store.save({id,expectedRevision:saved.revision,text}),{status:400});
    await assert.rejects(task.store.load('../escape'));assert.deepEqual(await fs.readFile(task.file(id)),before);
  }finally{await task.dispose();}
});

test('corrupt records remain visible for explicit removal without hiding healthy records',async()=>{
  const task=await fixture();try{
    const bad=randomUUID(),good=randomUUID();await fs.writeFile(task.file(bad),'damaged-json');await task.store.save({id:good,expectedRevision:null,text:artwork('有效稿')});
    const list=await task.store.list(),damaged=list.entries.find(entry=>entry.id===bad);assert.equal(list.entries.length,2);assert.equal(damaged.damaged,true);assert.equal(list.warnings.length,1);
    await assert.rejects(task.store.load(bad),/损坏/);await task.store.remove({id:bad,expectedRevision:damaged.revision});assert.deepEqual((await task.store.list()).entries.map(entry=>entry.id),[good]);
  }finally{await task.dispose();}
});

test('recovery records above the former 128 MiB aggregate quota do not evict other windows',async()=>{
  const task=await fixture();try{
    const ids=Array.from({length:4},()=>randomUUID()),raw=JSON.parse(artwork('保留独立窗口'));
    raw.editor.metadata.padding='x'.repeat(32*1024*1024);const text=JSON.stringify(raw);
    for(const id of ids)await task.store.save({id,expectedRevision:null,text});
    const before=await Promise.all(ids.map(id=>fs.stat(task.file(id))));
    assert.ok(before.reduce((sum,info)=>sum+info.size,0)>128*1024*1024);
    const current=randomUUID(),saved=await task.store.save({id:current,expectedRevision:null,text:artwork('新窗口')});
    await task.store.save({id:current,expectedRevision:saved.revision,text:artwork('继续保存')});
    assert.equal(JSON.parse((await task.store.load(current)).text).editor.name,'继续保存');
    const after=await Promise.all(ids.map(id=>fs.stat(task.file(id))));
    assert.deepEqual(after.map(info=>[info.size,info.mtimeMs]),before.map(info=>[info.size,info.mtimeMs]));
    assert.equal((await fs.readdir(task.directory)).length,5);
  }finally{await task.dispose();}
});

test('data-directory migration includes complete artwork snapshots and deletion tombstones',async()=>{
  const task=await fixture();try{
    const bootstrap=path.join(task.directory,'original'),manager=createStorageLocations({bootstrapRoot:bootstrap}),repository=createArtworkRecovery({directory:()=>manager.status().paths.dataDir});
    const live=randomUUID(),deleted=randomUUID();await repository.save({id:live,expectedRevision:null,text:artwork('随目录迁移')});const old=await repository.save({id:deleted,expectedRevision:null,text:artwork('删除记录')});await repository.remove({id:deleted,expectedRevision:old.revision});
    const target=path.join(task.directory,'new-data');await fs.mkdir(target);const selection=manager.registerSelection('dataDir',target);
    await manager.apply({selections:{dataDir:selection.selectionId},migrate:true});
    assert.equal(JSON.parse((await repository.load(live)).text).editor.name,'随目录迁移');await assert.rejects(repository.save({id:deleted,expectedRevision:null,text:artwork('不得复活')}),{status:409});
    for(const id of [live,deleted])assert.deepEqual(await fs.readFile(path.join(bootstrap,`artwork-recovery-${id}.json`)),await fs.readFile(path.join(target,`artwork-recovery-${id}.json`)));
  }finally{await task.dispose();}
});
