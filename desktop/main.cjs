const { app, BrowserWindow, Menu, dialog, ipcMain, shell, utilityProcess } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const {randomUUID}=require('node:crypto');

app.setAppUserModelId('dev.zhezhi.workbench');
app.setName('折纸工坊');
const root = path.join(__dirname, '..');
const portableRoot = process.env.PORTABLE_EXECUTABLE_DIR;
const testRoot = process.env.ZHEZHI_DESKTOP_TEST_DATA;
if (testRoot) app.setPath('userData', path.resolve(testRoot, 'profile'));
else if (portableRoot) app.setPath('userData', path.join(portableRoot, '折纸工坊数据', 'profile'));
const dataRoot = testRoot ? path.resolve(testRoot, 'data') : portableRoot
  ? path.join(portableRoot, '折纸工坊数据', 'data') : path.join(app.getPath('userData'), 'workbench');
const smoke = process.argv.includes('--desktop-smoke');
if(smoke&&!testRoot){console.error('Smoke tests require an explicit isolated ZHEZHI_DESKTOP_TEST_DATA directory.');app.exit(2);}
let window, service, origin, shuttingDown = false;
let startup, starting=true, startupComplete=false, startupCancelled=false, startupFailed=false, serviceExited=false, startupTimeout;
let startupLogDirectory=app.getPath('userData');
let startupFailureMessage='无法完成启动，请退出后重新打开应用。';
let log;
let logsPaused=false;const bufferedLogs=[];
const writeLog=chunk=>{if(logsPaused)bufferedLogs.push(Buffer.from(chunk));else log?.write(chunk);};
function openDesktopLog(locations){
  const status=locations.status(),recovering=status.unavailable?.some(item=>item.kind==='dataDir');
  const directory=recovering?dataRoot:status.paths.dataDir;
  startupLogDirectory=directory;
  const stream=fs.createWriteStream(path.join(directory,recovering?'desktop-recovery.log':'desktop.log'),{flags:'a'});
  stream.on('error',error=>console.warn('Desktop log unavailable:',error.message));
  return stream;
}
function fail(error) {
  if(startupCancelled||(startupFailed&&!startupComplete))return;
  writeLog(String(error.stack || error)+'\n');
  if (smoke) { console.error(error); shuttingDown=true;service?.postMessage({type:'stop'});setTimeout(()=>app.exit(1),500); }
  else if(!startupComplete&&startup?.isActive()){
    startupFailed=true;clearTimeout(startupTimeout);
    startupFailureMessage=String(error.message||error);startup.fail(startupFailureMessage);
    if(window&&!window.isDestroyed())window.destroy();
    try{if(service&&!serviceExited)service.postMessage({type:'stop'});}catch{/* The error screen remains usable if the service already stopped. */}
  }
  else { dialog.showErrorBox('折纸工坊无法启动', `${error.message || error}\n\n工程数据不会被删除。日志位于：${app.getPath('userData')}`); app.quit(); }
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>{if(starting){startup?.focus();return;}if(window&&!window.isDestroyed()){if(window.isMinimized())window.restore();window.show();window.focus();}});
  app.whenReady().then(start).catch(fail);
}
async function start() {
  const icon=app.isPackaged?path.join(process.resourcesPath,'workbench.ico'):path.join(root,'build/icons/workbench.ico');
  if(!smoke){
    try{
      startup=require('./startupWindow.cjs').createStartupWindow({BrowserWindow,ipcMain,version:app.getVersion(),icon,logDirectory:startupLogDirectory,
        onCancel:()=>{startupCancelled=true;starting=false;clearTimeout(startupTimeout);app.quit();},
        onOpenLogs:()=>shell.openPath(startupLogDirectory),
        onError:error=>{
          console.warn('Startup window unavailable:',error.message||error);writeLog(String(error.stack||error)+'\n');
          if(startupFailed&&!startupCancelled){
            startupCancelled=true;starting=false;
            dialog.showErrorBox('折纸工坊无法启动',`${startupFailureMessage}\n\n工程数据不会被删除。日志位于：${startupLogDirectory}`);
            app.quit();
          }
        },
      });
      await startup.open();
    }catch(error){console.warn('Startup window unavailable:',error.message||error);}
  }
  if(startupCancelled)return;
  fs.mkdirSync(dataRoot,{recursive:true});
  fs.mkdirSync(app.getPath('userData'),{recursive:true});
  const locations=require('./storageLocations.cjs').createStorageLocations({bootstrapRoot:dataRoot,legacyPreferencesFile:path.join(app.getPath('userData'),'preferences.json')});
  log=openDesktopLog(locations);
  const backend=app.isPackaged ? path.join(process.resourcesPath,'tessellation','zhezhi-tess.exe') : path.join(root,'build','tessellation','zhezhi-tess','zhezhi-tess.exe');
  if(app.isPackaged&&!fs.existsSync(backend))throw new Error('打包缺少镶嵌计算引擎，请重新解压完整程序。');
  startup?.update('service');
  service=utilityProcess.fork(path.join(root,'server.mjs'),[],{
    serviceName:'折纸工坊本机服务',stdio:'pipe',
    env:{...process.env,ZHEZHI_PORT:'0',ZHEZHI_DATA_DIR:dataRoot,ZHEZHI_LEGACY_PREFERENCES:path.join(app.getPath('userData'),'preferences.json'),...(fs.existsSync(backend)?{ZHEZHI_TESS_EXECUTABLE:backend}:{})},
  });
  service.once('exit',()=>{serviceExited=true;});
  service.stdout.on('data',writeLog);service.stderr.on('data',writeLog);
  service.on('message',message=>{
    if(message?.type==='storage-log-pause'){
      logsPaused=true;const paused=()=>service.postMessage({type:'storage-log-paused',requestId:message.requestId});if(log)log.end(paused);else paused();
    }else if(message?.type==='storage-log-resume'){
      log=openDesktopLog(locations);logsPaused=false;for(const chunk of bufferedLogs.splice(0))log.write(chunk);
    }
  });
  const port=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('本机服务启动超时。')),20000);
    service.once('exit',code=>{clearTimeout(timeout);reject(new Error(`本机服务提前退出（${code}）。`));});
    service.on('message',message=>{if(message?.type==='ready'){clearTimeout(timeout);resolve(message.port);}});
  });
  if(startupCancelled||startupFailed||shuttingDown)return;
  origin=`http://127.0.0.1:${port}`;
  service.on('exit',code=>{if(!shuttingDown&&!startupCancelled)fail(new Error(`本机服务已退出（${code}）。请重开应用，未保存作品可从恢复副本找回。`));});
  startup?.update('workspace');
  window=new BrowserWindow({title:'折纸工坊',icon,width:1440,height:1000,minWidth:1000,minHeight:720,show:false,backgroundColor:'#f7f9f5',
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true},
  });
  let painted=false,frontendReady=false;
  const showWorkbench=()=>{
    if(startupComplete||startupCancelled||startupFailed||window.isDestroyed()||!painted||!frontendReady)return;
    startupComplete=true;starting=false;clearTimeout(startupTimeout);
    if(!smoke||(!process.env.ZHEZHI_DESKTOP_PREFERENCES_TEST&&process.env.ZHEZHI_DESKTOP_SMOKE_HIDDEN!=='1'))window.show();
    startup?.complete();
  };
  const frontendDidStart=event=>{
    if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||!event.senderFrame.url.startsWith(origin+'/'))return;
    frontendReady=true;showWorkbench();
  };
  ipcMain.on('desktop:ready',frontendDidStart);
  window.once('ready-to-show',()=>{painted=true;showWorkbench();});
  window.once('closed',()=>{clearTimeout(startupTimeout);ipcMain.removeListener('desktop:ready',frontendDidStart);});
  startupTimeout=setTimeout(()=>fail(new Error('工作台载入超时。请退出后重新打开，也可查看日志帮助排查。')),30000);
  require('./preferences.cjs').registerPreferences(ipcMain,()=>window,origin,locations.preferenceFile,{beforeWrite:locations.assertWritable});
  const messagePreferences=require('./preferences.cjs').createPreferences(locations.preferenceFile);
  const activity=event=>{try{service?.postMessage({type:'activity-log',event});}catch{/* Logging is independent of window recovery. */}};
  const messages=require('./messageWindow.cjs').createMessageWindows({BrowserWindow,ipcMain,dialog,onEvent:activity,getTheme:()=>{
    try{return JSON.parse(messagePreferences.getItem('zhezhi.theme.v1')||'null')?.theme==='dark'?'dark':'light';}catch{return 'light';}
  }});
  require('./confirmation.cjs').registerConfirmation({ipcMain,getWindow:()=>window,origin,messages});
  require('./confirmation.cjs').registerUnresponsiveRecovery({window,dialog,messages,onEvent:activity});
  window.webContents.on('render-process-gone',(_event,details)=>{
    activity({action:'desktop.renderer.gone',level:'error',details:{reason:details.reason,status:'gone'}});
    if(!startupComplete&&!startupCancelled)fail(new Error('工作台在启动时意外退出。请退出后重新打开，也可查看日志帮助排查。'));
  });
  require('./projectFilePicker.cjs').registerProjectFilePicker({ipcMain,dialog,getWindow:()=>window,origin});
  const session=window.webContents.session;
  session.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
  session.setPermissionCheckHandler(()=>false);
  session.webRequest.onHeadersReceived((details,callback)=>callback({responseHeaders:{...details.responseHeaders,'Content-Security-Policy':["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'self'"]}}));
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(origin+'/'))event.preventDefault();});
  session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith(origin+'/')&&!details.url.startsWith('blob:'+origin+'/')&&!/^(data:|devtools:)/.test(details.url)}));
  // Let Chromium cancel the first unload while our styled message is answered.
  // A second, explicitly approved reload overrides that one beforeunload check.
  let closeRequested=false,approvedReload=false;
  window.on('close',()=>{closeRequested=true;approvedReload=false;activity({action:'desktop.close.normal',level:'info',details:{status:'requested'}});});
  window.webContents.on('did-finish-load',()=>{approvedReload=false;});
  window.webContents.on('did-fail-load',()=>{approvedReload=false;});
  window.webContents.on('will-prevent-unload',event=>{
    if(approvedReload){approvedReload=false;closeRequested=false;event.preventDefault();return;}
    const closing=closeRequested;closeRequested=false;
    void messages.confirm(window,{title:'存在未保存内容',
      message:closing?'原始工程或折叠模型存在未保存内容，仍要关闭窗口吗？':'原始工程或折叠模型存在未保存内容，仍要重新载入吗？',
      detail:'独立保存折痕或折序只包含对应工作区。完整作品恢复副本保留最近成功暂存的内容，尚未暂存的修改可能丢失。需要另留备份时，请先下载完整作品并确认保存成功；恢复副本和完整作品均不包含撤销/重做历史。',
      cancelLabel:'返回继续编辑',confirmLabel:closing?'不保存并关闭':'放弃修改并重新载入',danger:true,
    }).then(accepted=>{
      if(!accepted||window.isDestroyed()){activity({action:'desktop.close.wait',level:'info',details:{reason:'unsaved',result:'cancelled'}});return;}
      activity({action:'desktop.close.normal',level:'info',details:{status:closing?'closing':'reloading',result:'confirmed'}});
      if(closing)window.destroy();else{approvedReload=true;window.webContents.reload();}
    });
  });
  ipcMain.handle('desktop:print',async event=>{
    if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw new Error('不允许此打印请求。');
    return new Promise(resolve=>window.webContents.print({silent:false,printBackground:true},(success,failureReason)=>resolve({success,failureReason})));
  });
  require('./storageLocations.cjs').registerStoragePicker({ipcMain,dialog,getWindow:()=>window,origin,locations,registerSelection:(kind,selectedPath)=>{
    const requestId=randomUUID();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{service.off('message',receive);reject(new Error('目录选择会话已过期，请重新选择。'));},15000);
      const receive=message=>{if(message?.type!=='storage-selection-result'||message.requestId!==requestId)return;clearTimeout(timer);service.off('message',receive);message.error?reject(new Error(message.error)):resolve(message.result);};
      service.on('message',receive);service.postMessage({type:'storage-selection',requestId,kind,path:selectedPath});
    });
  }});
  const command=name=>()=>window.webContents.send('desktop:command',name);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'文件',submenu:[{label:'打开工程…',accelerator:'CmdOrCtrl+O',click:command('open')},{label:'保存工程',accelerator:'CmdOrCtrl+S',click:command('save')},{label:'导出作品…',click:command('export')},{label:'打印折痕图…',accelerator:'CmdOrCtrl+P',click:command('print')},{type:'separator'},{label:'退出',role:'quit'}]},
    {label:'窗口',submenu:[{label:'最小化',role:'minimize'},{label:'全屏',role:'togglefullscreen'}]},
    {label:'设置',submenu:[{label:'保存目录设置…',click:command('settings')}]},
    {label:'帮助',submenu:[{label:'打开工程数据目录',click:()=>shell.openPath(locations.status().paths.projectsDir)},{label:'关于折纸工坊',click:()=>void messages.info(window,{title:'折纸工坊',message:`折纸工坊 ${app.getVersion()} · ${portableRoot?'免安装版':'桌面版'}`,detail:`全部计算在本机运行。\n工程目录：${locations.status().paths.projectsDir}\n\n桌面版与旧网页版使用独立工程库。旧作品请在网页版导出完整工程 JSON，再从这里打开。\n本测试版尚未签名；完整 Oriedita 工具仍在补齐。`})}]},
  ]));
  await window.loadURL(origin+'/');
  if(startupCancelled||startupFailed)return;
  if(smoke) {
    try {
      const runner=require('./smoke.cjs');
      const result=await (process.env.ZHEZHI_DESKTOP_PREFERENCES_TEST?runner.preferences:process.env.ZHEZHI_DESKTOP_STORAGE_TEST?runner.storage:runner.run)({window,origin,dataRoot,backend,service,messages});
      fs.writeFileSync(path.join(testRoot||app.getPath('userData'),'smoke-result.json'),JSON.stringify(result,null,2));
      if(!process.env.ZHEZHI_DESKTOP_PREFERENCES_TEST){const screenshot=await window.webContents.capturePage();fs.writeFileSync(path.join(testRoot||app.getPath('userData'),'desktop.png'),screenshot.toPNG());}
      console.log('DESKTOP_SMOKE_OK '+JSON.stringify(result));
      window.destroy();
    }catch(error){fail(error);}
  }
}
// A failed splash can disappear before the main window exists; keep starting.
app.on('window-all-closed',()=>{if(!starting||startupCancelled)app.quit();});
app.on('will-quit',event=>{
  clearTimeout(startupTimeout);
  if(!service||serviceExited||shuttingDown)return;
  // All windows have accepted beforeunload before their service is stopped.
  event.preventDefault();shuttingDown=true;
  const timeout=setTimeout(()=>{service.kill();app.exit(0);},5000);
  service.once('exit',()=>{clearTimeout(timeout);app.exit(0);});
  try{service.postMessage({type:'stop'});}catch{clearTimeout(timeout);service.kill();app.exit(0);}
});
