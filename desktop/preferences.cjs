const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');

// Application preferences, diagram drafts and library records only;
// no paths or arbitrary IPC are exposed.
const validKey = key => typeof key === 'string' &&
  (key === 'zhezhi-panel-layout-v1' || /^zhezhi\.[a-z-]+\.v1$/.test(key));
const MAX_BYTES = 256 * 1024;
const DIAGRAM_KEY = 'zhezhi.diagram-project.v1';
const LIBRARY_KEY = 'zhezhi.diagram-library.v1';
const CREASE_LIBRARY_KEY = 'zhezhi.crease-library.v1';
const libraryDocumentKey = key => /^zhezhi\.diagram-library-doc-[a-p]{1,64}\.v1$/.test(key);
function check(entries) {
  if (!entries || typeof entries !== 'object' || Array.isArray(entries) ||
      Object.entries(entries).some(([key, value]) => !validKey(key) || typeof value !== 'string')) throw new Error('桌面偏好设置格式无效或超过容量。');
  const ordinary = Object.fromEntries(Object.entries(entries).filter(([key]) => key !== DIAGRAM_KEY && key !== LIBRARY_KEY && key !== CREASE_LIBRARY_KEY && !libraryDocumentKey(key)));
  // Document strings and library indexes have no artificial size quota. Small
  // ordinary settings retain their independent validation budget.
  if (Buffer.byteLength(JSON.stringify(ordinary)) > MAX_BYTES) throw new Error('桌面偏好设置格式无效或超过容量。');
}
exports.validateEntries=check;
exports.isDiagramKey=key=>key===DIAGRAM_KEY||key===LIBRARY_KEY||libraryDocumentKey(key);
const recordKey=key=>key===DIAGRAM_KEY||libraryDocumentKey(key);
const recordName=name=>name.endsWith('.json')&&recordKey(name.slice(0,-5));
exports.isDiagramRecordFile=recordName;
exports.createPreferences = (source,options={}) => {
  const locate=key=>path.resolve(typeof source==='function'?source(key):source);
  // Only small directory/settings records and two document strings are cached.
  // Atomic replacement changes the file identity, including across processes.
  const cache=new Map();
  const readJSON=file=>{
    try{
      const stat=fs.statSync(file);if(!stat.isFile())throw new Error('桌面偏好设置不是普通文件。');
      const identity=[stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs].join(':'),old=cache.get(file);
      if(old?.identity===identity)return old.value;
      const value=JSON.parse(fs.readFileSync(file,'utf8'));cache.delete(file);cache.set(file,{identity,value});
      while(cache.size>4)cache.delete(cache.keys().next().value);return value;
    }catch(error){if(error.code==='ENOENT'){cache.delete(file);return undefined;}throw error;}
  };
  const read=file=>{const saved=readJSON(file),value=saved===undefined?{}:saved;check(value);return value;};
  const atomic=(file,value)=>{
    const temporary=file+'.'+randomUUID()+'.tmp';
    try{fs.writeFileSync(temporary,JSON.stringify(value),{encoding:'utf8',flag:'wx'});fs.renameSync(temporary,file);cache.delete(file);}
    finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
  };
  const busy=()=>Object.assign(new Error('保存设置正在由其他窗口更新，请稍后重试。'),{status:409});
  const locked=(file,work)=>{
    options.beforeWrite?.();fs.mkdirSync(path.dirname(file),{recursive:true});
    // Publish a unique intent before looking for competitors. A stale marker
    // never reuses a new owner's pathname, so reclaimers cannot delete a live
    // lock created between reading its PID and unlinking it.
    const canonicalName=name=>process.platform==='win32'?name.toLowerCase():name;
    const prefix=canonicalName(path.basename(file))+'.lock.',lock=file+'.lock.'+process.pid+'.'+randomUUID();let owned=false;
    const alive=pid=>{try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}};
    try{
      fs.writeFileSync(lock,'',{flag:'wx'});owned=true;
      const legacy=file+'.lock';
      if(fs.existsSync(legacy)){
        let owner;try{owner=JSON.parse(fs.readFileSync(legacy,'utf8'));}catch{throw busy();}
        if(!Number.isSafeInteger(owner.pid)||owner.pid<1||alive(owner.pid))throw busy();
      }
      for(const name of fs.readdirSync(path.dirname(file))){
        if(!canonicalName(name).startsWith(prefix))continue;
        const other=path.join(path.dirname(file),name);if(other===lock)continue;
        const match=/^(\d+)\.[a-f0-9-]{36}$/.exec(name.slice(prefix.length));
        if(!match||!Number.isSafeInteger(Number(match[1]))||Number(match[1])<1)throw busy();
        if(alive(Number(match[1])))throw busy();
        try{fs.unlinkSync(other);}catch(error){if(error.code!=='ENOENT')throw error;}
      }
      return work();
    }finally{if(owned)fs.unlinkSync(lock);}
  };
  const recordFile=(file,key)=>path.join(path.dirname(file),key+'.json');
  const recordValue=(file,key)=>{
    const value=readJSON(recordFile(file,key));
    if(value===undefined)return null;
    if(typeof value!=='string')throw new Error('绘图记录格式损坏，原文件已保留。');
    return value;
  };
  const migrate=file=>{
    const entries=read(file),legacy=Object.keys(entries).filter(key=>recordKey(key)&&entries[key]!=='');
    if(!legacy.length)return entries;
    return locked(file,()=>{
      const current=read(file),next={...current};
      for(const [key,value] of Object.entries(current))if(recordKey(key)&&value!==''){
        const saved=recordValue(file,key);
        if(saved!==null&&saved!==value)throw new Error('旧版与独立绘图记录不同，已保留两份内容，请先备份后恢复。');
        if(saved===null)atomic(recordFile(file,key),value);delete next[key];
      }
      // The old combined file remains authoritative until every copy succeeds.
      atomic(file,next);return next;
    });
  };
  const currentValue=(file,key,entries)=>Object.hasOwn(entries,key)?entries[key]:recordKey(key)?recordValue(file,key):null;
  const updatedEntries=(entries,key,value)=>{
    const next={...entries};
    if(recordKey(key)&&value!=='')delete next[key];else next[key]=value;
    check(next);
    return next;
  };
  const write=(file,key,value,entries)=>{
    const next=updatedEntries(entries,key,value);
    if(recordKey(key)){
      if(value===''){
        // Empty aggregate entries prevent legacy browser values reappearing.
        atomic(file,next);try{fs.unlinkSync(recordFile(file,key));cache.delete(recordFile(file,key));}catch(error){if(error.code!=='ENOENT')throw error;}
      }else{atomic(recordFile(file,key),value);if(Object.hasOwn(entries,key))atomic(file,next);}
    }else atomic(file,next);
  };
  return {
    getItem(key){if(!validKey(key))throw new Error('不支持此偏好设置。');const file=locate(key),entries=migrate(file);return currentValue(file,key,entries);},
    setItem(key,value){
      if(!validKey(key)||typeof value!=='string')throw new Error('不支持此偏好设置。');
      const file=locate(key);migrate(file);return locked(file,()=>{const entries=read(file);if(currentValue(file,key,entries)!==value)write(file,key,value,entries);});
    },
    compareAndSet(key,expectedValue,value){
      if(!validKey(key)||typeof value!=='string'||expectedValue!==null&&typeof expectedValue!=='string')throw new Error('条件保存设置格式无效。');
      const file=locate(key);
      try{migrate(file);return locked(file,()=>{const entries=read(file);if(currentValue(file,key,entries)!==expectedValue)return false;write(file,key,value,entries);return true;});}
      catch(error){if(error.status===409)return false;throw error;}
    },
  };
};

exports.registerPreferences = (ipcMain, getWindow, origin, file,options={}) => {
  const preferences = exports.createPreferences(file,options);
  ipcMain.on('desktop:preferences', (event, action, key, value, expectedValue) => {
    try {
      const window = getWindow();
      if (!window || event.sender !== window.webContents ||
          event.senderFrame !== window.webContents.mainFrame ||
          new URL(event.senderFrame.url).origin !== origin) throw new Error('不允许此偏好设置请求。');
      if (action === 'get') event.returnValue = {value: preferences.getItem(key)};
      else if (action === 'set') { if(key===LIBRARY_KEY&&preferences.getItem(key)!==null)throw new Error('文档库更新需要条件保存。');preferences.setItem(key, value); event.returnValue = {value: null}; }
      else if(action==='compareAndSet')event.returnValue={value:preferences.compareAndSet(key,expectedValue,value)};
      else throw new Error('不支持此偏好设置操作。');
    } catch { event.returnValue = {error: '无法读取或保存桌面偏好设置，请检查应用数据目录。'}; }
  });
};
