const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {spawn}=require('node:child_process');

const KINDS=['projectsDir','diagramsDir','dataDir'];
const DIAGRAM_KEY=key=>key==='zhezhi.diagram-project.v1'||key==='zhezhi.diagram-library.v1'||/^zhezhi\.diagram-library-doc-[a-p]{1,64}\.v1$/.test(key);
const validKind=kind=>KINDS.includes(kind);
const storageError=(message,status=400)=>Object.assign(new Error(message),{status});
const canonical=value=>process.platform==='win32'?value.toLowerCase():value;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function atomicJSON(file,value){
  const temporary=file+'.'+randomUUID()+'.tmp';fs.mkdirSync(path.dirname(file),{recursive:true});
  try{fs.writeFileSync(temporary,JSON.stringify(value),{encoding:'utf8',flag:'wx'});fs.renameSync(temporary,file);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
function directory(value){
  if(typeof value!=='string'||!path.isAbsolute(value)||value.includes('\0'))throw storageError('请选择绝对路径的文件夹。');
  const resolved=path.resolve(value);if(canonical(resolved)===canonical(path.parse(resolved).root))throw storageError('请在磁盘中选择具体文件夹，不能使用磁盘根目录。');
  let real;try{real=fs.realpathSync.native(resolved);if(!fs.statSync(real).isDirectory())throw new Error();}catch{throw storageError('选择的文件夹不存在或不可访问。');}
  if(canonical(real)===canonical(path.parse(real).root))throw storageError('不能使用磁盘根目录。');
  return real;
}
function readJSON(file,label){try{const value=JSON.parse(fs.readFileSync(file,'utf8'));if(value===null)throw new Error('null is not a storage object');return value;}catch(error){if(error.code==='ENOENT')return null;throw storageError(`${label}损坏或不可读取，原文件已保留。`);}}
function managedName(kind,name){
  if(kind==='projectsDir')return /^[a-f0-9-]{36}(?:\.draft)?\.json(?:\.bak)?$/.test(name);
  if(kind==='diagramsDir')return name==='preferences.json'||require('./preferences.cjs').isDiagramRecordFile(name);
  return ['preferences.json','recovery.json','recovery.json.bak','project-tombstones.json','project-tombstones.json.bak','desktop.log','app.log','activity.ndjson','activity.1.ndjson','activity.2.ndjson'].includes(name)||require('./artworkRecovery.cjs').isArtworkRecoveryRecordFile(name);
}

/** The bootstrap file never moves. Only application-owned flat files are
 * copied; nested default folders cannot recurse into their migration targets. */
exports.createStorageLocations=({bootstrapRoot,legacyPreferencesFile,picker,platform=process.platform})=>{
  const bootstrap=path.resolve(bootstrapRoot),configFile=path.join(bootstrap,'storage-locations.json'),lockFile=path.join(bootstrap,'storage-migration.lock'),legacyMarker=path.join(bootstrap,'legacy-preferences-import.json');
  const defaults={projectsDir:path.join(bootstrap,'projects'),diagramsDir:path.join(bootstrap,'diagrams'),dataDir:bootstrap};
  fs.mkdirSync(bootstrap,{recursive:true});
  const readConfig=()=>{
    const stored=readJSON(configFile,'保存目录配置');if(stored===null)return {version:1,configured:false,paths:{...defaults}};
    if(stored.version!==1||typeof stored.configured!=='boolean'||!stored.paths||KINDS.some(kind=>typeof stored.paths[kind]!=='string'||!path.isAbsolute(stored.paths[kind]))||Object.keys(stored.paths).some(kind=>!validKind(kind)))throw storageError('保存目录配置格式损坏，原文件已保留。');
    return stored;
  };
  const config=readConfig();if(!config.configured)for(const dir of Object.values(config.paths))fs.mkdirSync(dir,{recursive:true});
  // A disconnected custom drive must not turn into a new, empty library. Keep
  // its pointer and start only the directory-repair UI until it is reachable.
  const unavailable=(active=readConfig())=>KINDS.flatMap(kind=>{try{const dir=directory(active.paths[kind]);fs.accessSync(dir,fs.constants.R_OK|fs.constants.W_OK);fs.readdirSync(dir);return [];}catch(error){return [{kind,path:active.paths[kind],message:error.message}];}});
  function activeLock(){
    const lock=readJSON(lockFile,'存储迁移记录');if(!lock)return false;
    if(!Number.isSafeInteger(lock.pid)||lock.pid<1||typeof lock.id!=='string')throw storageError('存储迁移记录损坏。');
    try{process.kill(lock.pid,0);return true;}catch(error){if(error.code==='ESRCH'){fs.unlinkSync(lockFile);return false;}return true;}
  }
  const assertReadable=kind=>{if(!validKind(kind))throw storageError('保存目录类别无效。');if(unavailable().some(item=>item.kind===kind))throw storageError('原保存目录不可访问，请在保存位置设置中重新选择目录；原数据未改动。',503);};
  const assertWritable=()=>{if(activeLock())throw storageError('保存目录正在迁移，请完成后重试保存。',409);if(unavailable().length)throw storageError('原保存目录不可访问，请在保存位置设置中重新选择目录；原数据未改动。',503);};
  const preferenceFile=key=>{const kind=DIAGRAM_KEY(key)?'diagramsDir':'dataDir';assertReadable(kind);return path.join(readConfig().paths[kind],'preferences.json');};
  // Copy the old combined desktop preference file once, leaving the source
  // untouched. Existing target values always win; missing keys are imported.
  const imported=readJSON(legacyMarker,'旧版设置迁移记录');
  if(imported&&(imported.version!==1||typeof imported.source!=='string'))throw storageError('旧版设置迁移记录损坏，原设置已保留。');
  if(legacyPreferencesFile&&!unavailable().length&&canonical(imported?.source??'')!==canonical(path.resolve(legacyPreferencesFile))&&fs.existsSync(legacyPreferencesFile)&&!activeLock()){
    const entries=readJSON(legacyPreferencesFile,'旧版设置');require('./preferences.cjs').validateEntries(entries);
    const groups=new Map();for(const [key,value] of Object.entries(entries)){const file=preferenceFile(key);if(!groups.has(file))groups.set(file,{});groups.get(file)[key]=value;}
    const prepared=[];
    for(const [file,values] of groups){const previous=readJSON(file,'保存设置')??{},targetStore=require('./preferences.cjs').createPreferences(()=>file);
      // Existing document bodies may already live in individual record files.
      // Include them in the conflict check before importing a combined legacy file.
      for(const key of Object.keys(values)){const current=targetStore.getItem(key);if(current!==null)previous[key]=current;}
      const sourceIndex=values['zhezhi.diagram-library.v1'],targetIndex=previous['zhezhi.diagram-library.v1'];
      if(sourceIndex&&targetIndex&&sourceIndex!==targetIndex)throw storageError('旧版与当前折序文档库不同，请先导出旧版绘图后导入；两份文档库均未覆盖。');
      if(!sourceIndex&&values['zhezhi.diagram-project.v1']&&targetIndex&&values['zhezhi.diagram-project.v1']!==previous['zhezhi.diagram-project.v1'])throw storageError('旧版折序草稿与当前文档库并存，请先导出旧版草稿后导入；两份内容均已保留。');
      for(const [key,value] of Object.entries(values))if(DIAGRAM_KEY(key)&&value&&previous[key]&&value!==previous[key])throw storageError('旧版与当前折序文档存在不同版本，请先导出旧版绘图后导入；两份内容均未覆盖。');
      const merged={...values,...previous};require('./preferences.cjs').validateEntries(merged);prepared.push({file,merged});
    }
    for(const {file,merged} of prepared)atomicJSON(file,merged);
    const oldLog=path.join(path.dirname(legacyPreferencesFile),'desktop.log'),newLog=path.join(readConfig().paths.dataDir,'desktop.log');
    if(fs.existsSync(oldLog)&&!fs.existsSync(newLog)&&path.resolve(oldLog)!==path.resolve(newLog))fs.copyFileSync(oldLog,newLog,fs.constants.COPYFILE_EXCL);
    atomicJSON(legacyMarker,{version:1,source:path.resolve(legacyPreferencesFile),importedAt:new Date().toISOString()});
  }
  let tail=Promise.resolve(),busy=false,pickerBusy=false;const selections=new Map();
  const serialized=work=>{const current=tail.catch(()=>{}).then(work);tail=current;return current;};
  const status=()=>{const active=readConfig();return {configured:active.configured,paths:{...active.paths},defaults:{...defaults},busy:busy||activeLock(),platform,pickerAvailable:platform==='win32'||!!picker,unavailable:unavailable(active)};};
  const registerSelection=(kind,selectedPath)=>{
    if(!validKind(kind))throw storageError('保存目录类别无效。');
    const selected=directory(selectedPath),selectionId=randomUUID();
    for(const [id,item] of selections)if(Date.now()-item.created>600_000)selections.delete(id);
    if(selections.size>=64)throw storageError('目录选择次数过多，请先应用设置。');
    selections.set(selectionId,{kind,path:selected,created:Date.now()});return {cancelled:false,selectionId,path:selected};
  };
  const probe=async target=>{const file=path.join(target,'.zhezhi-write-test-'+randomUUID());try{await fsp.writeFile(file,'',{flag:'wx'});}catch{throw storageError('目标文件夹无法写入，请选择其他文件夹。');}finally{await fsp.unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});}};
  return {
    status,preferenceFile,assertReadable,assertWritable,registerSelection,
    runWrite(work){return serialized(()=>{assertWritable();return work(readConfig().paths);});},
    async pickDirectory(kind){if(!validKind(kind))throw storageError('保存目录类别无效。');if(pickerBusy)throw storageError('目录选择窗口已经打开。',409);pickerBusy=true;try{const selected=await (picker??exports.windowsDirectoryPicker)(readConfig().paths[kind]);return selected?registerSelection(kind,selected):{cancelled:true};}finally{pickerBusy=false;}},
    apply(input,hooks={}){return serialized(async()=>{
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['selections','migrate','recoverUnavailable'].includes(key))||input.migrate!==true||input.recoverUnavailable!==undefined&&input.recoverUnavailable!==true||!input.selections||typeof input.selections!=='object'||Array.isArray(input.selections)||Object.keys(input.selections).some(kind=>!validKind(kind)))throw storageError('目录修改必须由选择窗口确认，并迁移后应用。');
      const previous=readConfig(),missing=unavailable(previous),missingKinds=new Set(missing.map(item=>item.kind));
      if(missing.length&&(!input.recoverUnavailable||missing.some(item=>!Object.hasOwn(input.selections,item.kind))))throw storageError('原保存目录不可访问，请明确重新选择所有不可用目录后恢复。',503);
      const paths={...previous.paths};
      for(const [kind,id] of Object.entries(input.selections)){const selected=selections.get(id);if(!selected||selected.kind!==kind||Date.now()-selected.created>600_000)throw storageError('目录选择已失效，请重新选择文件夹。');paths[kind]=directory(selected.path);}
      for(const kind of KINDS)paths[kind]=directory(paths[kind]);
      if(new Set(Object.values(paths).map(value=>canonical(path.resolve(value)))).size!==3)throw storageError('三类数据须使用不同文件夹，避免设置文件互相覆盖。');
      if(activeLock())throw storageError('保存目录正在迁移，请完成后重试保存。',409);const lockId=randomUUID();fs.writeFileSync(lockFile,JSON.stringify({pid:process.pid,id:lockId}),{flag:'wx'});busy=true;
      let copiedFiles=0;const staged=[],verified=[];
      try{
        await hooks.beforeCopy?.();
        for(const kind of KINDS){const source=previous.paths[kind],target=paths[kind];await probe(target);if(missingKinds.has(kind)||canonical(path.resolve(source))===canonical(path.resolve(target)))continue;
          const files=(await fsp.readdir(source,{withFileTypes:true})).filter(entry=>managedName(kind,entry.name));
          for(const entry of files){if(!entry.isFile())throw storageError('原数据含有非普通文件，请先检查保存目录。');
            const sourceFile=path.join(source,entry.name),targetFile=path.join(target,entry.name),bytes=await fsp.readFile(sourceFile),digest=hash(bytes);
            verified.push({sourceFile,targetFile,digest});
            try{if((await fsp.lstat(targetFile)).isSymbolicLink())throw storageError('目标文件为链接，请选择其他文件夹；现有文件没有覆盖。');}catch(error){if(error.code!=='ENOENT')throw error;}
            try{const existing=await fsp.readFile(targetFile);if(hash(existing)!==digest)throw storageError(`目标已有不同的 ${entry.name}，请选择空文件夹；现有文件没有覆盖。`);continue;}catch(error){if(error.code!=='ENOENT')throw error;}
            const temporary=targetFile+'.zhezhi-migrate-'+lockId+'.tmp';await fsp.writeFile(temporary,bytes,{flag:'wx'});staged.push({temporary,targetFile,sourceFile,digest});
            if(hash(await fsp.readFile(temporary))!==digest||hash(await fsp.readFile(sourceFile))!==digest)throw storageError('迁移校验失败，原目录继续使用。');
          }
        }
        // Exclusive copies also work on removable drives. Configuration still
        // points at the old folders until every destination is verified.
        for(const item of staged){await fsp.copyFile(item.temporary,item.targetFile,fs.constants.COPYFILE_EXCL);if(hash(await fsp.readFile(item.targetFile))!==item.digest)throw storageError('目标文件校验失败，原目录继续使用。');await fsp.unlink(item.temporary);copiedFiles++;}
        for(const item of verified)if(hash(await fsp.readFile(item.sourceFile))!==item.digest)throw storageError('原文件在迁移中发生变化，原目录继续使用。');
        for(const item of verified)if(hash(await fsp.readFile(item.targetFile))!==item.digest)throw storageError('目标文件在迁移中发生变化，原目录继续使用。');
        if(fs.existsSync(configFile))atomicJSON(configFile+'.bak',previous);
        atomicJSON(configFile,{version:1,configured:true,paths});selections.clear();
        return {...status(),busy:false,copiedFiles,retainedSource:true};
      }catch(error){throw error.code==='EEXIST'?storageError('目标文件在迁移中发生变化，原目录继续使用。'):error;}
      finally{
        for(const item of staged)await fsp.unlink(item.temporary).catch(()=>{});
        const owned=readJSON(lockFile,'存储迁移记录');if(owned?.id===lockId)fs.unlinkSync(lockFile);busy=false;
        try{await hooks.afterCopy?.(readConfig().paths);}catch{/* A logging callback cannot roll back a committed directory selection. */}
      }
    });},
  };
};

exports.windowsDirectoryPicker=start=>new Promise((resolve,reject)=>{
  if(process.platform!=='win32')return reject(storageError('此浏览器的本机服务暂不提供原生文件夹选择。'));
  const script="Add-Type -AssemblyName System.Windows.Forms; $picker=New-Object System.Windows.Forms.FolderBrowserDialog; $picker.Description='选择折纸工坊保存目录'; $picker.ShowNewFolderButton=$true; $picker.SelectedPath=$env:ZHEZHI_PICKER_START; if($picker.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){ [Console]::Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($picker.SelectedPath))) }; $picker.Dispose()";
  const executable=path.join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const child=spawn(executable,['-NoProfile','-NonInteractive','-STA','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,env:{...process.env,ZHEZHI_PICKER_START:start},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',chunk=>{output+=chunk.toString();if(output.length>32768)child.kill();});child.on('error',()=>reject(storageError('无法打开本机文件夹选择窗口。')));child.on('exit',code=>code===0?resolve(output.trim()?Buffer.from(output.trim(),'base64').toString('utf8'):null):reject(storageError('文件夹选择窗口未能完成，请重试。')));
});

exports.registerStoragePicker=({ipcMain,dialog,getWindow,origin,locations,registerSelection})=>{
  let picking=false;
  ipcMain.handle('desktop:storage-pick',async(event,kind)=>{
    const owner=getWindow();
    if(!owner||event.sender!==owner.webContents||event.senderFrame!==owner.webContents.mainFrame||new URL(event.senderFrame.url).origin!==origin||!validKind(kind))throw storageError('不允许此目录选择请求。');
    if(picking)throw storageError('目录选择窗口已经打开。',409);picking=true;
    try{
      const chosen=await dialog.showOpenDialog(owner,{title:'选择保存目录',defaultPath:locations.status().paths[kind],properties:['openDirectory','createDirectory']});
      if(chosen.canceled||chosen.filePaths.length!==1)return {cancelled:true};
      return await registerSelection(kind,chosen.filePaths[0]);
    }finally{picking=false;}
  });
};
