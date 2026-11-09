const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {createStorageLocations,registerStoragePicker}=require('../../desktop/storageLocations.cjs');
const {createPreferences}=require('../../desktop/preferences.cjs');
const base=path.resolve(__dirname,'../../output/storage-locations-tests-1013');fs.mkdirSync(base,{recursive:true});
const docId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',snapshotKey='zhezhi.diagram-library-doc-'+ 'a'.repeat(32)+'.v1';
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function fixture(){
  const root=fs.mkdtempSync(path.join(base,'storage-')),bootstrap=path.join(root,'original');
  const manager=createStorageLocations({bootstrapRoot:bootstrap}),targets=Object.fromEntries(['projectsDir','diagramsDir','dataDir'].map(kind=>{const target=path.join(root,kind);fs.mkdirSync(target);return [kind,target];}));
  const store=createPreferences(manager.preferenceFile,{beforeWrite:manager.assertWritable});
  const dispose=()=>{assert.equal(path.dirname(root),base);assert.match(path.basename(root),/^storage-/);fs.rmSync(root,{recursive:true,force:true});};
  const selections=()=>Object.fromEntries(Object.entries(targets).map(([kind,target])=>[kind,manager.registerSelection(kind,target).selectionId]));
  return {root,bootstrap,manager,targets,store,dispose,selections};
}

test('default directories are usable before the first setup is explicitly confirmed',async()=>{
  const task=fixture();try{const status=task.manager.status();assert.equal(status.configured,false);assert.equal(status.paths.dataDir,task.bootstrap);assert.equal(status.paths.projectsDir,path.join(task.bootstrap,'projects'));assert.equal(fs.existsSync(path.join(task.bootstrap,'storage-locations.json')),false);
    task.store.setItem('zhezhi.theme.v1','dark');task.store.setItem('zhezhi.diagram-library.v1','library');task.store.setItem(snapshotKey,'drawing');
    assert.equal(JSON.parse(fs.readFileSync(path.join(status.paths.dataDir,'preferences.json'),'utf8'))['zhezhi.theme.v1'],'dark');assert.equal(JSON.parse(fs.readFileSync(path.join(status.paths.diagramsDir,snapshotKey+'.json'),'utf8')),'drawing');
    const confirmed=await task.manager.apply({selections:{},migrate:true});assert.equal(confirmed.configured,true);assert.equal(confirmed.copiedFiles,0);assert.equal(confirmed.retainedSource,true);
  }finally{task.dispose();}
});

test('legacy combined desktop settings split by key without overwriting target values or altering the original',()=>{
  const task=fixture();try{const profile=path.join(task.root,'profile');fs.mkdirSync(profile);const oldFile=path.join(profile,'preferences.json'),legacy={'zhezhi.theme.v1':'old-dark','zhezhi.diagram-project.v1':'draft','zhezhi.diagram-library.v1':'index',[snapshotKey]:'complete saved drawing'};fs.writeFileSync(oldFile,JSON.stringify(legacy));fs.writeFileSync(path.join(profile,'desktop.log'),'old application log');const oldDigest=digest(oldFile);
    task.store.setItem('zhezhi.theme.v1','new-light');const migrated=createStorageLocations({bootstrapRoot:task.bootstrap,legacyPreferencesFile:oldFile}),store=createPreferences(migrated.preferenceFile);
    assert.equal(store.getItem('zhezhi.theme.v1'),'new-light');assert.equal(store.getItem(snapshotKey),'complete saved drawing');assert.equal(store.getItem('zhezhi.diagram-project.v1'),'draft');assert.equal(digest(oldFile),oldDigest);assert.equal(migrated.status().configured,false);assert.equal(fs.readFileSync(path.join(task.bootstrap,'desktop.log'),'utf8'),'old application log');
    const ordinary=JSON.parse(fs.readFileSync(path.join(task.bootstrap,'preferences.json'),'utf8'));assert.equal(Object.hasOwn(ordinary,snapshotKey),false);
  }finally{task.dispose();}
});

test('a completed legacy split is marked once and future launches never revive obsolete source snapshots',()=>{
  const task=fixture();try{const oldFile=path.join(task.root,'legacy.json');fs.writeFileSync(oldFile,JSON.stringify({'zhezhi.diagram-library.v1':'initial index',[snapshotKey]:'old snapshot'}));
    const first=createStorageLocations({bootstrapRoot:task.bootstrap,legacyPreferencesFile:oldFile}),store=createPreferences(first.preferenceFile);store.setItem('zhezhi.diagram-library.v1','newer index');store.setItem(snapshotKey,'');
    const next=createStorageLocations({bootstrapRoot:task.bootstrap,legacyPreferencesFile:oldFile}),reloaded=createPreferences(next.preferenceFile);assert.equal(reloaded.getItem('zhezhi.diagram-library.v1'),'newer index');assert.equal(reloaded.getItem(snapshotKey),'');assert.equal(JSON.parse(fs.readFileSync(path.join(task.bootstrap,'legacy-preferences-import.json'),'utf8')).source,oldFile);assert.equal(fs.existsSync(oldFile),true);
  }finally{task.dispose();}
});

test('an unmarked legacy library conflict rejects before writing any target or hiding source drawing records',()=>{
  const task=fixture();try{task.store.setItem('zhezhi.diagram-library.v1','target index');task.store.setItem('zhezhi.theme.v1','target theme');const file=path.join(task.root,'legacy.json');fs.writeFileSync(file,JSON.stringify({'zhezhi.angle-settings.v1':'source angles','zhezhi.diagram-library.v1':'source index',[snapshotKey]:'source drawing'}));
    assert.throws(()=>createStorageLocations({bootstrapRoot:task.bootstrap,legacyPreferencesFile:file}),/文档库不同/);assert.equal(task.store.getItem('zhezhi.diagram-library.v1'),'target index');assert.equal(task.store.getItem(snapshotKey),null);assert.equal(task.store.getItem('zhezhi.angle-settings.v1'),null);assert.equal(fs.existsSync(path.join(task.bootstrap,'legacy-preferences-import.json')),false);assert.equal(JSON.parse(fs.readFileSync(file,'utf8'))[snapshotKey],'source drawing');
  }finally{task.dispose();}
});

test('matching legacy indexes with different referenced snapshot contents reject instead of swallowing the old model version',()=>{
  const task=fixture();try{task.store.setItem('zhezhi.diagram-library.v1','identical index');task.store.setItem(snapshotKey,'current geometry');const file=path.join(task.root,'legacy.json');fs.writeFileSync(file,JSON.stringify({'zhezhi.diagram-library.v1':'identical index',[snapshotKey]:'old geometry'}));
    assert.throws(()=>createStorageLocations({bootstrapRoot:task.bootstrap,legacyPreferencesFile:file}),/不同版本/);assert.equal(task.store.getItem(snapshotKey),'current geometry');assert.equal(JSON.parse(fs.readFileSync(file,'utf8'))[snapshotKey],'old geometry');assert.equal(fs.existsSync(path.join(task.bootstrap,'legacy-preferences-import.json')),false);
  }finally{task.dispose();}
});

test('migration copies verified managed files, preserves sources and later writes use the new folders',async()=>{
  const task=fixture();try{const before=task.manager.status().paths;fs.writeFileSync(path.join(before.projectsDir,docId+'.json'),'saved complete project');fs.writeFileSync(path.join(before.projectsDir,docId+'.json.bak'),'prior project');fs.writeFileSync(path.join(before.projectsDir,'unrelated.txt'),'unrelated');fs.mkdirSync(path.join(before.dataDir,'other-folder'));fs.writeFileSync(path.join(before.dataDir,'recovery.json'),'recovery');fs.writeFileSync(path.join(before.dataDir,'recovery.json.bak'),'backup');fs.writeFileSync(path.join(before.dataDir,'desktop.log'),'application log');
    task.store.setItem('zhezhi.theme.v1','dark');task.store.setItem('zhezhi.diagram-library.v1','index');task.store.setItem(snapshotKey,'saved-drawing');const oldProjectDigest=digest(path.join(before.projectsDir,docId+'.json'));
    fs.writeFileSync(path.join(task.targets.dataDir,'unrelated.txt'),'keep target file');const result=await task.manager.apply({selections:task.selections(),migrate:true});assert.equal(result.configured,true);assert.equal(result.busy,false);assert.equal(result.copiedFiles,8);assert.equal(result.retainedSource,true);
    assert.equal(digest(path.join(task.targets.projectsDir,docId+'.json')),oldProjectDigest);assert.equal(digest(path.join(before.projectsDir,docId+'.json')),oldProjectDigest);assert.equal(task.store.getItem(snapshotKey),'saved-drawing');assert.equal(fs.existsSync(path.join(task.targets.projectsDir,'unrelated.txt')),false);assert.equal(fs.existsSync(path.join(task.targets.dataDir,'other-folder')),false);
    task.store.setItem('zhezhi.theme.v1','new-theme');assert.equal(JSON.parse(fs.readFileSync(path.join(task.targets.dataDir,'preferences.json'),'utf8'))['zhezhi.theme.v1'],'new-theme');assert.equal(JSON.parse(fs.readFileSync(path.join(before.dataDir,'preferences.json'),'utf8'))['zhezhi.theme.v1'],'dark');
    assert.deepEqual(createStorageLocations({bootstrapRoot:task.bootstrap}).status().paths,task.targets);assert.ok(fs.existsSync(path.join(task.bootstrap,'storage-locations.json')));
  }finally{task.dispose();}
});

test('different target files reject the whole switch without replacing either copy',async()=>{
  const task=fixture();try{task.store.setItem('zhezhi.theme.v1','old');const source=task.manager.status().paths;fs.writeFileSync(path.join(source.projectsDir,docId+'.json'),'source drawing');fs.writeFileSync(path.join(task.targets.projectsDir,docId+'.json'),'target drawing');
    await assert.rejects(task.manager.apply({selections:task.selections(),migrate:true}),/已有不同/);assert.equal(task.manager.status().configured,false);assert.deepEqual(task.manager.status().paths,source);assert.equal(fs.readFileSync(path.join(task.targets.projectsDir,docId+'.json'),'utf8'),'target drawing');assert.equal(fs.readFileSync(path.join(source.projectsDir,docId+'.json'),'utf8'),'source drawing');assert.equal(fs.existsSync(path.join(task.bootstrap,'storage-migration.lock')),false);
  }finally{task.dispose();}
});

test('crease document drafts and their backups migrate with saved projects and library folders',async()=>{
  const task=fixture();try{
    const before=task.manager.status().paths;
    for(const suffix of ['.json','.draft.json','.draft.json.bak'])fs.writeFileSync(path.join(before.projectsDir,docId+suffix),'preserve '+suffix);
    task.store.setItem('zhezhi.crease-library.v1','crease folders and recent documents');
    await task.manager.apply({selections:task.selections(),migrate:true});
    for(const suffix of ['.json','.draft.json','.draft.json.bak']){
      assert.equal(fs.readFileSync(path.join(task.targets.projectsDir,docId+suffix),'utf8'),'preserve '+suffix);
      assert.equal(fs.readFileSync(path.join(before.projectsDir,docId+suffix),'utf8'),'preserve '+suffix);
    }
    assert.equal(task.store.getItem('zhezhi.crease-library.v1'),'crease folders and recent documents');
  }finally{task.dispose();}
});

test('activity logs and both bounded rotations migrate intact, while unrelated files stay behind',async()=>{
  const task=fixture();try{
    const source=task.manager.status().paths.dataDir;
    for(const name of ['activity.ndjson','activity.1.ndjson','activity.2.ndjson','activity.3.ndjson'])fs.writeFileSync(path.join(source,name),JSON.stringify({action:name})+'\n');
    const result=await task.manager.apply({selections:task.selections(),migrate:true});
    assert.equal(result.copiedFiles,3);
    for(const name of ['activity.ndjson','activity.1.ndjson','activity.2.ndjson']){
      assert.equal(fs.readFileSync(path.join(task.targets.dataDir,name),'utf8'),fs.readFileSync(path.join(source,name),'utf8'));
      assert.equal(fs.existsSync(path.join(source,name)),true);
    }
    assert.equal(fs.existsSync(path.join(task.targets.dataDir,'activity.3.ndjson')),false);
  }finally{task.dispose();}
});

test('a failed final configuration write keeps the old pointer and all original documents',async()=>{
  const task=fixture();const originalRename=fs.renameSync;try{await task.manager.apply({selections:{},migrate:true});task.store.setItem('zhezhi.theme.v1','original');const previous=task.manager.status(),configFile=path.join(task.bootstrap,'storage-locations.json'),oldConfig=fs.readFileSync(configFile,'utf8');
    fs.renameSync=(from,to)=>{if(to===configFile)throw Object.assign(new Error('模拟配置写入失败'),{code:'EPERM'});return originalRename(from,to);};
    await assert.rejects(task.manager.apply({selections:task.selections(),migrate:true}),/模拟配置/);assert.equal(fs.readFileSync(configFile,'utf8'),oldConfig);assert.deepEqual(task.manager.status().paths,previous.paths);assert.equal(task.store.getItem('zhezhi.theme.v1'),'original');
  }finally{fs.renameSync=originalRename;task.dispose();}
});

test('source changes during a copy are detected before selecting the new folders',async()=>{
  const task=fixture(),originalRead=fsp.readFile;try{const source=path.join(task.manager.status().paths.projectsDir,docId+'.json');fs.writeFileSync(source,'original');let changed=false;
    fsp.readFile=async(file,...args)=>{const bytes=await originalRead(file,...args);if(file===source&&!changed){changed=true;fs.writeFileSync(source,'changed by another writer');}return bytes;};
    await assert.rejects(task.manager.apply({selections:task.selections(),migrate:true}),/校验失败/);assert.equal(task.manager.status().configured,false);assert.equal(fs.readFileSync(source,'utf8'),'changed by another writer');assert.equal(fs.existsSync(path.join(task.targets.projectsDir,docId+'.json')),false);
  }finally{fsp.readFile=originalRead;task.dispose();}
});

test('a source changed after staging but during deployment is checked again before the final pointer switch',async()=>{
  const task=fixture(),originalCopy=fsp.copyFile;try{const source=path.join(task.manager.status().paths.projectsDir,docId+'.json');fs.writeFileSync(source,'original');let changed=false;
    fsp.copyFile=async(...args)=>{await originalCopy(...args);if(!changed){changed=true;fs.writeFileSync(source,'new external edit');}};
    await assert.rejects(task.manager.apply({selections:task.selections(),migrate:true}),/发生变化/);assert.equal(task.manager.status().configured,false);assert.equal(fs.readFileSync(source,'utf8'),'new external edit');assert.equal(task.manager.status().paths.projectsDir,path.dirname(source));
  }finally{fsp.copyFile=originalCopy;task.dispose();}
});

test('an identical pre-existing destination is rechecked before switching instead of trusting its first hash',async()=>{
  const task=fixture(),originalCopy=fsp.copyFile;try{task.store.setItem('zhezhi.theme.v1','source theme');const source=path.join(task.manager.status().paths.projectsDir,docId+'.json');fs.writeFileSync(source,'drawing');const targetPrefs=path.join(task.targets.dataDir,'preferences.json');fs.copyFileSync(task.manager.preferenceFile('zhezhi.theme.v1'),targetPrefs);let changed=false;
    fsp.copyFile=async(...args)=>{await originalCopy(...args);if(!changed){changed=true;fs.writeFileSync(targetPrefs,JSON.stringify({'zhezhi.theme.v1':'changed target'}));}};
    await assert.rejects(task.manager.apply({selections:task.selections(),migrate:true}),/目标文件.*发生变化/);assert.equal(task.manager.status().configured,false);assert.equal(task.store.getItem('zhezhi.theme.v1'),'source theme');assert.equal(JSON.parse(fs.readFileSync(targetPrefs,'utf8'))['zhezhi.theme.v1'],'changed target');
  }finally{fsp.copyFile=originalCopy;task.dispose();}
});

test('the write queue drains before copying and writes accepted afterward use the new path',async()=>{
  const task=fixture();try{let release;const held=new Promise(resolve=>{release=resolve;}),events=[];
    const oldWrite=task.manager.runWrite(async paths=>{await held;events.push('old write');fs.writeFileSync(path.join(paths.projectsDir,docId+'.json'),'last old write');});
    const migration=task.manager.apply({selections:task.selections(),migrate:true},{beforeCopy:()=>events.push('copy')});
    const newWrite=task.manager.runWrite(paths=>{events.push('new write');fs.writeFileSync(path.join(paths.projectsDir,docId+'.json'),'new location write');});
    release();await Promise.all([oldWrite,migration,newWrite]);assert.deepEqual(events,['old write','copy','new write']);assert.equal(fs.readFileSync(path.join(task.bootstrap,'projects',docId+'.json'),'utf8'),'last old write');assert.equal(fs.readFileSync(path.join(task.targets.projectsDir,docId+'.json'),'utf8'),'new location write');
  }finally{task.dispose();}
});

test('direct desktop preference writes are blocked while migration is copying, then resume normally',async()=>{
  const task=fixture();try{let release,entered;const held=new Promise(resolve=>{release=resolve;}),copying=new Promise(resolve=>{entered=resolve;});const migration=task.manager.apply({selections:task.selections(),migrate:true},{beforeCopy:async()=>{entered();await held;}});await copying;
    assert.equal(task.manager.status().busy,true);assert.throws(()=>task.store.setItem('zhezhi.theme.v1','race'),/正在迁移/);release();await migration;task.store.setItem('zhezhi.theme.v1','after');assert.equal(task.store.getItem('zhezhi.theme.v1'),'after');
  }finally{task.dispose();}
});

test('paths only come from confirmed selection tokens; traversal, drive roots, stale kinds and overlapping categories reject',async()=>{
  const task=fixture();try{assert.throws(()=>task.manager.registerSelection('projectsDir','../outside'),/绝对路径/);assert.throws(()=>task.manager.registerSelection('projectsDir',path.parse(task.root).root),/根目录/);assert.throws(()=>task.manager.registerSelection('wrong',task.root),/类别无效/);
    await assert.rejects(task.manager.apply({selections:{},migrate:false}),/迁移后应用/);await assert.rejects(task.manager.apply({selections:{},migrate:true,path:task.targets.dataDir}),/选择窗口/);await assert.rejects(task.manager.apply({selections:{projectsDir:'../../escape'},migrate:true}),/选择已失效/);
    const wrongKind=task.manager.registerSelection('dataDir',task.targets.dataDir);await assert.rejects(task.manager.apply({selections:{projectsDir:wrongKind.selectionId},migrate:true}),/选择已失效/);
    const duplicate=Object.fromEntries(['projectsDir','diagramsDir','dataDir'].map(kind=>[kind,task.manager.registerSelection(kind,task.targets.dataDir).selectionId]));await assert.rejects(task.manager.apply({selections:duplicate,migrate:true}),/不同文件夹/);assert.equal(task.manager.status().configured,false);
  }finally{task.dispose();}
});

test('cancelled picker does not configure a directory and successful picker returns an opaque selection',async()=>{
  const task=fixture();try{let selected=null;const manager=createStorageLocations({bootstrapRoot:task.bootstrap,picker:async()=>selected});assert.deepEqual(await manager.pickDirectory('projectsDir'),{cancelled:true});selected=task.targets.projectsDir;const result=await manager.pickDirectory('projectsDir');assert.equal(result.path,selected);assert.match(result.selectionId,/^[a-f0-9-]{36}$/);assert.equal(manager.status().configured,false);
    await manager.apply({selections:{projectsDir:result.selectionId},migrate:true});assert.equal(manager.status().paths.projectsDir,selected);
  }finally{task.dispose();}
});

test('damaged bootstrap configuration is preserved rather than silently selecting an empty document library',()=>{
  const task=fixture();try{const config=path.join(task.bootstrap,'storage-locations.json');fs.writeFileSync(config,'broken configuration');assert.throws(()=>createStorageLocations({bootstrapRoot:task.bootstrap}),/损坏/);assert.equal(fs.readFileSync(config,'utf8'),'broken configuration');
    fs.writeFileSync(config,'null');assert.throws(()=>createStorageLocations({bootstrapRoot:task.bootstrap}),/损坏/);assert.equal(fs.readFileSync(config,'utf8'),'null');
  }finally{task.dispose();}
});

for(const kind of ['projectsDir','diagramsDir','dataDir'])test(`unavailable configured ${kind} starts repair mode without recreating the old folder or accepting writes`,async()=>{
  const task=fixture();try{
    await task.manager.apply({selections:task.selections(),migrate:true});
    const configFile=path.join(task.bootstrap,'storage-locations.json'),configBytes=fs.readFileSync(configFile,'utf8'),original=task.targets[kind],offline=original+'-offline';
    fs.writeFileSync(path.join(original,'preserved.txt'),'original data');fs.renameSync(original,offline);
    const manager=createStorageLocations({bootstrapRoot:task.bootstrap}),state=manager.status();
    assert.deepEqual(state.unavailable.map(item=>item.kind),[kind]);assert.equal(state.paths[kind],original);assert.equal(fs.existsSync(original),false);assert.equal(fs.readFileSync(configFile,'utf8'),configBytes);
    assert.throws(()=>manager.assertReadable(kind),error=>error.status===503);assert.throws(()=>manager.assertWritable(),error=>error.status===503);
    if(kind!=='projectsDir')assert.throws(()=>createPreferences(manager.preferenceFile).getItem(kind==='diagramsDir'?snapshotKey:'zhezhi.theme.v1'),error=>error.status===503);
    await assert.rejects(manager.runWrite(()=>assert.fail('must not write to missing storage')),error=>error.status===503);
    const selected=manager.registerSelection(kind,offline),selections={[kind]:selected.selectionId};
    await assert.rejects(manager.apply({selections,migrate:true}),/明确重新选择/);
    await assert.rejects(manager.apply({selections:{},migrate:true,recoverUnavailable:true}),/明确重新选择/);
    const repaired=await manager.apply({selections,migrate:true,recoverUnavailable:true});
    assert.deepEqual(repaired.unavailable,[]);assert.equal(repaired.paths[kind],offline);assert.equal(fs.readFileSync(path.join(offline,'preserved.txt'),'utf8'),'original data');
    assert.deepEqual(JSON.parse(fs.readFileSync(configFile+'.bak','utf8')),JSON.parse(configBytes));assert.equal(fs.existsSync(original),false);
    assert.equal(createStorageLocations({bootstrapRoot:task.bootstrap}).status().paths[kind],offline);
  }finally{task.dispose();}
});

test('migration preserves independent drawing payloads and project deletion tombstones',async()=>{
  const task=fixture();try{
    const paths=task.manager.status().paths;task.store.setItem(snapshotKey,'complete independent body');task.store.setItem('zhezhi.diagram-project.v1','legacy recovery body');
    for(const name of ['project-tombstones.json','project-tombstones.json.bak'])fs.writeFileSync(path.join(paths.dataDir,name),'deletion history');
    await task.manager.apply({selections:task.selections(),migrate:true});
    for(const key of [snapshotKey,'zhezhi.diagram-project.v1'])assert.equal(fs.readFileSync(path.join(paths.diagramsDir,key+'.json'),'utf8'),fs.readFileSync(path.join(task.targets.diagramsDir,key+'.json'),'utf8'));
    for(const name of ['project-tombstones.json','project-tombstones.json.bak'])assert.equal(fs.readFileSync(path.join(task.targets.dataDir,name),'utf8'),'deletion history');
  }finally{task.dispose();}
});

test('native directory IPC rejects foreign windows, subframes and invalid kinds before opening a dialog',async()=>{
  const task=fixture();try{let handler,calls=0;const frame={url:'http://127.0.0.1:1234/'},owner={webContents:{mainFrame:frame}},registered=[];
    registerStoragePicker({ipcMain:{handle:(channel,callback)=>{assert.equal(channel,'desktop:storage-pick');handler=callback;}},dialog:{showOpenDialog:async(window,options)=>{calls++;assert.equal(window,owner);assert.deepEqual(options.properties,['openDirectory','createDirectory']);return {canceled:false,filePaths:[task.targets.projectsDir]};}},getWindow:()=>owner,origin:'http://127.0.0.1:1234',locations:task.manager,registerSelection:(kind,selected)=>{registered.push(kind);return task.manager.registerSelection(kind,selected);}});
    for(const [event,kind] of [[{sender:{},senderFrame:frame},'projectsDir'],[{sender:owner.webContents,senderFrame:{url:frame.url}},'projectsDir'],[{sender:owner.webContents,senderFrame:frame},'../outside']])await assert.rejects(handler(event,kind),/不允许/);
    frame.url='https://untrusted.invalid';await assert.rejects(handler({sender:owner.webContents,senderFrame:frame},'projectsDir'),/不允许/);assert.equal(calls,0);
    frame.url='http://127.0.0.1:1234/';const result=await handler({sender:owner.webContents,senderFrame:frame},'projectsDir');assert.equal(calls,1);assert.equal(result.path,task.targets.projectsDir);assert.match(result.selectionId,/^[a-f0-9-]{36}$/);assert.deepEqual(registered,['projectsDir']);assert.equal(task.manager.status().configured,false);
  }finally{task.dispose();}
});

test('cancelled native selection returns no path or token and duplicate dialogs are blocked until it completes',async()=>{
  const task=fixture();try{let handler,finish;const frame={url:'http://127.0.0.1:1234/'},owner={webContents:{mainFrame:frame}},event={sender:owner.webContents,senderFrame:frame};
    registerStoragePicker({ipcMain:{handle:(_,callback)=>{handler=callback;}},dialog:{showOpenDialog:()=>new Promise(resolve=>{finish=resolve;})},getWindow:()=>owner,origin:'http://127.0.0.1:1234',locations:task.manager,registerSelection:()=>{throw new Error('Cancellation must not register any destination');}});
    const first=handler(event,'dataDir');await assert.rejects(handler(event,'projectsDir'),/已经打开/);finish({canceled:true,filePaths:[]});assert.deepEqual(await first,{cancelled:true});assert.equal(task.manager.status().configured,false);
  }finally{task.dispose();}
});
