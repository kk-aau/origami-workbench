const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const {createStartupWindow} = require('../../desktop/startupWindow.cjs');
const GET_STATE = 'desktop:startup-get-state', STATE = 'desktop:startup-state';
const UI_READY = 'desktop:startup-ui-ready';
const CLOSE = 'desktop:startup-close', OPEN_LOGS = 'desktop:startup-open-logs';
const documentPath = path.resolve(__dirname, '../../desktop/startup.html');
const documentURL = pathToFileURL(documentPath).href;
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture(t, options = {}) {
  const calls = [], windows = [], errors = [], logs = [], handlers = new Map();
  const ipcMain = new EventEmitter();
  ipcMain.handle = (name, handler) => { assert.equal(handlers.has(name), false); handlers.set(name, handler); };
  ipcMain.removeHandler = name => handlers.delete(name);
  class MockWindow extends EventEmitter {
    constructor(settings) {
      super();
      if (options.constructError) throw Error('construct failed');
      Object.assign(this, {settings, destroyed: false, visible: false, minimized: false, sent: []});
      this.webContents = new EventEmitter();
      Object.assign(this.webContents, {mainFrame: {url: ''},
        send: (name, state) => { this.sent.push({name, state}); },
        setWindowOpenHandler: handler => { this.popup = handler; },
        session: {setPermissionRequestHandler: handler => { this.permissionRequest = handler; },
          setPermissionCheckHandler: handler => { this.permissionCheck = handler; },
          webRequest: {onBeforeRequest: handler => { this.request = handler; }}}});
      windows.push(this);
    }
    loadFile(file) {
      this.loaded = file; this.webContents.mainFrame.url = pathToFileURL(file).href;
      if (options.loadError) return Promise.reject(Error('load failed'));
      return options.loadPromise || Promise.resolve();
    }
    isDestroyed() { return this.destroyed; }
    setMenu(menu) { this.menu = menu; }
    center() { calls.push('center'); }
    show() { if (options.showError) throw Error('show failed'); this.visible = true; calls.push('show'); }
    focus() { calls.push('focus'); }
    isMinimized() { return this.minimized; }
    restore() { this.minimized = false; calls.push('restore'); }
    close() { const event = {prevented: false, preventDefault() { this.prevented = true; }}; this.emit('close', event); if (!event.prevented) this.destroy(); }
    destroy() { if (this.destroyed) return; this.destroyed = true; calls.push('destroy'); this.emit('closed'); }
  }
  const controller = createStartupWindow({BrowserWindow: MockWindow, ipcMain, version: '0.13.27',
    icon: path.resolve(__dirname, '../../build/icons/workbench.ico'), logDirectory: 'fixed-log-directory',
    onCancel: () => { calls.push('cancel'); options.onCancel?.(); },
    onOpenLogs: directory => { logs.push(directory); return options.onOpenLogs?.(); },
    onError: error => { calls.push('error'); errors.push(error); return options.onError?.(); }, hidden: options.hidden});
  t.after(() => { controller.complete(); for (const window of windows) window.destroy(); });
  const event = window => ({sender: window.webContents, senderFrame: window.webContents.mainFrame});
  const snapshot = window => handlers.get(GET_STATE)?.(event(window));
  return {calls, windows, errors, logs, handlers, ipcMain, controller, event, snapshot};
}

test('startup creates one fixed sandbox window with its own ephemeral session and does not gate main startup', async t => {
  const f = fixture(t, {loadPromise: new Promise(() => {})});
  assert.equal(f.controller.isActive(), false); assert.equal(f.handlers.size, 0);
  const pending = f.controller.open(); assert.equal(f.controller.open(), pending); await pending;
  const window = f.windows[0], settings = window.settings;
  assert.equal(f.windows.length, 1); assert.equal(window.loaded, documentPath);
  assert.equal(settings.width, 560); assert.equal(settings.height, 360); assert.equal(settings.frame, false);
  assert.equal(settings.resizable, false); assert.equal(settings.closable, true); assert.equal(settings.show, false);
  assert.equal(settings.maximizable, false); assert.equal(settings.fullscreenable, false); assert.ok(!settings.alwaysOnTop);
  assert.equal(settings.webPreferences.preload, path.resolve(__dirname, '../../desktop/startupPreload.cjs'));
  assert.equal(settings.webPreferences.sandbox, true); assert.equal(settings.webPreferences.contextIsolation, true);
  assert.equal(settings.webPreferences.nodeIntegration, false); assert.equal(settings.webPreferences.webSecurity, true);
  assert.match(settings.webPreferences.partition, /^zhezhi-startup-[a-f0-9-]+$/);
  assert.doesNotMatch(settings.webPreferences.partition, /^persist:/);
  assert.equal(window.menu, null); assert.deepEqual(f.calls, ['center']); assert.equal(window.visible, false);
  assert.equal(f.controller.isActive(), true);
  assert.deepEqual(f.snapshot(window).state, {version: '0.13.27', stage: 'starting',
    title: '正在启动折纸工坊', detail: '正在准备本机工作环境。', slow: false});
});

test('either local ready event shows immediately, once, with current rather than fake progress', async t => {
  for (const eventName of ['ready-to-show', 'did-finish-load']) {
    const f = fixture(t); f.controller.update('service'); await f.controller.open();
    const window = f.windows[0]; f.controller.update('workspace');
    if (eventName === 'ready-to-show') window.emit(eventName); else window.webContents.emit(eventName);
    assert.equal(window.visible, true); assert.equal(window.sent.at(-1).state.state.stage, 'workspace');
    window.emit('ready-to-show'); window.webContents.emit('did-finish-load');
    assert.equal(f.calls.filter(call => call === 'show').length, 1);
    const revision = f.snapshot(window).revision;
    for (const stage of ['service', 'starting', 'error', 'remote', null, {}]) f.controller.update(stage);
    assert.equal(f.snapshot(window).revision, revision); assert.equal(f.snapshot(window).state.stage, 'workspace');
  }
});

test('all startup IPC requires the exact sender, main frame, and local document URL', async t => {
  const f = fixture(t); await f.controller.open(); const window = f.windows[0], good = f.event(window);
  const forged = [{sender: {}, senderFrame: good.senderFrame}, {sender: good.sender, senderFrame: {url: documentURL}},
    {sender: good.sender, senderFrame: null}, {}];
  for (const event of forged) {
    assert.equal(f.handlers.get(GET_STATE)(event), null);
    f.ipcMain.emit(OPEN_LOGS, event, 'arbitrary-path'); f.ipcMain.emit(CLOSE, event);
  }
  for (const url of ['https://external.invalid/', 'about:blank', documentURL + '?other', documentURL + '#other', documentURL + '.html']) {
    good.senderFrame.url = url;
    assert.equal(f.handlers.get(GET_STATE)(good), null);
    f.ipcMain.emit(OPEN_LOGS, good); f.ipcMain.emit(CLOSE, good);
  }
  good.senderFrame.url = documentURL;
  assert.equal(window.destroyed, false); assert.deepEqual(f.logs, []);
  f.ipcMain.emit(OPEN_LOGS, good, 'arbitrary-path'); assert.deepEqual(f.logs, ['fixed-log-directory']);
  f.ipcMain.emit(CLOSE, good); assert.equal(window.destroyed, true);
  assert.equal(f.handlers.size, 0); assert.equal(f.ipcMain.listenerCount(CLOSE), 0); assert.equal(f.ipcMain.listenerCount(OPEN_LOGS), 0);
  assert.equal(f.ipcMain.listenerCount(UI_READY), 0);
});

test('session denies external and unrelated requests, permissions, navigation, webviews, and new windows', async t => {
  const f = fixture(t); await f.controller.open(); const window = f.windows[0];
  const permitted = [documentURL, ...['startup.css', 'startup.js'].map(name => pathToFileURL(path.join(path.dirname(documentPath), name)).href),
    pathToFileURL(path.resolve(__dirname, '../../src/ui/dialog.css')).href, pathToFileURL(window.settings.icon).href];
  for (const url of [...permitted, 'https://external.invalid/', 'http://127.0.0.1:8787/', 'data:text/plain,other', documentURL + '?other',
    pathToFileURL(path.resolve(__dirname, '../../desktop/main.cjs')).href]) {
    let answer; window.request({url}, value => { answer = value; });
    assert.deepEqual(answer, {cancel: !permitted.includes(url)});
  }
  let permission; window.permissionRequest(window.webContents, 'clipboard-read', value => { permission = value; });
  assert.equal(permission, false); assert.equal(window.permissionCheck(), false); assert.deepEqual(window.popup(), {action: 'deny'});
  for (const name of ['will-navigate', 'will-redirect', 'will-attach-webview']) {
    let prevented = false; window.webContents.emit(name, {preventDefault() { prevented = true; }}, documentURL);
    assert.equal(prevented, true);
  }
});

test('slow startup is only a real eight-second hint and complete clears the timer and listeners', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const f = fixture(t); await f.controller.open(); const window = f.windows[0]; window.emit('ready-to-show');
  f.ipcMain.emit(UI_READY, f.event(window));
  f.controller.update('service'); t.mock.timers.tick(7999); assert.equal(f.snapshot(window).state.slow, false);
  t.mock.timers.tick(1); assert.equal(f.snapshot(window).state.slow, true); assert.equal(f.snapshot(window).state.stage, 'service');
  f.controller.update('workspace'); assert.equal(f.snapshot(window).state.slow, true);
  const updates = window.sent.length;
  f.controller.complete(); f.controller.complete(); f.controller.fail('late'); f.controller.update('service');
  t.mock.timers.tick(30000); assert.equal(window.sent.length, updates); assert.equal(f.controller.isActive(), false);
  assert.equal(window.destroyed, true); assert.ok(!f.calls.includes('cancel')); assert.equal(f.handlers.size, 0);
});

test('completion before local load and late load rejection never cancel or reopen the startup window', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  let reject;
  const f = fixture(t, {loadPromise: new Promise((_resolve, fail) => { reject = fail; })});
  await f.controller.open(); const window = f.windows[0]; f.controller.complete();
  reject(Error('late load')); window.emit('ready-to-show'); window.webContents.emit('did-finish-load'); await flush();
  t.mock.timers.tick(30000);
  assert.equal(window.visible, false); assert.equal(f.controller.isActive(), false);
  assert.deepEqual(f.errors, []); assert.ok(!f.calls.includes('cancel'));
  const unopened = fixture(t); unopened.controller.complete(); await unopened.controller.open(); assert.equal(unopened.windows.length, 0);
});

test('native or IPC close calls the owner before destroying exactly once, without approving completion', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  for (const source of ['native', 'ipc', 'unexpected-destroy']) {
    const f = fixture(t); await f.controller.open(); const window = f.windows[0];
    if (source === 'native') window.close(); else if (source === 'ipc') f.ipcMain.emit(CLOSE, f.event(window)); else window.destroy();
    f.controller.complete(); window.emit('closed'); f.ipcMain.emit(CLOSE, f.event(window)); t.mock.timers.tick(30000);
    assert.equal(f.calls.filter(call => call === 'cancel').length, 1); assert.equal(f.controller.isActive(), false);
    if (source !== 'unexpected-destroy') assert.ok(f.calls.indexOf('cancel') < f.calls.indexOf('destroy'));
    assert.equal(f.handlers.size, 0);
  }
});

test('a business failure keeps its error visible, stops slow timing, and permits logs or explicit exit', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const f = fixture(t); f.controller.fail('本机服务无法启动。'); await f.controller.open();
  const window = f.windows[0]; window.webContents.emit('did-finish-load');
  f.ipcMain.emit(UI_READY, f.event(window));
  f.controller.fail('later error'); f.controller.update('workspace'); f.controller.complete(); t.mock.timers.tick(30000);
  assert.equal(window.visible, true); assert.equal(window.destroyed, false); assert.equal(f.controller.isActive(), true);
  assert.equal(f.snapshot(window).state.stage, 'error'); assert.equal(f.snapshot(window).state.detail, '本机服务无法启动。');
  assert.equal(f.snapshot(window).state.slow, false); assert.deepEqual(f.errors, []);
  f.ipcMain.emit(OPEN_LOGS, f.event(window)); assert.deepEqual(f.logs, ['fixed-log-directory']);
  window.close(); assert.equal(f.controller.isActive(), false); assert.equal(window.destroyed, true);
});

test('an owner quit during cancellation can close again without being vetoed by the startup window', async t => {
  let reentrantPrevented = false;
  const f = fixture(t, {onCancel() {
    f.windows[0].emit('close', {preventDefault() { reentrantPrevented = true; }});
  }});
  await f.controller.open(); f.ipcMain.emit(CLOSE, f.event(f.windows[0]));
  assert.equal(reentrantPrevented, false); assert.equal(f.windows[0].destroyed, true);
  assert.equal(f.calls.filter(call => call === 'cancel').length, 1);
});

test('technical failures report once without rejecting startup, calling cancellation, or retaining handlers', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  for (const reason of ['construct', 'load', 'main-load', 'renderer', 'preload', 'unresponsive', 'show']) {
    const f = fixture(t, {constructError: reason === 'construct', loadError: reason === 'load', showError: reason === 'show'});
    await f.controller.open(); const window = f.windows[0];
    if (reason === 'main-load') {
      window.webContents.emit('did-fail-load', {}, -3, 'subframe', '', false);
      assert.equal(f.controller.isActive(), true);
      window.webContents.emit('did-fail-load', {}, -6, 'missing file', documentURL, true);
    }
    if (reason === 'renderer') window.webContents.emit('render-process-gone');
    if (reason === 'preload') window.webContents.emit('preload-error', {}, 'missing-preload.cjs', Error('missing preload'));
    if (reason === 'unresponsive') window.emit('unresponsive');
    if (reason === 'show') window.emit('ready-to-show');
    await flush(); f.controller.complete(); t.mock.timers.tick(30000);
    assert.equal(f.controller.isActive(), false); assert.equal(f.errors.length, 1, reason);
    assert.ok(!f.calls.includes('cancel')); assert.equal(f.handlers.size, 0);
    assert.equal(f.ipcMain.listenerCount(UI_READY), 0);
    if (window) {
      assert.equal(window.destroyed, true); assert.ok(f.calls.indexOf('error') < f.calls.indexOf('destroy'));
      window.webContents.emit('render-process-gone'); assert.equal(f.errors.length, 1);
    }
  }
});

test('a stalled local page has a bounded bootstrap timeout without delaying main startup', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const f = fixture(t, {loadPromise: new Promise(() => {})});
  await f.controller.open(); const window = f.windows[0];
  t.mock.timers.tick(14999); assert.equal(f.controller.isActive(), true); assert.deepEqual(f.errors, []);
  t.mock.timers.tick(1); assert.equal(window.destroyed, true); assert.equal(f.errors.length, 1);
  assert.match(f.errors[0].message, /本地页面载入超时/); assert.ok(!f.calls.includes('cancel'));
  t.mock.timers.tick(30000); assert.equal(f.errors.length, 1);
});

test('a loaded page must render state within three seconds and duplicate load events cannot postpone the deadline', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  for (const eventName of ['ready-to-show', 'did-finish-load']) {
    const f = fixture(t); await f.controller.open(); const window = f.windows[0];
    t.mock.timers.tick(1000);
    if (eventName === 'ready-to-show') window.emit(eventName); else window.webContents.emit(eventName);
    assert.equal(window.visible, true); t.mock.timers.tick(2999); assert.equal(window.destroyed, false);
    window.emit('ready-to-show'); window.webContents.emit('did-finish-load'); t.mock.timers.tick(1);
    assert.equal(window.destroyed, true); assert.equal(f.errors.length, 1); assert.match(f.errors[0].message, /界面未能完成初始化/);
    assert.ok(!f.calls.includes('cancel'));
  }
});

test('a trusted UI acknowledgement clears bootstrap timing before or after local ready without timing out slow services', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  for (const beforeReady of [true, false]) {
    const f = fixture(t); await f.controller.open(); const window = f.windows[0];
    if (beforeReady) f.ipcMain.emit(UI_READY, f.event(window));
    window.emit('ready-to-show');
    if (!beforeReady) { t.mock.timers.tick(2999); f.ipcMain.emit(UI_READY, f.event(window)); }
    f.controller.update('service'); t.mock.timers.tick(60000);
    assert.equal(window.destroyed, false); assert.equal(f.controller.isActive(), true); assert.deepEqual(f.errors, []);
    assert.equal(f.snapshot(window).state.slow, true);
  }
});

test('forged senders, subframes, and changed document URLs cannot acknowledge a nonfunctional UI', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const f = fixture(t); await f.controller.open(); const window = f.windows[0], good = f.event(window);
  window.emit('ready-to-show');
  for (const event of [{sender: {}, senderFrame: good.senderFrame}, {sender: good.sender, senderFrame: {url: documentURL}},
    {sender: good.sender, senderFrame: null}, {}]) f.ipcMain.emit(UI_READY, event);
  for (const url of ['https://external.invalid/', documentURL + '?other', documentURL + '#other', 'about:blank']) {
    good.senderFrame.url = url; f.ipcMain.emit(UI_READY, good);
  }
  good.senderFrame.url = documentURL; t.mock.timers.tick(3000);
  assert.equal(window.destroyed, true); assert.equal(f.errors.length, 1);
});

test('a business failure retains pending UI bootstrap protection so the owner can use its native fallback', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  for (const loaded of [false, true]) {
    const f = fixture(t); await f.controller.open(); const window = f.windows[0];
    if (loaded) window.webContents.emit('did-finish-load');
    f.controller.fail('服务启动失败');
    assert.equal(f.snapshot(window).state.stage, 'error');
    const timeout = loaded ? 3000 : 15000;
    t.mock.timers.tick(timeout - 1); assert.equal(window.destroyed, false);
    t.mock.timers.tick(1); assert.equal(window.destroyed, true); assert.equal(f.errors.length, 1);
    assert.ok(f.calls.indexOf('error') < f.calls.indexOf('destroy')); assert.ok(!f.calls.includes('cancel'));
  }
});

test('hidden startup windows keep real state but cannot steal focus, and visible ones can restore', async t => {
  const hidden = fixture(t, {hidden: true}); await hidden.controller.open(); const hiddenWindow = hidden.windows[0];
  hiddenWindow.emit('ready-to-show'); hidden.controller.focus(); hidden.controller.update('service');
  assert.equal(hiddenWindow.visible, false); assert.ok(!hidden.calls.includes('focus'));
  assert.equal(hiddenWindow.sent.at(-1).state.state.stage, 'service');
  const visible = fixture(t); await visible.controller.open(); const window = visible.windows[0];
  visible.controller.focus(); assert.ok(!visible.calls.includes('focus'));
  window.emit('ready-to-show'); window.minimized = true; visible.controller.focus();
  assert.equal(window.minimized, false); assert.ok(visible.calls.includes('restore')); assert.ok(visible.calls.includes('focus'));
});

test('owner callback failures cannot strand or crash the startup window', async t => {
  const f = fixture(t, {onCancel() { throw Error('cancel callback'); }, onOpenLogs() { return Promise.reject(Error('logs callback')); }, onError() { throw Error('report callback'); }});
  await f.controller.open(); const window = f.windows[0];
  f.ipcMain.emit(OPEN_LOGS, f.event(window)); await flush(); assert.equal(f.errors.length, 1);
  f.ipcMain.emit(CLOSE, f.event(window)); await flush(); assert.equal(f.errors.length, 2);
  assert.equal(window.destroyed, true); assert.equal(f.controller.isActive(), false);
});

function preloadFixture(snapshotPromise) {
  let exposed;
  const calls = [], ipcRenderer = new EventEmitter();
  ipcRenderer.invoke = name => { calls.push(['invoke', name]); return snapshotPromise; };
  ipcRenderer.send = (...args) => calls.push(['send', ...args]);
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../desktop/startupPreload.cjs'), 'utf8'), {
    require(name) { assert.equal(name, 'electron'); return {ipcRenderer, contextBridge: {exposeInMainWorld(name, api) { assert.equal(name, 'startup'); exposed = api; }}}; },
  });
  return {api: exposed, calls, push: envelope => ipcRenderer.emit(STATE, {privateEvent: true}, envelope)};
}
const envelope = (revision, stage = 'starting') => ({revision, state: {version: '0.13.27', stage, title: 'title', detail: 'detail', slow: false}});

test('preload caches the first snapshot for late UI subscription and exposes only fixed bridge actions', async () => {
  const f = preloadFixture(Promise.resolve(envelope(0))); await flush();
  const received = [], unsubscribe = f.api.onState(state => received.push(state));
  assert.equal(received.length, 1); assert.equal(received[0].stage, 'starting');
  assert.deepEqual(Object.keys(received[0]), ['version', 'stage', 'title', 'detail', 'slow']);
  assert.deepEqual(Object.keys(f.api), ['onState', 'close', 'openLogs']);
  f.api.close('ignored'); f.api.openLogs('arbitrary-path');
  assert.deepEqual(f.calls, [['invoke', GET_STATE], ['send', UI_READY], ['send', CLOSE], ['send', OPEN_LOGS]]);
  unsubscribe(); f.push(envelope(1, 'service')); assert.equal(received.length, 1);
});

test('preload never replaces a newer pushed stage with a stale initial response and isolates subscribers', async () => {
  let resolve;
  const f = preloadFixture(new Promise(answer => { resolve = answer; })), received = [];
  f.api.onState(() => { throw Error('UI callback failed'); });
  f.api.onState(state => { received.push(state.stage); state.stage = 'mutated'; });
  f.push(envelope(2, 'workspace')); resolve(envelope(0)); await flush();
  f.push(envelope(1, 'service')); f.push(envelope(2, 'workspace'));
  assert.deepEqual(received, ['workspace']);
  let latest; f.api.onState(state => { latest = state; }); assert.equal(latest.stage, 'workspace');
  f.push({...envelope(3), state: {version: 1}}); f.push({revision: -1, state: envelope(0).state});
  f.push(envelope(3, 'remote')); assert.deepEqual(received, ['workspace']);
});

test('preload can receive state after a failed initial request without exposing IPC events', async () => {
  const f = preloadFixture(Promise.reject(Error('handler unavailable'))); await flush();
  let args; f.api.onState((...values) => { args = values; });
  assert.doesNotThrow(() => f.api.onState(null)()); f.push(envelope(1, 'service'));
  assert.equal(args.length, 1); assert.equal(args[0].stage, 'service'); assert.equal(args[0].privateEvent, undefined);
});

test('preload acknowledges UI only once after a state callback returns successfully, never for missing or throwing UI code', async () => {
  const f = preloadFixture(Promise.resolve(envelope(0))); await flush();
  assert.deepEqual(f.calls, [['invoke', GET_STATE]]);
  const unsubscribe = f.api.onState(() => { throw Error('render failed'); });
  f.push(envelope(1, 'service')); assert.deepEqual(f.calls, [['invoke', GET_STATE]]);
  unsubscribe();
  const received = [];
  f.api.onState(state => {
    assert.equal(f.calls.filter(call => call[0] === 'send' && call[1] === UI_READY).length, received.length ? 1 : 0);
    received.push(state.stage);
  });
  assert.deepEqual(f.calls, [['invoke', GET_STATE], ['send', UI_READY]]);
  f.push(envelope(2, 'workspace')); f.api.onState(() => {}); f.push(envelope(3, 'error'));
  assert.deepEqual(received, ['service', 'workspace', 'error']);
  assert.deepEqual(f.calls, [['invoke', GET_STATE], ['send', UI_READY]]);
});
