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

  let token;
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
    if (!token) token = request('/api/health').token;
    if (action === 'get') return request('/api/storage/preferences?key=' + encodeURIComponent(key)).value ?? null;
    const result = request('/api/storage/preferences', 'POST', {key, value, ...(action === 'compareAndSet' ? {expectedValue} : {})});
    return result.conflict ? false : action === 'compareAndSet' ? true : result.value;
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
      getItem: key => preferences('get', key),
      setItem: (key, value) => preferences('set', key, value),
      compareAndSet: (key, expectedValue, value) => preferences('compareAndSet', key, value, expectedValue),
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
