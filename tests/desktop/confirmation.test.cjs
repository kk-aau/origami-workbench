const {test} = require('node:test');
const assert = require('node:assert/strict');
const {registerConfirmation} = require('../../desktop/confirmation.cjs');
const {registerUnresponsiveRecovery} = require('../../desktop/confirmation.cjs');
const {EventEmitter} = require('node:events');
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture(answer = Promise.resolve(true)) {
  const calls = [], mainFrame = {url: 'http://127.0.0.1:54321/'};
  const owner = {webContents: {mainFrame}, isDestroyed: () => false};
  let handler, currentOwner = owner;
  registerConfirmation({
    ipcMain: {on(channel, callback) { assert.equal(channel, 'desktop:confirm'); handler = callback; }},
    getWindow: () => currentOwner, origin: 'http://127.0.0.1:54321',
    messages: {confirm(window, options) { assert.equal(window, owner); calls.push(options); return typeof answer === 'function' ? answer() : answer; }},
  });
  const replies = [], event = {sender: owner.webContents, senderFrame: mainFrame};
  Object.defineProperty(event, 'returnValue', {configurable: true, get: () => replies.at(-1), set: value => replies.push(value)});
  return {owner, calls, handler, event, replies, setOwner: value => { currentOwner = value; }};
}

test('sync confirmation replies once only after the independent message window answers', async () => {
  let finish;
  const f = fixture(new Promise(resolve => { finish = resolve; }));
  f.handler(f.event, '是否替换当前工程？');
  assert.deepEqual(f.replies, []);
  assert.deepEqual(f.calls, [{title: '确认操作', message: '是否替换当前工程？', cancelLabel: '取消', confirmLabel: '继续'}]);
  finish(true); await flush(); assert.deepEqual(f.replies, [true]);
});

test('only a literal true result approves; cancellations, rejections and throws reply false', async () => {
  for (const answer of [false, 1, undefined, () => Promise.reject(Error('window failed')), () => { throw Error('construction failed'); }]) {
    const f = fixture(() => typeof answer === 'function' ? answer() : answer);
    f.handler(f.event, 'replace'); await flush(); assert.deepEqual(f.replies, [false]);
  }
});

test('foreign renderer, child frame, invalid origin and invalid text never create a message window', () => {
  const f = fixture();
  for (const event of [{sender: {}, senderFrame: f.event.senderFrame}, {sender: f.event.sender, senderFrame: {url: f.event.senderFrame.url}}, {sender: f.event.sender, senderFrame: null}]) {
    f.handler(event, 'replace'); assert.equal(event.returnValue, false);
  }
  for (const message of [null, {}, '', ' ', 'x'.repeat(4097)]) { f.handler(f.event, message); assert.equal(f.event.returnValue, false); }
  for (const url of ['https://external.example/', 'http://127.0.0.1:54321.evil.example/', 'invalid']) {
    f.event.senderFrame.url = url; f.handler(f.event, 'replace'); assert.equal(f.event.returnValue, false);
  }
  assert.deepEqual(f.calls, []);
});

test('an owner destroyed, replaced or navigated while waiting cannot approve the original call', async () => {
  for (const change of [f => { f.owner.isDestroyed = () => true; }, f => f.setOwner(null), f => { f.event.senderFrame.url = 'https://external.example/'; }]) {
    let finish;
    const f = fixture(new Promise(resolve => { finish = resolve; }));
    f.handler(f.event, 'replace'); change(f); finish(true); await flush(); assert.deepEqual(f.replies, [false]);
  }
});

test('a renderer disappearing before the reply does not cause an uncaught exception', async () => {
  const f = fixture(); Object.defineProperty(f.event, 'returnValue', {set() { throw Error('gone'); }});
  f.handler(f.event, 'replace'); await flush();
});

test('an unresponsive renderer defaults to waiting, and a later explicit close can request termination', async () => {
  const owner = new EventEmitter(), calls = [], events = [];
  let destroyed = false, response = 0;
  Object.assign(owner, {isDestroyed: () => destroyed, destroy: () => { destroyed = true; }});
  const remove = registerUnresponsiveRecovery({window: owner, onEvent: event => events.push(event), messages: {hasPending: () => false}, dialog: {async showMessageBox(parent, options) { assert.equal(parent, owner); calls.push(options); return {response}; }}});
  owner.emit('unresponsive'); await flush();
  assert.equal(destroyed, false);
  assert.deepEqual(calls[0].buttons, ['继续等待', '结束窗口']);
  assert.equal(calls[0].defaultId, 0); assert.equal(calls[0].cancelId, 0);
  let prevented = false;
  response = 1; owner.emit('close', {preventDefault() { prevented = true; }}); await flush();
  assert.equal(prevented, true, 'an unresponsive close must wait for the explicit native answer');
  assert.equal(destroyed, true); assert.equal(calls.length, 2);
  assert.deepEqual(events.map(event => event.action), ['desktop.unresponsive', 'desktop.close.wait', 'desktop.close.force']);
  assert.ok(events.every(event => Object.keys(event.details).every(key => ['reason', 'result', 'status'].includes(key))));
  remove(); assert.equal(owner.listenerCount('unresponsive'), 0); assert.equal(owner.listenerCount('close'), 0);
});

test('normal close and a synchronous confirmation do not trigger the unresponsive fallback', async () => {
  const owner = new EventEmitter(); let confirmations = 0;
  Object.assign(owner, {isDestroyed: () => false, destroy: () => assert.fail('No discard was authorized')});
  const remove = registerUnresponsiveRecovery({window: owner, messages: {hasPending: () => true}, dialog: {async showMessageBox() { confirmations++; return {response: 1}; }}});
  owner.emit('close'); owner.emit('unresponsive'); await flush();
  assert.equal(confirmations, 0); remove();
});

test('unresponsive recovery coalesces requests, stops after responsiveness returns and never discards on dialog failure', async () => {
  const owner = new EventEmitter(); let resolve, calls = 0;
  Object.assign(owner, {isDestroyed: () => false, destroy: () => assert.fail('No discard was authorized')});
  const remove = registerUnresponsiveRecovery({window: owner, dialog: {showMessageBox() { calls++; return new Promise(answer => { resolve = answer; }); }}});
  owner.emit('unresponsive'); owner.emit('close'); owner.emit('unresponsive');
  assert.equal(calls, 1);
  resolve({response: 0}); await flush(); owner.emit('responsive'); owner.emit('close'); await flush();
  assert.equal(calls, 1); remove();
  const removeFailure = registerUnresponsiveRecovery({window: owner, onEvent() { throw Error('logging failed'); }, dialog: {async showMessageBox() { throw Error('native failure'); }}});
  owner.emit('unresponsive'); await flush(); removeFailure();
});
