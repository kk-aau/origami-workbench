const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const {createMessageWindows} = require('../../desktop/messageWindow.cjs');
const READY = 'desktop:message-ready', SHOW = 'desktop:message-show', RESPONSE = 'desktop:message-response';
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture(t, options = {}) {
  const calls = [], handlers = new Map(), windows = [];
  const ipcMain = new EventEmitter();
  ipcMain.handle = (name, handler) => handlers.set(name, handler);
  ipcMain.removeHandler = name => handlers.delete(name);
  class MockWindow extends EventEmitter {
    constructor(settings) {
      super(); this.settings = settings; this.destroyed = false; this.visible = false;
      this.webContents = new EventEmitter();
      Object.assign(this.webContents, {mainFrame: {url: ''}, focus: () => calls.push('child-renderer-focus'),
        setWindowOpenHandler: handler => { this.popup = handler; },
        session: {setPermissionRequestHandler: handler => { this.permissionRequest = handler; },
          setPermissionCheckHandler: handler => { this.permissionCheck = handler; },
          webRequest: {onBeforeRequest: handler => { this.request = handler; }}}});
      windows.push(this);
    }
    loadFile(file) { this.loaded = file; this.webContents.mainFrame.url = pathToFileURL(file).href; return Promise.resolve(); }
    setMenu(value) { this.menu = value; }
    isDestroyed() { return this.destroyed; }
    show() { this.visible = true; calls.push('child-show'); }
    focus() { calls.push('child-focus'); }
    destroy() { if (this.destroyed) return; this.destroyed = true; this.emit('closed'); }
  }
  const owner = new EventEmitter();
  Object.assign(owner, {destroyed: false, visible: true, minimized: false,
    isDestroyed: () => owner.destroyed, isVisible: () => owner.visible, isMinimized: () => owner.minimized,
    blur: () => calls.push('owner-blur'), focus: () => calls.push('owner-focus'),
    webContents: {focus: () => calls.push('owner-renderer-focus')}});
  const service = createMessageWindows({BrowserWindow: MockWindow, ipcMain, ...options});
  t.after(() => service.dispose());
  const event = window => ({sender: window.webContents, senderFrame: window.webContents.mainFrame});
  const ready = window => { const response = handlers.get(READY)(event(window)); ipcMain.emit(SHOW, event(window)); return response; };
  return {calls, handlers, windows, owner, service, ipcMain, event, ready};
}

test('confirmation opens a parented sandbox window with its own in-memory session and theme', async t => {
  const f = fixture(t, {getTheme: () => 'dark'}), pending = f.service.confirm(f.owner, {message: '继续？', danger: true});
  const window = f.windows[0], settings = window.settings;
  assert.equal(settings.parent, f.owner); assert.equal(settings.modal, true); assert.equal(settings.frame, false); assert.equal(settings.show, false); assert.equal(settings.height, 240);
  assert.deepEqual(settings.webPreferences, {preload: path.resolve(__dirname, '../../desktop/messagePreload.cjs'), partition: settings.webPreferences.partition,
    nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true});
  assert.match(settings.webPreferences.partition, /^zhezhi-message-[a-f0-9-]+$/); assert.doesNotMatch(settings.webPreferences.partition, /^persist:/);
  assert.equal(window.menu, null); assert.equal(f.calls.length, 0);
  assert.deepEqual(f.ready(window), {kind: 'confirm', theme: 'dark', title: '确认操作', message: '继续？', detail: '', cancelLabel: '取消', confirmLabel: '继续', danger: true});
  f.ipcMain.emit(RESPONSE, f.event(window), true); assert.equal(await pending, true);
  assert.equal(window.destroyed, true); assert.deepEqual(f.calls.slice(-3), ['owner-blur', 'owner-focus', 'owner-renderer-focus']);
});

test('only the exact message main frame can initialize, show or approve its window', async t => {
  const f = fixture(t), pending = f.service.confirm(f.owner, {message: '继续？'}), window = f.windows[0];
  const badEvents = [{sender: {}, senderFrame: window.webContents.mainFrame}, {sender: window.webContents, senderFrame: {url: window.webContents.mainFrame.url}}, {sender: window.webContents, senderFrame: null}];
  for (const event of badEvents) {
    assert.equal(f.handlers.get(READY)(event), null); f.ipcMain.emit(SHOW, event); f.ipcMain.emit(RESPONSE, event, true);
  }
  f.ipcMain.emit(RESPONSE, f.event(window), true); assert.equal(window.destroyed, false, 'approval before initialization is ignored');
  const actualURL = window.webContents.mainFrame.url;
  for (const url of ['file:///different.html', actualURL + '#foreign', 'https://external.example/']) {
    window.webContents.mainFrame.url = url; assert.equal(f.handlers.get(READY)(f.event(window)), null); f.ipcMain.emit(RESPONSE, f.event(window), true);
  }
  window.webContents.mainFrame.url = actualURL; f.ready(window);
  f.ipcMain.emit(RESPONSE, f.event(window), 'true'); assert.equal(window.destroyed, false);
  f.ipcMain.emit(RESPONSE, f.event(window), false); assert.equal(await pending, false);
});

test('window resources are restricted to the document, script and shared CSS; permissions and popups are denied', async t => {
  const f = fixture(t), pending = f.service.info(f.owner, {message: '关于'}), window = f.windows[0];
  const decision = url => { let result; window.request({url}, value => { result = value; }); return result.cancel; };
  for (const file of ['desktop/message.html', 'desktop/message.js', 'src/ui/dialog.css']) assert.equal(decision(pathToFileURL(path.resolve(__dirname, '../..', file)).href), false);
  for (const url of ['http://127.0.0.1:8080/', 'https://external.example/', 'file:///private.txt', 'data:text/html,hello']) assert.equal(decision(url), true);
  let permission; window.permissionRequest(null, 'media', value => { permission = value; }); assert.equal(permission, false); assert.equal(window.permissionCheck(), false);
  assert.deepEqual(window.popup(), {action: 'deny'});
  let prevented = 0; window.webContents.emit('will-navigate', {preventDefault() { prevented++; }}, 'https://external.example/');
  window.webContents.emit('will-attach-webview', {preventDefault() { prevented++; }}); assert.equal(prevented, 2);
  f.service.cancel(f.owner); assert.equal(await pending, false);
});

test('concurrent confirmation is canceled without sharing another operation approval, then can reopen', async t => {
  const f = fixture(t), first = f.service.confirm(f.owner, {message: 'first'}), window = f.windows[0]; f.ready(window);
  assert.equal(await f.service.confirm(f.owner, {message: 'second'}), false); assert.equal(f.windows.length, 1);
  f.ipcMain.emit(RESPONSE, f.event(window), true); assert.equal(await first, true);
  const next = f.service.confirm(f.owner, {message: 'third'}); assert.equal(f.windows.length, 2);
  assert.notEqual(f.windows[1].settings.webPreferences.partition, window.settings.webPreferences.partition);
  f.ready(f.windows[1]); f.ipcMain.emit(RESPONSE, f.event(f.windows[1]), false); assert.equal(await next, false);
});

test('parent destruction, child close, renderer loss and load failure all cancel once', async t => {
  for (const reason of ['owner', 'child', 'renderer', 'load']) {
    const f = fixture(t), pending = f.service.confirm(f.owner, {message: reason}), window = f.windows[0]; f.ready(window);
    if (reason === 'owner') { f.owner.destroyed = true; f.owner.emit('closed'); }
    if (reason === 'child') window.destroy();
    if (reason === 'renderer') window.webContents.emit('render-process-gone');
    if (reason === 'load') window.webContents.emit('did-fail-load');
    assert.equal(await pending, false); assert.equal(window.destroyed, true); assert.equal(f.owner.listenerCount('closed'), 0);
    f.ipcMain.emit(RESPONSE, f.event(window), true); assert.equal(f.handlers.get(READY)(f.event(window)), null);
    if (reason === 'owner') assert.ok(!f.calls.includes('owner-focus'));
  }
});

test('a hidden or minimized parent stays inactive after cancellation', async t => {
  for (const state of ['hidden', 'minimized']) {
    const f = fixture(t), pending = f.service.confirm(f.owner, {message: state}), window = f.windows[0]; f.ready(window);
    if (state === 'hidden') f.owner.visible = false; else f.owner.minimized = true;
    f.ipcMain.emit(RESPONSE, f.event(window), false); assert.equal(await pending, false); assert.ok(!f.calls.includes('owner-focus'));
  }
});

test('a missing renderer bootstrap or missing show signal cancels after 15 seconds', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  for (const initialized of [false, true]) {
    const f = fixture(t), pending = f.service.confirm(f.owner, {message: 'bootstrap'}), window = f.windows[0];
    if (initialized) assert.equal(f.handlers.get(READY)(f.event(window)).message, 'bootstrap');
    t.mock.timers.tick(14999); assert.equal(window.destroyed, false);
    t.mock.timers.tick(1); assert.equal(await pending, false); assert.equal(window.destroyed, true);
  }
  const f = fixture(t), pending = f.service.confirm(f.owner, {message: 'shown'}), window = f.windows[0]; f.ready(window);
  t.mock.timers.tick(30000); assert.equal(window.destroyed, false, 'a shown dialog waits for its user');
  f.ipcMain.emit(RESPONSE, f.event(window), true); assert.equal(await pending, true);
});

test('invalid content does not create a window and dispose cancels pending work', async t => {
  const f = fixture(t);
  for (const options of [null, {}, {message: ''}, {message: 'x'.repeat(4097)}, {message: 'yes', detail: {}}, {message: 'yes', title: ' '}]) assert.equal(await f.service.confirm(f.owner, options), false);
  assert.equal(f.windows.length, 0);
  const pending = f.service.info(f.owner, {message: 'about', detail: '版本与许可证'}); f.ready(f.windows[0]);
  f.service.dispose(); assert.equal(await pending, false); assert.equal(await f.service.confirm(f.owner, {message: 'after dispose'}), false);
  assert.equal(f.handlers.size, 0); assert.equal(f.ipcMain.listenerCount(RESPONSE), 0); assert.equal(f.ipcMain.listenerCount(SHOW), 0);
});

test('technical message-window failures fall back to a parented system confirmation, without approving automatically', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  for (const reason of ['load', 'renderer', 'unresponsive', 'bootstrap']) {
    const calls = [], f = fixture(t, {dialog: {async showMessageBox(owner, options) {
      assert.equal(owner, f.owner);
      assert.equal(f.windows[0].destroyed, true, 'the failed modal releases the owner before the system dialog opens');
      Object.defineProperty(f.windows[0], 'webContents', {get() { throw Error('Object has been destroyed'); }});
      calls.push(options); return {response: 1};
    }}});
    const pending = f.service.confirm(f.owner, {title: '保存修改', message: '继续导入？', detail: '当前工程已保留', cancelLabel: '返回', confirmLabel: '继续导入', danger: true});
    const window = f.windows[0];
    if (reason !== 'bootstrap') f.ready(window);
    if (reason === 'load') window.webContents.emit('did-fail-load');
    if (reason === 'renderer') window.webContents.emit('render-process-gone');
    if (reason === 'unresponsive') window.emit('unresponsive');
    if (reason === 'bootstrap') t.mock.timers.tick(15000);
    assert.equal(await pending, true);
    assert.deepEqual(calls, [{type: 'warning', title: '保存修改', message: '继续导入？', detail: '当前工程已保留', buttons: ['返回', '继续导入'], defaultId: 0, cancelId: 0, noLink: true}]);
    assert.equal(f.service.hasPending(f.owner), false);
  }
});

test('user cancellation never opens a second confirmation, while native cancellation and failure remain false', async t => {
  let nativeCalls = 0;
  const f = fixture(t, {dialog: {async showMessageBox() { nativeCalls++; return {response: 0}; }}});
  for (const reason of ['cancel', 'close']) {
    const pending = f.service.confirm(f.owner, {message: '用户取消'}), window = f.windows.at(-1); f.ready(window);
    if (reason === 'cancel') f.ipcMain.emit(RESPONSE, f.event(window), false); else window.destroy();
    assert.equal(await pending, false);
  }
  assert.equal(nativeCalls, 0);
  const pending = f.service.confirm(f.owner, {message: '技术故障后取消'}); f.windows.at(-1).webContents.emit('did-fail-load');
  assert.equal(await pending, false); assert.equal(nativeCalls, 1);
  const failed = fixture(t, {dialog: {async showMessageBox() { throw Error('system dialog unavailable'); }}});
  const result = failed.service.confirm(failed.owner, {message: '系统窗口也不可用'}); failed.windows[0].webContents.emit('did-fail-load');
  assert.equal(await result, false);
});

test('native fallback retains its request identity and cannot approve a concurrent operation', async t => {
  let answer;
  const f = fixture(t, {dialog: {showMessageBox: () => new Promise(resolve => { answer = resolve; })}});
  const first = f.service.confirm(f.owner, {message: 'first'}); f.windows[0].webContents.emit('did-fail-load');
  assert.equal(f.service.hasPending(f.owner), true);
  assert.equal(await f.service.confirm(f.owner, {message: 'second'}), false);
  assert.equal(f.windows.length, 1);
  answer({response: 1}); assert.equal(await first, true);
});

test('fallback activity records only technical phase and choice, and logging failure cannot block an answer', async t => {
  const events = [], f = fixture(t, {onEvent: event => events.push(event), dialog: {async showMessageBox() { return {response: 1}; }}});
  const pending = f.service.confirm(f.owner, {message: 'private document title', detail: 'private path'}); f.windows[0].webContents.emit('did-fail-load');
  assert.equal(await pending, true);
  assert.deepEqual(events, [
    {action: 'desktop.confirm.fallback', level: 'warning', details: {reason: 'load', status: 'started'}},
    {action: 'desktop.confirm.fallback', level: 'info', details: {reason: 'load', status: 'completed', result: 'accepted'}},
  ]);
  const failing = fixture(t, {onEvent() { throw Error('log unavailable'); }, dialog: {async showMessageBox() { return {response: 1}; }}});
  const answer = failing.service.confirm(failing.owner, {message: 'continue'}); failing.windows[0].webContents.emit('did-fail-load');
  assert.equal(await answer, true);
});

function rendererFixture(payload) {
  const events = new Map(), responses = [], elements = new Map();
  const document = {activeElement: null, title: '', documentElement: {dataset: {}}, addEventListener: (name, listener) => events.set(name, listener)};
  for (const id of ['message-cancel', 'message-accept', 'message-close', 'message-title', 'message-text', 'message-detail']) {
    const classes = new Set(['ui-button', 'is-primary']), element = {id, textContent: '', listeners: new Map(), attributes: new Map(), hidden: false, disabled: false, removed: false,
      addEventListener(name, listener) { this.listeners.set(name, listener); }, focus() { document.activeElement = this; }, remove() { this.removed = true; },
      classList: {add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value)}};
    elements.set(id, element);
  }
  const dialog = {attributes: new Map(), setAttribute(name, value) { this.attributes.set(name, value); }};
  document.getElementById = id => elements.get(id); document.querySelector = () => dialog;
  document.querySelectorAll = () => ['message-close', 'message-cancel', 'message-accept'].map(id => elements.get(id)).filter(element => !element.removed);
  let shows = 0;
  const window = {messageWindow: {ready: () => Promise.resolve(payload), respond: answer => responses.push(answer), show: () => { shows++; }}};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../desktop/message.js'), 'utf8'), {window, document});
  return {document, events, elements, responses, dialog, shows: () => shows};
}

test('renderer focuses cancel, inserts text without markup, traps Tab and cancels once on Escape or X', async () => {
  const payload = {kind: 'confirm', theme: 'dark', title: '确认操作', message: '<img src=x onerror=alert(1)>', detail: '第一行\n第二行', confirmLabel: '删除', cancelLabel: '返回', danger: true};
  for (const action of ['Escape', 'X', 'cancel']) {
    const f = rendererFixture(payload); await flush();
    assert.equal(f.document.activeElement.id, 'message-cancel'); assert.equal(f.elements.get('message-text').textContent, payload.message);
    assert.equal(f.document.documentElement.dataset.theme, 'dark'); assert.equal(f.shows(), 1); assert.equal(f.elements.get('message-accept').classList.contains('is-danger'), true);
    f.elements.get('message-accept').focus(); let prevented = false; f.events.get('keydown')({key: 'Tab', shiftKey: false, preventDefault() { prevented = true; }});
    assert.equal(prevented, true); assert.equal(f.document.activeElement.id, 'message-close');
    if (action === 'Escape') f.events.get('keydown')({key: 'Escape', preventDefault() {}});
    else f.elements.get(action === 'X' ? 'message-close' : 'message-cancel').listeners.get('click')();
    f.elements.get('message-accept').listeners.get('click')(); assert.deepEqual(f.responses, [false]);
  }
});

test('information renderer has one confirmation button and reports true only on that action', async () => {
  const f = rendererFixture({kind: 'info', theme: 'light', title: '关于', message: '折纸工坊', detail: '', confirmLabel: '知道了'}); await flush();
  assert.equal(f.elements.get('message-cancel').removed, true); assert.equal(f.elements.get('message-detail').removed, true);
  assert.equal(f.document.activeElement.id, 'message-accept'); assert.equal(f.dialog.attributes.get('role'), 'dialog');
  f.elements.get('message-accept').listeners.get('click')(); assert.deepEqual(f.responses, [true]);
});
