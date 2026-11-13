(() => {
  'use strict';
  if (window.top !== window || window.desktop) return;
  const invoke = (command, args = {}, options) => {
    const core = window.__TAURI__?.core ?? window.__TAURI_INTERNALS__;
    if (!core?.invoke) return Promise.reject(new Error('桌面桥尚未准备好。'));
    return core.invoke(command, args, options);
  };
  if (location.pathname === '/_desktop/startup.html') {
    addEventListener('DOMContentLoaded', () => {
      document.querySelector('#startup-quit')?.addEventListener('click', () => invoke('desktop_cancel_startup'));
      document.querySelector('#startup-logs')?.addEventListener('click', () => invoke('desktop_open_logs'));
      setTimeout(() => {
        const detail = document.querySelector('#startup-detail');
        if (detail) detail.textContent = '首次启动或复杂环境可能需要更多时间，您可以继续等待或退出。';
      }, 10000);
    });
    return;
  }

  const hostContext=window.__zhezhiHostContext??{role:'document',documentId:null};
  const documentListeners=new Set(),documentCommands=new Set();
  const documentCommandNames=new Set(['open','new','save','save-artwork','save-crease','undo','redo','library','artwork-overview','export','settings','print','workspace:edit','workspace:design','workspace:tess','workspace:sim','workspace:diagram']);
  const documentRequest=(action,input={})=>invoke('desktop_documents',{action,input});
  const scopePreferenceKey=key=>{
    if(key!=='zhezhi.diagram-project.v1'||hostContext.role!=='document'||!hostContext.documentId)return key;
    const id=hostContext.documentId.replaceAll('-','').replace(/[0-9a-f]/g,d=>String.fromCharCode(97+parseInt(d,16)));
    return 'zhezhi.document-'+id+'-diagram-project.v1';
  };
  Object.defineProperty(window,'__zhezhiDocumentsChanged',{value:snapshot=>{
    if(!snapshot||!Array.isArray(snapshot.windows)||!Array.isArray(snapshot.documents)||typeof snapshot.windowId!=='string')return;
    for(const callback of documentListeners){try{callback(snapshot);}catch(error){console.error(error);}}
  }});
  Object.defineProperty(window,'__zhezhiDocumentCommand',{value:command=>{
    if(!documentCommandNames.has(command))return;
    for(const callback of documentCommands){try{callback(command);}catch(error){console.error(error);}}
  }});
  if(hostContext.role==='document'&&hostContext.documentId)addEventListener('focus',()=>{documentRequest('activate',{id:hostContext.documentId}).catch(console.error);});
  let token;
  const preferenceValues = new Map(), preferenceVersions = new Map(), smallPreferenceKeys = new Set();
  const preferenceRecords = new Map(), retainedPreferenceRecords = new Map(), evictedPreferenceRecords = new Set();
  const recordPreference = key => /^zhezhi\.document-[a-p]{32}-diagram-project\.v1$/.test(key)||key==='zhezhi.diagram-project.v1'||key==='zhezhi.base-design-library.v1'||/^zhezhi\.diagram-library-doc-[a-p]{32}\.v1$/.test(key);
  let preferenceEpoch = 0, preferenceSequence = 0;
  const preferenceVersion = key => preferenceVersions.get(key) ?? 0;
  function trimPreferenceRecords() {
    let bytes=[...preferenceRecords.values()].reduce((total,size)=>total+size,0);const newest=[...preferenceRecords.keys()].at(-1);
    for(const [key,size]of preferenceRecords){if(preferenceRecords.size<=6&&(bytes<=32*1024*1024||preferenceRecords.size===1))break;if(key===newest||retainedPreferenceRecords.has(key))continue;preferenceRecords.delete(key);preferenceValues.delete(key);evictedPreferenceRecords.add(key);bytes-=size;}
  }
  function cachedPreference(key) {
    if(evictedPreferenceRecords.has(key))throw new Error('内容缓存已释放，请重新异步读取；磁盘文件仍保留。');
    const size=preferenceRecords.get(key);if(size!==undefined){preferenceRecords.delete(key);preferenceRecords.set(key,size);}return preferenceValues.get(key)??null;
  }
  function rememberPreference(key, value) {
    evictedPreferenceRecords.delete(key);preferenceRecords.delete(key);
    if (value === null) preferenceValues.delete(key); else preferenceValues.set(key, value);
    if(value!==null&&recordPreference(key))preferenceRecords.set(key,value.length*2);
    preferenceVersions.set(key, ++preferenceSequence);
    trimPreferenceRecords();
  }
  async function requestAsync(path, method = 'GET', value) {
    if (!token) {const health=await fetch('/api/health');if(!health.ok)throw new Error('本地服务未连接。');token=(await health.json()).token;}
    const response=await fetch(path,{method,headers:{'X-Zhezhi-Token':token,...(value===undefined?{}:{'Content-Type':'application/json'})},...(value===undefined?{}:{body:JSON.stringify(value)})});
    const result=await response.json();
    if (!response.ok) {if(response.status===409&&method==='POST')return {conflict:true};throw new Error(result.error||'本地存储操作失败。');}
    return result;
  }
  async function readPreference(key) {
    const epoch=preferenceEpoch,revision=preferenceVersion(key),result=await requestAsync('/api/storage/preferences?key='+encodeURIComponent(key));
    if(epoch!==preferenceEpoch)throw new Error('保存目录已变化，请重新读取当前记录。');
    if(preferenceVersion(key)!==revision)return evictedPreferenceRecords.has(key)?readPreference(key):preferenceValues.get(key)??null;
    const value=result.value??null;rememberPreference(key,value);return value;
  }
  async function refreshPreferences(clearRecords=false) {
    if(clearRecords){preferenceEpoch++;preferenceValues.clear();preferenceVersions.clear();smallPreferenceKeys.clear();preferenceRecords.clear();evictedPreferenceRecords.clear();retainedPreferenceRecords.clear();}
    const epoch=preferenceEpoch,revision=preferenceSequence,{values}=await requestAsync('/api/storage/preferences/snapshot');
    if(epoch!==preferenceEpoch)throw new Error('保存目录已变化，请重新读取设置。');
    if(!values||typeof values!=='object'||Array.isArray(values)||Object.values(values).some(value=>typeof value!=='string'))throw new Error('存储服务返回的设置快照无效。');
    for(const key of smallPreferenceKeys)if(!Object.hasOwn(values,key)&&preferenceVersion(key)<=revision)rememberPreference(key,null);
    smallPreferenceKeys.clear();
    for(const [key,value] of Object.entries(values)){smallPreferenceKeys.add(key);if(preferenceVersion(key)<=revision)rememberPreference(key,value);}
  }
  function request(path, method = 'GET', value) {
    const xhr = new XMLHttpRequest();
    xhr.open(method, path, false);
    if (token) xhr.setRequestHeader('X-Zhezhi-Token', token);
    if (value !== undefined) xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(value === undefined ? null : JSON.stringify(value));
    let result;
    try { result = JSON.parse(xhr.responseText); }
    catch { throw new Error('本地服务未返回有效数据。'); }
    if (xhr.status < 200 || xhr.status >= 300) {
      if (xhr.status === 409 && method === 'POST') return {conflict: true};
      throw new Error(result.error || '本地存储操作失败。');
    }
    return result;
  }
  function preferences(action, key, value, expectedValue) {
    if (action === 'get') return cachedPreference(key);
    if (action === 'set' && !recordPreference(key) && preferenceValues.has(key) && preferenceValues.get(key) === value) return;
    if (!token) token = request('/api/health').token;
    const result = request('/api/storage/preferences', 'POST', {key, value, expectedValue:action === 'compareAndSet'?expectedValue:cachedPreference(key)});
    if (!result.conflict) rememberPreference(key,value);
    if (result.conflict && action === 'set') throw new Error('设置已在其他窗口修改，请刷新后重试；本次修改未写入。');
    return result.conflict ? false : action === 'compareAndSet' ? true : result.value;
  }
  async function writePreference(key,value,expectedValue) {
    const epoch=preferenceEpoch,result=await requestAsync('/api/storage/preferences','POST',{key,value,expectedValue});
    if(!result.conflict&&epoch===preferenceEpoch)rememberPreference(key,value);
    return !result.conflict;
  }
  const commands = new Set();
  const windowListeners = new Set();
  const windowAction = action => invoke('desktop_window_action', {action});
  async function saveExport(blob, name, options = {}) {
    if (!(blob instanceof Blob) || typeof name !== 'string' || !name.trim()) throw new Error('导出文件无效。');
    const cancelled = () => options.signal?.aborted === true;
    if (cancelled()) return {status:'cancelled'};
    const selected = await invoke('desktop_prepare_export', {name, bytes:blob.size});
    if (selected.cancelled) return {status:'cancelled'};
    const ticket = selected.ticket;
    if (typeof ticket !== 'string' || !ticket) throw new Error('桌面导出请求标识无效。');
    let committed = false;
    try {
      const chunkBytes = selected.chunkBytes;
      if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > 1024*1024) throw new Error('桌面导出数据块配置无效。');
      if (cancelled()) return {status:'cancelled'};
      options.onProgress?.(0,blob.size);
      for (let offset=0; offset<blob.size;) {
        if (cancelled()) return {status:'cancelled'};
        const end=Math.min(offset+chunkBytes,blob.size);
        // Slice before arrayBuffer: only one bounded binary IPC chunk is live.
        const chunk=await blob.slice(offset,end).arrayBuffer();
        if (cancelled()) return {status:'cancelled'};
        const written=await invoke('desktop_write_export',chunk,{headers:{'x-zhezhi-export-ticket':ticket,'x-zhezhi-export-offset':String(offset)}});
        if (written!==end) throw new Error('桌面导出进度不匹配，文件未提交。');
        offset=end;options.onProgress?.(written,blob.size);
      }
      if (cancelled()) return {status:'cancelled'};
      // Once commit starts, report its real outcome even if cancellation arrives.
      const result=await invoke('desktop_finish_export',{ticket});
      if (result?.status!=='saved' || typeof result.path!=='string' || !result.path) throw new Error('桌面未确认文件保存完成。');
      committed=true;return result;
    } finally {
      if (!committed) await invoke('desktop_cancel_export',{ticket});
    }
  }
  Object.defineProperty(window, 'desktop', {configurable: false, writable: false, value: Object.freeze({
    isDesktop: true,
    role:hostContext.role,
    documentId:hostContext.documentId,
    documents:Object.freeze({
      getContext:()=>documentRequest('context'),list:()=>documentRequest('list'),
      activate:id=>documentRequest('activate',{id}),setBounds:rects=>documentRequest('bounds',{rects}),
      openWorkspace:(workspace,initialCommand,transfer,libraryKey,returnToOrigin)=>documentRequest('open-workspace',{workspace,initialCommand,transfer,libraryKey,returnToOrigin}),
      setLibraryIdentity:key=>documentRequest('library-identity',{key}),focusOrigin:()=>documentRequest('focus-origin'),close:id=>documentRequest('close',{id}),
      sendCommand:(id,command)=>{if(!documentCommandNames.has(command))return Promise.reject(new Error('不支持此作品操作。'));return documentRequest('command',{id,command});},
      report:metadata=>documentRequest('report',metadata),
      subscribe:callback=>{documentListeners.add(callback);return()=>documentListeners.delete(callback);},
      onCommand:callback=>{documentCommands.add(callback);return()=>documentCommands.delete(callback);},
      popupMenu:(items,position)=>documentRequest('popup',{items,x:position.x,y:position.y}),
    }),
    ready: () => { invoke('desktop_ready').catch(console.error); },
    openProject: kind => invoke('desktop_open_project', {kind}).then(value => {
      const bytes = new Uint8Array(value);
      if (bytes.byteLength === 0) return null;
      if (bytes.byteLength < 4) throw new Error('工程文件读取结果不完整。');
      const nameLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
      if (nameLength > bytes.byteLength - 4) throw new Error('工程文件读取结果不完整。');
      return {name: new TextDecoder().decode(bytes.subarray(4, 4 + nameLength)), bytes: bytes.subarray(4 + nameLength)};
    }),
    preferences: Object.freeze({
      cacheOnly: true,
      getItem: key => preferences('get', scopePreferenceKey(key)),
      setItem: (key, value) => preferences('set', scopePreferenceKey(key), value),
      compareAndSet: (key, expectedValue, value) => preferences('compareAndSet', scopePreferenceKey(key), value, expectedValue),
      getItemAsync: key=>readPreference(scopePreferenceKey(key)),
      setItemAsync: async(key,value) => {key=scopePreferenceKey(key);const epoch=preferenceEpoch,expected=preferenceVersion(key)&&!evictedPreferenceRecords.has(key)?preferenceValues.get(key)??null:await readPreference(key);if(epoch!==preferenceEpoch)throw new Error('保存目录已变化，本次修改未写入。');if(!await writePreference(key,value,expected))throw new Error('设置已在其他窗口修改，请刷新后重试；本次修改未写入。');},
      compareAndSetAsync: (key,expectedValue,value) => writePreference(scopePreferenceKey(key),value,expectedValue),
      refresh: refreshPreferences,
      retainRecords: keys => {const epoch=preferenceEpoch,selected=keys.map(scopePreferenceKey).filter(recordPreference);for(const key of selected)retainedPreferenceRecords.set(key,(retainedPreferenceRecords.get(key)??0)+1);let released=false;return()=>{if(released)return;released=true;if(epoch!==preferenceEpoch)return;for(const key of selected){const count=retainedPreferenceRecords.get(key)??0;if(count<=1)retainedPreferenceRecords.delete(key);else retainedPreferenceRecords.set(key,count-1);}trimPreferenceRecords();};},
    }),
    storage: Object.freeze({pickDirectory: kind => invoke('desktop_pick_directory', {kind})}),
    print: () => invoke('desktop_print'),
    openDataDirectory: () => invoke('desktop_open_data_directory'),
    saveExport,
    window: Object.freeze({
      getState: () => invoke('desktop_window_state'),
      minimize: () => windowAction('minimize'),
      toggleMaximize: () => windowAction('toggleMaximize'),
      toggleFullscreen: () => windowAction('toggleFullscreen'),
      startDragging: () => windowAction('startDragging'),
      close: () => windowAction('close'),
      onStateChanged: callback => { windowListeners.add(callback); return () => windowListeners.delete(callback); },
    }),
    confirm: message => typeof message === 'string' && message.trim().length > 0 && message.length <= 4096 ? window.confirm(message) === true : false,
    onCommand: callback => { commands.add(callback); return () => commands.delete(callback); },
  })});
  Object.defineProperty(window, '__zhezhiDesktopCommand', {value: command => {
    if (['open', 'save', 'export', 'print', 'settings'].includes(command)) for (const callback of commands) callback(command);
  }});
  Object.defineProperty(window, '__zhezhiWindowState', {value: state => {
    if (typeof state?.maximized !== 'boolean' || typeof state?.fullscreen !== 'boolean') return;
    const value = Object.freeze({maximized: state.maximized, fullscreen: state.fullscreen});
    for (const callback of windowListeners) callback(value);
  }});
  // Native menu accelerators disappear with the menu bar. Retain print and
  // fullscreen here; open/save continue through the workspace's own shortcuts.
  window.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey) return;
    if (event.key === 'F11' && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault();
      windowAction('toggleFullscreen').catch(console.error);
    } else if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      window.__zhezhiDesktopCommand('print');
    }
  });

  // Keep the existing workspace beforeunload guards. Ask the same callbacks
  // before the native window closes, then let Rust own the final close decision.
  const listeners = new Set();
  const add = window.addEventListener, remove = window.removeEventListener;
  window.addEventListener = function(type, listener, options) {
    if (type === 'beforeunload' && listener) listeners.add(listener);
    return add.call(this, type, listener, options);
  };
  window.removeEventListener = function(type, listener, options) {
    if (type === 'beforeunload') listeners.delete(listener);
    return remove.call(this, type, listener, options);
  };
  Object.defineProperty(window, '__zhezhiBeforeClose', {value: requestId => {
    const event = new Event('beforeunload', {cancelable: true});
    let dirty = false;
    for (const listener of [...listeners]) {
      try {
        const result = typeof listener === 'function' ? listener.call(window, event) : listener.handleEvent(event);
        if (typeof result === 'string') dirty = true;
      } catch { dirty = true; }
    }
    if (typeof window.onbeforeunload === 'function') {
      try { if (window.onbeforeunload.call(window, event) != null) dirty = true; } catch { dirty = true; }
    }
    dirty ||= event.defaultPrevented || event.returnValue === false;
    invoke('desktop_close_ack', {requestId, dirty}).catch(console.error);
  }});
})();
