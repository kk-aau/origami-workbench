const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {randomUUID} = require('node:crypto');

const GET_STATE = 'desktop:startup-get-state';
const STATE = 'desktop:startup-state';
const UI_READY = 'desktop:startup-ui-ready';
const CLOSE = 'desktop:startup-close';
const OPEN_LOGS = 'desktop:startup-open-logs';
const STAGES = {
  starting: {title: '正在启动折纸工坊', detail: '正在准备本机工作环境。'},
  service: {title: '正在启动本机服务', detail: '正在连接本机工程库与计算服务。'},
  workspace: {title: '正在打开工作台', detail: '正在载入界面与本地资源。'},
};
const ORDER = ['starting', 'service', 'workspace'];

exports.createStartupWindow = ({BrowserWindow, ipcMain, version, icon, logDirectory,
  onCancel = () => {}, onOpenLogs = () => {}, onError = () => {}, hidden = false}) => {
  const documentPath = path.join(__dirname, 'startup.html');
  const documentURL = pathToFileURL(documentPath).href;
  const resources = new Set(['startup.html', 'startup.css', 'startup.js'].map(name =>
    pathToFileURL(path.join(__dirname, name)).href));
  resources.add(pathToFileURL(path.join(__dirname, '..', 'src', 'ui', 'dialog.css')).href);
  if (typeof icon === 'string' && icon) resources.add(pathToFileURL(icon).href);
  let state = {version: typeof version === 'string' ? version.slice(0, 80) : '',
    stage: 'starting', ...STAGES.starting, slow: false};
  let revision = 0, child, contents, active = false, ready = false, shown = false;
  let terminal = false, failed = false, uiReady = false, slowTimer, bootstrapTimer, openPromise, handlerInstalled = false;

  const snapshot = () => ({revision, state: {...state}});
  const clearSlow = () => { clearTimeout(slowTimer); slowTimer = undefined; };
  const clearBootstrap = () => { clearTimeout(bootstrapTimer); bootstrapTimer = undefined; };
  const notifyError = error => {
    try { Promise.resolve(onError(error instanceof Error ? error : new Error(String(error)))).catch(() => {}); }
    catch { /* Reporting cannot block the main application. */ }
  };
  const invoke = (callback, ...args) => {
    try { Promise.resolve(callback(...args)).catch(notifyError); }
    catch (error) { notifyError(error); }
  };
  const trusted = event => {
    try {
      return active && !terminal && child && !child.isDestroyed() &&
        event.sender === contents && contents === child.webContents &&
        event.senderFrame === contents.mainFrame && event.senderFrame.url === documentURL;
    } catch { return false; }
  };
  const closeRequest = event => { if (trusted(event)) cancel(); };
  const logsRequest = event => { if (trusted(event)) invoke(onOpenLogs, logDirectory); };
  const uiReadyRequest = event => {
    if (!trusted(event)) return;
    uiReady = true; clearBootstrap();
  };

  function watchBootstrap(delay, message) {
    if (uiReady || terminal) return;
    clearBootstrap();
    bootstrapTimer = setTimeout(() => {
      if (active && !terminal && !uiReady) technicalFailure(new Error(message));
    }, delay);
    bootstrapTimer.unref?.();
  }

  function removeIPC() {
    if (!handlerInstalled) return;
    handlerInstalled = false;
    ipcMain.removeHandler(GET_STATE);
    ipcMain.removeListener(CLOSE, closeRequest);
    ipcMain.removeListener(OPEN_LOGS, logsRequest);
    ipcMain.removeListener(UI_READY, uiReadyRequest);
  }
  function destroy() {
    clearSlow(); clearBootstrap(); removeIPC();
    try { if (child && !child.isDestroyed()) child.destroy(); } catch { /* Already gone. */ }
  }
  function technicalFailure(error) {
    if (terminal) return;
    terminal = true; active = false;
    clearSlow(); removeIPC();
    // The owner can guard window-all-closed before this window is destroyed.
    notifyError(error);
    destroy();
  }
  function cancel() {
    if (terminal) return;
    terminal = true; active = false;
    clearSlow(); removeIPC();
    // Let the owner record cancellation/quit intent before all windows close.
    invoke(onCancel);
    destroy();
  }
  function publish() {
    if (!active || terminal || !ready) return;
    try { contents.send(STATE, snapshot()); }
    catch (error) { technicalFailure(error); }
  }
  function reveal() {
    if (!active || terminal) return;
    if (!ready) watchBootstrap(3000, '启动窗口界面未能完成初始化。');
    ready = true;
    publish();
    if (hidden || shown || terminal) return;
    try { child.show(); shown = true; }
    catch (error) { technicalFailure(error); }
  }
  function open() {
    if (openPromise) return openPromise;
    // Loading the decorative window is independent of service/main startup.
    // A missing or stalled renderer must never hold up the main application.
    openPromise = Promise.resolve();
    if (terminal) return openPromise;
    try {
      child = new BrowserWindow({title: '折纸工坊', icon, width: 560, height: 360,
        frame: false, show: false, resizable: false, minimizable: true, maximizable: false,
        fullscreenable: false, closable: true, autoHideMenuBar: true,
        backgroundColor: '#f7f9f5', webPreferences: {
          preload: path.join(__dirname, 'startupPreload.cjs'), partition: 'zhezhi-startup-' + randomUUID(),
          sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true,
        }});
      contents = child.webContents; active = true;
      ipcMain.handle(GET_STATE, event => trusted(event) ? snapshot() : null);
      handlerInstalled = true;
      ipcMain.on(CLOSE, closeRequest); ipcMain.on(OPEN_LOGS, logsRequest);
      ipcMain.on(UI_READY, uiReadyRequest);
      child.setMenu(null); child.center();
      const session = contents.session;
      session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      session.setPermissionCheckHandler(() => false);
      session.webRequest.onBeforeRequest((details, callback) => callback({cancel: !resources.has(details.url)}));
      contents.setWindowOpenHandler(() => ({action: 'deny'}));
      contents.on('will-navigate', event => event.preventDefault());
      contents.on('will-redirect', event => event.preventDefault());
      contents.on('will-attach-webview', event => event.preventDefault());
      contents.once('render-process-gone', () => technicalFailure(new Error('启动窗口渲染进程已退出。')));
      contents.once('preload-error', (_event, _preloadPath, error) =>
        technicalFailure(new Error('启动窗口预载脚本载入失败。', {cause: error})));
      contents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
        if (isMainFrame !== false) technicalFailure(new Error(`启动窗口载入失败（${description || code || '未知原因'}）。`));
      });
      contents.on('did-finish-load', reveal);
      child.on('ready-to-show', reveal);
      child.once('unresponsive', () => technicalFailure(new Error('启动窗口暂时无法响应。')));
      child.on('close', event => {
        if (terminal) return;
        event.preventDefault(); cancel();
      });
      child.once('closed', () => { if (!terminal) cancel(); });
      watchBootstrap(15000, '启动窗口本地页面载入超时。');
      if (!failed) {
        slowTimer = setTimeout(() => {
          if (!active || terminal || failed) return;
          state = {...state, slow: true}; revision++; publish();
        }, 8000);
        slowTimer.unref?.();
      }
      Promise.resolve(child.loadFile(documentPath)).catch(technicalFailure);
    } catch (error) { technicalFailure(error); }
    return openPromise;
  }

  return {
    open,
    update(stage) {
      if (terminal || failed || !ORDER.includes(stage) || ORDER.indexOf(stage) <= ORDER.indexOf(state.stage)) return;
      state = {...state, stage, ...STAGES[stage]}; revision++; publish();
    },
    fail(message) {
      if (terminal || failed) return;
      failed = true; clearSlow();
      // An error page still needs a working renderer and exit/log buttons.
      // Keep any pending UI bootstrap watchdog so the owner can fall back.
      state = {...state, stage: 'error', title: '折纸工坊启动失败',
        detail: typeof message === 'string' && message.trim() ? message.slice(0, 2000) : '无法完成启动，请打开日志查看详情。', slow: false};
      revision++; publish();
    },
    complete() {
      if (terminal || failed) return;
      terminal = true; active = false; destroy();
    },
    focus() {
      if (!active || terminal || hidden || !ready) return;
      try { if (child.isMinimized()) child.restore(); child.show(); child.focus(); }
      catch (error) { technicalFailure(error); }
    },
    isActive: () => active && !terminal,
  };
};
