const fs=require('node:fs');
const path=require('node:path');

/** Exercise the real renderer -> native picker -> utility-service selection
 * chain using mocked dialog results inside an explicitly isolated smoke run. */
exports.run=async({window,origin,dataRoot,service,evaluate,wait})=>{
  const {dialog,Menu}=require('electron'),checklist=[],assert=(value,label)=>{if(!value)throw new Error(label);checklist.push(label);};
  const health=await (await fetch(origin+'/api/health')).json(),request=async(route,value)=>{
    const response=await fetch(origin+route,{method:value===undefined?'GET':'POST',headers:{'X-Zhezhi-Token':health.token,...(value===undefined?{}:{'Content-Type':'application/json'})},body:value===undefined?undefined:JSON.stringify(value)});const result=await response.json();if(!response.ok)throw new Error(result.error);return result;
  };
  const before=await request('/api/storage'),targetRoot=path.join(path.dirname(dataRoot),'storage-migration-targets'),targets=Object.fromEntries(Object.keys(before.paths).map(kind=>[kind,path.join(targetRoot,kind)]));for(const folder of Object.values(targets))fs.mkdirSync(folder,{recursive:true});
  const ordinaryKey='zhezhi.storage-smoke.v1',diagramKey='zhezhi.diagram-library-doc-'+ 'c'.repeat(32)+'.v1';
  await evaluate(`window.desktop.preferences.setItem('${ordinaryKey}','ordinary before migration');window.desktop.preferences.setItem('${diagramKey}','diagram before migration')`);
  const saved=await request('/api/projects',{doc:{name:'桌面目录迁移验证',paper:{width:100,height:100},segments:[{id:'crease',a:[0,0],b:[100,100],assignment:'V',angle:180}]}});
  const normalize=value=>path.resolve(value).toLowerCase(),originalDialog=dialog.showOpenDialog;
  dialog.showOpenDialog=async(owner,options)=>{assert(owner===window,'directory chooser remains owned by the isolated desktop window');const kind=Object.keys(before.paths).find(key=>normalize(before.paths[key])===normalize(options.defaultPath));if(!kind)throw new Error('Unknown isolated folder category');return {canceled:false,filePaths:[targets[kind]]};};
  try{
    const settings=Menu.getApplicationMenu().items.find(item=>item.label==='设置');assert(!!settings,'native settings menu exposes storage settings');settings.submenu.items[0].click();
    await wait(`!!document.querySelector('[data-storage-settings]')`);
    assert(await evaluate(`document.querySelectorAll('[data-storage-settings] input[readonly]').length===3`),'desktop settings displays three read-only actual storage paths');
    for(const kind of Object.keys(targets)){
      await wait(`!!document.querySelector('[data-storage-kind="${kind}"] .storage-settings-category button')&&!document.querySelector('[data-storage-kind="${kind}"] .storage-settings-category button').disabled`);
      await evaluate(`document.querySelector('[data-storage-kind="${kind}"] .storage-settings-category button').click()`);
      try{await wait(`!!document.querySelector('[data-storage-kind="${kind}"] .storage-settings-pending input')`);}catch(error){const detail=await evaluate(`document.querySelector('[data-storage-settings] [role=alert]')?.textContent||document.querySelector('[data-storage-settings] .storage-settings-result')?.textContent`);throw new Error(`Native ${kind} selection was not staged: ${detail||error.message}`);}
      const displayed=await evaluate(`document.querySelector('[data-storage-kind="${kind}"] .storage-settings-pending input').value`);assert(normalize(displayed)===normalize(targets[kind]),'native '+kind+' picker returns its independently registered selection');
    }
    await evaluate(`document.querySelector('[data-storage-settings] .storage-settings-primary').click()`);
    await wait(`!document.querySelector('[data-storage-settings]')`);
  }finally{dialog.showOpenDialog=originalDialog;}
  const after=await request('/api/storage');assert(Object.keys(targets).every(kind=>normalize(after.paths[kind])===normalize(targets[kind])),'desktop migration switches all three directory pointers only after copying');
  assert((await request('/api/projects/'+saved.id)).doc.name==='桌面目录迁移验证','migrated desktop project remains openable by its original UUID');
  assert(fs.existsSync(path.join(before.paths.projectsDir,saved.id+'.json')),'desktop migration retains the original project file');
  assert(await evaluate(`window.desktop.preferences.getItem('${diagramKey}')==='diagram before migration'`),'native bridge reads the migrated independent diagram payload');
  await evaluate(`window.desktop.preferences.setItem('${ordinaryKey}','ordinary after migration');window.desktop.preferences.setItem('${diagramKey}','diagram after migration')`);
  assert(JSON.parse(fs.readFileSync(path.join(after.paths.dataDir,'preferences.json'),'utf8'))[ordinaryKey]==='ordinary after migration','subsequent native ordinary preferences use the new program data folder');
  assert(JSON.parse(fs.readFileSync(path.join(after.paths.diagramsDir,'preferences.json'),'utf8'))[diagramKey]==='diagram after migration','subsequent native diagram writes use the new diagram folder');
  assert(JSON.parse(fs.readFileSync(path.join(before.paths.dataDir,'preferences.json'),'utf8'))[ordinaryKey]==='ordinary before migration','original ordinary preferences remain retained after switching');
  assert(JSON.parse(fs.readFileSync(path.join(before.paths.diagramsDir,'preferences.json'),'utf8'))[diagramKey]==='diagram before migration','original diagram payload remains retained after switching');
  await new Promise(resolve=>setTimeout(resolve,100));const logMarker='DESKTOP_STORAGE_LOG_ROUTING_VERIFIED\n';service.stdout.emit('data',Buffer.from(logMarker));await new Promise(resolve=>setTimeout(resolve,100));
  assert(fs.readFileSync(path.join(after.paths.dataDir,'desktop.log'),'utf8').includes(logMarker),'active desktop application log writes to the new program data folder');
  assert(!fs.readFileSync(path.join(before.paths.dataDir,'desktop.log'),'utf8').includes(logMarker),'historical application log remains retained at the original location');
  return {checks:checklist,paths:after.paths,sourceRetained:true,logMoved:true};
};
