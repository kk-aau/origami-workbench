const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {randomUUID} = require('node:crypto');

const READY = 'desktop:message-ready';
const SHOW = 'desktop:message-show';
const RESPONSE = 'desktop:message-response';

function text(value, fallback, limit, required = false) {
  const result = value === undefined ? fallback : value;
  if (typeof result !== 'string' || result.length > limit || required && !result.trim()) throw new Error('窗口内容无效。');
  return result;
}

exports.createMessageWindows = ({BrowserWindow, ipcMain, dialog, onEvent = () => {}, getTheme = () => 'light',
  documentPath = path.join(__dirname, 'message.html')}) => {
  const documentURL = pathToFileURL(documentPath).href;
  const resources = new Set([documentURL, pathToFileURL(path.join(__dirname, 'message.js')).href,
    pathToFileURL(path.join(__dirname, '..', 'src', 'ui', 'dialog.css')).href]);
  const byOwner = new Map(), byContents = new Map();
  let disposed = false;
  const activity = (details, level = 'info') => {
    try { onEvent({action: 'desktop.confirm.fallback', level, details}); } catch { /* Logging cannot block confirmation. */ }
  };

  function trusted(event) {
    try {
      const record = byContents.get(event.sender);
      return record && !record.settled && !record.owner.isDestroyed() && !record.window.isDestroyed() &&
        event.sender === record.window.webContents && event.senderFrame === record.window.webContents.mainFrame &&
        event.senderFrame.url === documentURL ? record : null;
    } catch { return null; }
  }

  ipcMain.handle(READY, event => {
    const record = trusted(event);
    if (!record) return null;
    record.initialized = true;
    return {...record.payload};
  });
  const show = event => {
    const record = trusted(event);
    if (!record || !record.initialized || record.shown) return;
    clearTimeout(record.bootstrapTimer);
    record.shown = true;
    try { record.window.show(); record.window.focus(); record.window.webContents.focus(); }
    catch { record.fail('show'); }
  };
  const respond = (event, accepted) => {
    const record = trusted(event);
    if (!record || typeof accepted !== 'boolean' || accepted && (!record.initialized || !record.shown)) return;
    record.finish(accepted);
  };
  ipcMain.on(SHOW, show);
  ipcMain.on(RESPONSE, respond);

  async function nativeFallback(owner, payload) {
    if (!dialog?.showMessageBox || disposed || owner.isDestroyed()) return {accepted: false, result: 'unavailable'};
    try {
      const result = await dialog.showMessageBox(owner, {
        type: payload.danger ? 'warning' : payload.kind === 'confirm' ? 'question' : 'info',
        title: payload.title, message: payload.message, detail: payload.detail,
        buttons: payload.kind === 'confirm' ? [payload.cancelLabel, payload.confirmLabel] : [payload.confirmLabel],
        defaultId: 0, cancelId: 0, noLink: true,
      });
      const accepted = !disposed && !owner.isDestroyed() && result.response === (payload.kind === 'confirm' ? 1 : 0);
      return {accepted, result: accepted ? 'accepted' : 'cancelled'};
    } catch { return {accepted: false, result: 'failed'}; }
  }

  function open(owner, options, kind) {
    if (disposed || !owner || owner.isDestroyed()) return Promise.resolve(false);
    const existing = byOwner.get(owner);
    if (existing) {
      if (existing.shown && !existing.window.isDestroyed()) { existing.window.show(); existing.window.focus(); }
      // An existing answer must never approve a second, unrelated operation.
      return Promise.resolve(false);
    }
    let payload;
    try {
      const theme = options?.theme ?? getTheme(owner);
      payload = {kind, theme: theme === 'dark' ? 'dark' : 'light',
        title: text(options?.title, kind === 'confirm' ? '确认操作' : '折纸工坊', 120, true),
        message: text(options?.message, '', 4096, true), detail: text(options?.detail, '', 12000),
        cancelLabel: text(options?.cancelLabel, '取消', 80, true),
        confirmLabel: text(options?.confirmLabel, kind === 'confirm' ? '继续' : '知道了', 80, true),
        danger: kind === 'confirm' && options?.danger === true};
    } catch { return Promise.resolve(false); }

    return new Promise(resolve => {
      let child;
      const record = {owner, payload, initialized: false, shown: false, settled: false, window: null};
      const ownerClosed = () => record.finish(false);
      record.finish = accepted => {
        if (record.settled) return;
        record.settled = true;
        clearTimeout(record.bootstrapTimer);
        byOwner.delete(owner);
        if (record.contents) byContents.delete(record.contents);
        owner.removeListener('closed', ownerClosed);
        try { if (child && !child.isDestroyed()) child.destroy(); } catch { /* Already closing. */ }
        try {
          if (record.shown && !owner.isDestroyed() && owner.isVisible() && !owner.isMinimized()) {
            owner.blur(); owner.focus(); owner.webContents.focus();
          }
        } catch { /* A closing owner must not strand the blocked caller. */ }
        resolve(accepted === true);
      };
      record.fail = reason => {
        if (record.settled || record.fallbackPending) return;
        record.fallbackPending = true;
        clearTimeout(record.bootstrapTimer);
        if (record.contents) byContents.delete(record.contents);
        try { if (child && !child.isDestroyed()) child.destroy(); } catch { /* Native fallback remains available. */ }
        activity({reason, status: 'started'}, 'warning');
        void nativeFallback(owner, payload).then(answer => {
          activity({reason, status: 'completed', result: answer.result}, answer.result === 'failed' || answer.result === 'unavailable' ? 'error' : 'info');
          record.finish(answer.accepted);
        });
      };
      byOwner.set(owner, record);
      owner.once('closed', ownerClosed);
      try {
        const textLength = payload.message.length + payload.detail.length;
        child = new BrowserWindow({parent: owner, modal: true, show: false, frame: false,
          title: payload.title, width: 560, height: textLength > 600 ? 460 : textLength >= 180 ? 340 : 240,
          minWidth: 360, minHeight: 240, resizable: true, minimizable: false, maximizable: false,
          fullscreenable: false, skipTaskbar: true, autoHideMenuBar: true,
          backgroundColor: payload.theme === 'dark' ? '#202823' : '#f7f9f5',
          webPreferences: {preload: path.join(__dirname, 'messagePreload.cjs'),
            partition: 'zhezhi-message-' + randomUUID(), nodeIntegration: false,
            contextIsolation: true, sandbox: true, webSecurity: true}});
        record.window = child;
        record.contents = child.webContents;
        byOwner.set(owner, record); byContents.set(child.webContents, record);
        // A missing preload/script must not block sendSync forever.
        record.bootstrapTimer = setTimeout(() => record.fail('bootstrap'), 15000);
        record.bootstrapTimer.unref?.();
        child.setMenu(null);
        const contents = child.webContents, session = contents.session;
        session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
        session.setPermissionCheckHandler(() => false);
        session.webRequest.onBeforeRequest((details, callback) => callback({cancel: !resources.has(details.url)}));
        contents.setWindowOpenHandler(() => ({action: 'deny'}));
        contents.on('will-navigate', (event, url) => { if (url !== documentURL) event.preventDefault(); });
        contents.on('will-attach-webview', event => event.preventDefault());
        contents.once('render-process-gone', () => record.fail('renderer'));
        contents.once('did-fail-load', () => record.fail('load'));
        child.once('unresponsive', () => record.fail('unresponsive'));
        child.once('closed', () => { if (!record.fallbackPending) record.finish(false); });
        Promise.resolve(child.loadFile(documentPath)).catch(() => record.fail('load'));
      } catch { record.fail('construct'); }
    });
  }

  return {
    confirm: (owner, options) => open(owner, options, 'confirm'),
    info: (owner, options) => open(owner, options, 'info'),
    hasPending: owner => byOwner.has(owner),
    cancel(owner) { const record = byOwner.get(owner); if (!record) return false; record.finish(false); return true; },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const record of [...byOwner.values()]) record.finish(false);
      ipcMain.removeHandler(READY); ipcMain.removeListener(SHOW, show); ipcMain.removeListener(RESPONSE, respond);
    },
  };
};
