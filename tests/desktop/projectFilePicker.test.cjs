const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { registerProjectFilePicker } = require('../../desktop/projectFilePicker.cjs');

const ORIGIN = 'http://127.0.0.1:54321';

function fixture(select) {
  const calls = [], focus = [], mainFrame = { url: `${ORIGIN}/` };
  const owner = {
    webContents: { mainFrame, focus: () => focus.push('renderer-focus') },
    isDestroyed: () => false,
    isVisible: () => true,
    isMinimized: () => false,
    blur: () => focus.push('blur'),
    focus: () => focus.push('focus'),
  };
  let handler, currentOwner = owner;
  registerProjectFilePicker({
    ipcMain: { handle(channel, callback) { assert.equal(channel, 'desktop:open-project'); handler = callback; } },
    dialog: { async showOpenDialog(window, options) { assert.equal(window, owner); calls.push(options); return select(options, owner); } },
    getWindow: () => currentOwner,
    origin: ORIGIN,
  });
  const event = { sender: owner.webContents, senderFrame: mainFrame };
  return { owner, calls, focus, event, handler, setOwner: value => { currentOwner = value; } };
}

async function temporaryDirectory(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'zhezhi-picker-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test('native picker reopens three times and returns only basename and exact binary bytes', async t => {
  const directory = await temporaryDirectory(t), selected = path.join(directory, '中文工程.ori');
  const expected = Buffer.from([0, 255, 128, 13, 10, 42]);
  await fs.writeFile(selected, expected);
  const f = fixture(async () => ({ canceled: false, filePaths: [selected] }));
  for (let i = 0; i < 3; i++) {
    const result = await f.handler(f.event);
    assert.deepEqual(Object.keys(result).sort(), ['bytes', 'name']);
    assert.equal(result.name, '中文工程.ori');
    assert.ok(result.bytes instanceof Uint8Array);
    assert.deepEqual(Buffer.from(result.bytes), expected);
    assert.equal(result.bytes.buffer.byteLength, expected.length);
  }
  assert.equal(f.calls.length, 3);
  assert.deepEqual(f.calls[0], {
    title: '打开折痕工程', properties: ['openFile'],
    filters: [{ name: '折痕工程文件', extensions: ['json', 'fold', 'cp', 'opx', 'ori', 'orh'] }],
  });
  assert.deepEqual(f.focus, Array.from({ length: 3 }, () => ['blur', 'focus', 'renderer-focus']).flat());
});

test('cancel and native-dialog failure release the picker before another open', async t => {
  const directory = await temporaryDirectory(t), selected = path.join(directory, '步骤.diagram.json');
  await fs.writeFile(selected, '{}');
  let attempt = 0;
  const f = fixture(async () => {
    attempt++;
    if (attempt === 1) return { canceled: true, filePaths: [] };
    if (attempt === 2) throw new Error('native failure');
    return { canceled: false, filePaths: [selected] };
  });
  assert.equal(await f.handler(f.event, 'diagram'), null);
  await assert.rejects(f.handler(f.event, 'diagram'), /native failure/);
  assert.equal((await f.handler(f.event, 'diagram')).name, '步骤.diagram.json');
  assert.equal(f.calls.length, 3);
  assert.deepEqual(f.calls[2].filters, [{ name: '折序工程文件', extensions: ['json'] }]);
});

test('read failure is recognizable in Chinese and releases the picker', async t => {
  const directory = await temporaryDirectory(t), selected = path.join(directory, 'missing.json');
  const f = fixture(async () => ({ canceled: false, filePaths: [selected] }));
  await assert.rejects(f.handler(f.event), /无法读取所选工程文件/);
  await fs.writeFile(selected, '{}');
  assert.equal((await f.handler(f.event)).name, 'missing.json');
  assert.equal(f.calls.length, 2);
});

test('foreign senders, child frames, invalid origins and invalid kinds never open or focus a window', async () => {
  const f = fixture(async () => ({ canceled: true, filePaths: [] }));
  for (const event of [
    { sender: {}, senderFrame: f.event.senderFrame },
    { sender: f.event.sender, senderFrame: { url: `${ORIGIN}/` } },
    { sender: f.event.sender, senderFrame: null },
  ]) await assert.rejects(f.handler(event), /不允许/);
  for (const url of ['https://external.example/', `${ORIGIN}.evil.example/`, 'not a URL']) {
    f.event.senderFrame.url = url;
    await assert.rejects(f.handler(f.event), /不允许/);
  }
  f.event.senderFrame.url = `${ORIGIN}/`;
  for (const kind of [null, '', 'other', {}, { path: '/arbitrary/file' }]) {
    await assert.rejects(f.handler(f.event, kind), /不支持/);
  }
  f.owner.isDestroyed = () => true;
  await assert.rejects(f.handler(f.event), /不允许/);
  f.setOwner(null);
  await assert.rejects(f.handler(f.event), /不允许/);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.focus, []);
});

test('a second request returns cancellation while the native picker is busy', async () => {
  let release;
  const f = fixture(() => new Promise(resolve => { release = resolve; }));
  const first = f.handler(f.event);
  assert.equal(await f.handler(f.event, 'diagram'), null);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.focus, []);
  release({ canceled: true, filePaths: [] });
  assert.equal(await first, null);
  const third = f.handler(f.event);
  assert.equal(f.calls.length, 2);
  release({ canceled: true, filePaths: [] });
  assert.equal(await third, null);
});

test('accepts files above the former limits and still rejects directories', async t => {
  const directory = await temporaryDirectory(t);
  for (const [kind, limit] of [['crease', 32 * 1024 * 1024], ['diagram', 8_000_000]]) {
    const selected = path.join(directory, `${kind}.json`);
    const handle = await fs.open(selected, 'w');
    await handle.truncate(limit + 1);
    await handle.close();
    let filePath = selected;
    const f = fixture(async () => ({ canceled: false, filePaths: [filePath] }));
    const result=await f.handler(f.event,kind);
    assert.equal(result.bytes.byteLength,limit+1);
    assert.equal(result.bytes.buffer.byteLength,limit+1);
    filePath = directory;
    // Windows can reject opening a directory before stat(), which is also a read failure.
    await assert.rejects(f.handler(f.event, kind), /不是普通文件|无法读取/);
    await fs.writeFile(selected, 'valid');
    filePath = selected;
    assert.equal(Buffer.from((await f.handler(f.event, kind)).bytes).toString(), 'valid');
    assert.equal(f.calls.length, 3);
  }
});

test('complete artwork files larger than the old crease limit reach the renderer intact',async t=>{
  const directory=await temporaryDirectory(t),selected=path.join(directory,'完整作品.zhezhi-artwork.json');
  const content=Buffer.alloc(16*1024*1024+1,32);content[0]=123;content[content.length-1]=125;
  await fs.writeFile(selected,content);
  const f=fixture(async()=>({canceled:false,filePaths:[selected]}));
  const result=await f.handler(f.event,'crease');assert.deepEqual(Buffer.from(result.bytes),content);
});

test('native dialog completion focuses only a visible, active and surviving owner', async t => {
  const directory = await temporaryDirectory(t), selected = path.join(directory, 'project.json');
  await fs.writeFile(selected, '{}');
  for (const state of ['hidden', 'minimized', 'destroyed', 'navigated']) {
    const f = fixture(async (_options, owner) => {
      if (state === 'hidden') owner.isVisible = () => false;
      if (state === 'minimized') owner.isMinimized = () => true;
      if (state === 'destroyed') owner.isDestroyed = () => true;
      if (state === 'navigated') owner.webContents.mainFrame.url = 'https://external.example/';
      return { canceled: false, filePaths: [selected] };
    });
    const result = await f.handler(f.event);
    if (state === 'destroyed' || state === 'navigated') assert.equal(result, null);
    else assert.equal(result.name, 'project.json');
    assert.deepEqual(f.focus, []);
  }
});

test('file growth after stat reads only the original snapshot and is rejected', async t => {
  const directory = await temporaryDirectory(t), selected = path.join(directory, 'growing.json');
  const limit = 8_000_000;
  await fs.writeFile(selected, Buffer.alloc(limit));
  const open = fs.open;
  let bytesRead = 0;
  t.mock.method(fs, 'open', async (...args) => {
    const handle = await open(...args);
    const stat = handle.stat.bind(handle), read = handle.read.bind(handle);
    handle.stat = async () => {
      const snapshot = await stat();
      await fs.appendFile(selected, Buffer.alloc(64 * 1024));
      return snapshot;
    };
    handle.read = async (...readArgs) => {
      const result = await read(...readArgs);
      bytesRead += result.bytesRead;
      return result;
    };
    return handle;
  });
  const f = fixture(async () => ({ canceled: false, filePaths: [selected] }));
  await assert.rejects(f.handler(f.event, 'diagram'), /读取期间发生变化/);
  assert.equal(bytesRead, limit);
});

test('file truncation during reading is rejected and the picker can reopen', async t => {
  const directory=await temporaryDirectory(t),selected=path.join(directory,'shrinking.json');
  await fs.writeFile(selected,Buffer.alloc(128*1024));
  const open=fs.open;
  const mocked=t.mock.method(fs,'open',async(...args)=>{
    const handle=await open(...args),stat=handle.stat.bind(handle);
    handle.stat=async()=>{const snapshot=await stat();await fs.truncate(selected,0);return snapshot;};
    return handle;
  });
  const f=fixture(async()=>({canceled:false,filePaths:[selected]}));
  await assert.rejects(f.handler(f.event),/读取期间发生变化/);
  mocked.mock.restore();await fs.writeFile(selected,'{}');
  assert.equal(Buffer.from((await f.handler(f.event)).bytes).toString(),'{}');
});

test('an owner closed during reading cannot receive file content', async t => {
  const directory = await temporaryDirectory(t), selected = path.join(directory, 'closing.json');
  await fs.writeFile(selected, '{}');
  const f = fixture(async () => ({ canceled: false, filePaths: [selected] }));
  const open = fs.open;
  t.mock.method(fs, 'open', async (...args) => {
    const handle = await open(...args);
    f.owner.isDestroyed = () => true;
    return handle;
  });
  assert.equal(await f.handler(f.event), null);
});
