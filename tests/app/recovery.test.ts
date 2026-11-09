import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseRecovery, saveRecoveryCopies } from '../../src/app/recovery';
import { exampleDoc } from '../../src/app/state';

const NOW = Date.parse('2026-09-17T16:00:00.000Z');
const OLD = '2026-09-17T14:00:00.000Z';
const NEW = '2026-09-17T15:00:00.000Z';
const ID = 'cbf2c291-cb4c-4515-b90a-f0dd5e7c6448';
const draft = (name: string, updated: unknown = NEW, projectId: unknown = ID) => ({ doc: { ...exampleDoc(), name }, updated, projectId });

test('missing recovery drafts produce no spurious errors', () => {
  assert.deepEqual(chooseRecovery({ doc: null }, null, NOW), { recovery: null, alternatives: [], warnings: [] });
  assert.equal(chooseRecovery(undefined, 'null', NOW).recovery, null);
});
test('recovery preserves the edited base revision and never invents one for legacy snapshots',()=>{
  const baseRevision='a'.repeat(64),snapshot={...draft('带基础修订'),baseRevision};
  assert.equal(chooseRecovery(snapshot,null,NOW).recovery?.baseRevision,baseRevision);
  assert.equal(chooseRecovery(draft('旧版无修订'),null,NOW).recovery?.baseRevision,undefined);
  assert.equal(chooseRecovery({...snapshot,baseRevision:'not-a-revision'},null,NOW).recovery?.baseRevision,undefined);
});

test('after disconnected editing, a newer browser draft beats stale server recovery', () => {
  const server = draft('磁盘旧稿', OLD), browser = draft('断网时继续编辑的新稿', NEW);
  const result = chooseRecovery(server, JSON.stringify(browser), NOW);
  assert.equal(result.recovery?.doc.name, '断网时继续编辑的新稿');
  assert.equal(result.recovery?.source, 'browser');
  assert.equal(result.recovery?.projectId, ID);
  assert.equal(result.alternatives[0].doc.name, '磁盘旧稿');
  assert.ok(result.warnings.some(s => s.includes('另一份仍然保留')));
});

test('newer disk draft wins when its timestamp is trustworthy', () => {
  const result = chooseRecovery(draft('磁盘新稿', NEW), draft('浏览器旧稿', OLD), NOW);
  assert.equal(result.recovery?.source, 'server');
  assert.equal(result.alternatives[0].source, 'browser');
});

test('invalid JSON/documents are rejected while another valid draft remains recoverable', () => {
  const server = draft('有效稿');
  const result = chooseRecovery(server, '{broken JSON', NOW);
  assert.equal(result.recovery?.doc.name, '有效稿');
  assert.match(result.warnings[0], /JSON/);
  const invalid = draft('无效坐标'); invalid.doc.segments[0].a[0] = Infinity;
  assert.equal(chooseRecovery(invalid, server, NOW).recovery?.source, 'browser');
  assert.equal(chooseRecovery({}, { doc: { name: '破损' } }, NOW).recovery, null);
});

test('identical documents are deduplicated without mutating caller-owned snapshots', () => {
  const server = draft('同一稿', OLD), browser = { ...structuredClone(server), updated: NEW };
  const before = structuredClone(browser);
  const result = chooseRecovery(server, browser, NOW);
  assert.equal(result.recovery?.source, 'browser');
  assert.deepEqual(result.alternatives, []);
  result.recovery!.doc.name = '隔离的副本';
  assert.deepEqual(browser, before);
});

test('missing, malformed, impossible and far-future dates do not discard valid content or outrank real dates', () => {
  for (const date of [undefined, null, '', 12345, 'tomorrow', '2026-02-30T10:00:00Z', '2026-09-16T24:00:00Z', '2035-01-01T00:00:00Z']) {
    const result = chooseRecovery({ ...draft('日期异常稿'), updated: date }, draft('正常日期稿', NEW), NOW);
    assert.equal(result.recovery?.doc.name, '正常日期稿');
    assert.equal(result.alternatives[0]?.doc.name, '日期异常稿');
    assert.equal(result.alternatives[0]?.updated, undefined);
    assert.ok(result.warnings.some(s => s.includes('时间')));
  }
});

test('if dates are both uncertain or tied, retain both and disclose browser preference', () => {
  const uncertain = chooseRecovery(draft('磁盘稿', 'bad'), draft('浏览器稿', 'bad'), NOW);
  assert.equal(uncertain.recovery?.source, 'browser');
  assert.equal(uncertain.alternatives.length, 1);
  assert.match(uncertain.warnings.at(-1)!, /时间不能完全确定先后/);
  const tied = chooseRecovery(draft('磁盘稿', NEW), draft('浏览器稿', NEW), NOW);
  assert.equal(tied.recovery?.source, 'browser');
  assert.equal(tied.alternatives.length, 1);
});

test('invalid project IDs are removed rather than allowing accidental overwrite', () => {
  const result = chooseRecovery(null, draft('外来副本', NEW, '../other-project'), NOW);
  assert.equal(result.recovery?.projectId, undefined);
  assert.match(result.warnings.join(''), /作为新工程/);
});

test('ISO timezone offsets are compared by instant, not lexically', () => {
  const result = chooseRecovery(draft('磁盘稿', '2026-09-17T22:00:00+08:00'), draft('浏览器稿', NEW), NOW);
  assert.equal(result.recovery?.source, 'browser');
  assert.equal(result.alternatives[0].updated, OLD);
});

test('valid draft survives alone even when its clock metadata is unusable', () => {
  const result = chooseRecovery(draft('唯一稿件', 'broken'), null, NOW);
  assert.equal(result.recovery?.doc.name, '唯一稿件');
  assert.equal(result.recovery?.updated, undefined);
});

test('browser quota exhaustion waits for the durable write and does not report a failed recovery when disk succeeds', async () => {
  let finish!: () => void, settled = false, diskAttempts = 0;
  const durable = new Promise<void>(resolve => { finish = resolve; });
  const pending = saveRecoveryCopies({
    browser: () => { throw new DOMException('quota', 'QuotaExceededError'); },
    disk: async () => { diskAttempts++; await durable; },
  }).then(result => { settled = true; return result; });
  await Promise.resolve();
  assert.equal(diskAttempts, 1);
  assert.equal(settled, false, 'do not claim success or failure while the disk write is pending');
  finish();
  assert.deepEqual(await pending, { browserSaved: false, diskSaved: true, warning: null });
});

test('storage access being denied is not misreported as a full project disk', async () => {
  const result = await saveRecoveryCopies({
    browser: () => { throw new DOMException('access denied', 'SecurityError'); },
    disk: async () => undefined,
  });
  assert.equal(result.diskSaved, true);
  assert.equal(result.warning, null);
});

test('new complete disk recovery survives browser quota failure without destroying an older browser draft', async () => {
  let browser = JSON.stringify(draft('旧缓存', OLD)), disk: unknown = draft('旧磁盘', OLD);
  const oldBrowser = browser, latest = draft('新大工程', NEW);
  const result = await saveRecoveryCopies({
    browser: () => { throw new DOMException('quota', 'QuotaExceededError'); },
    disk: async () => { disk = structuredClone(latest); },
  });
  assert.equal(browser, oldBrowser);
  const reopened = chooseRecovery(disk, browser, NOW);
  assert.deepEqual(reopened.recovery?.doc, latest.doc);
  assert.equal(reopened.recovery?.source, 'server');
  assert.equal(reopened.alternatives[0]?.doc.name, '旧缓存');
  assert.equal(result.warning, null);
});

test('disk failure keeps the newer browser recovery and accurately reports the fallback', async () => {
  const disk = draft('磁盘旧稿', OLD), latest = draft('暂存新稿', NEW);
  let browser: string | null = null;
  const result = await saveRecoveryCopies({
    browser: () => { browser = JSON.stringify(latest); },
    disk: async () => { throw new Error('disk write failed'); },
  });
  assert.equal(result.diskSaved, false);
  assert.equal(result.browserSaved, true);
  assert.match(result.warning!, /仅写入临时缓存/);
  assert.equal(chooseRecovery(disk, browser, NOW).recovery?.doc.name, latest.doc.name);
});

test('simultaneous browser and disk failures do not invent a saved recovery', async () => {
  const result = await saveRecoveryCopies({
    browser: () => { throw new DOMException('quota', 'QuotaExceededError'); },
    disk: async () => { throw new Error('disk write failed'); },
  });
  assert.deepEqual(result, { browserSaved: false, diskSaved: false, warning: '自动恢复副本未能保存，请及时手动保存或导出工程。' });
});

test('offline recovery distinguishes a surviving temporary copy from total failure', async () => {
  const cached = await saveRecoveryCopies({ browser: () => undefined });
  assert.equal(cached.browserSaved, true);
  assert.equal(cached.diskSaved, false);
  assert.match(cached.warning!, /仅写入临时缓存/);
  const failed = await saveRecoveryCopies({ browser: () => { throw new DOMException('quota', 'QuotaExceededError'); } });
  assert.equal(failed.browserSaved, false);
  assert.equal(failed.diskSaved, false);
  assert.match(failed.warning!, /未能保存/);
});

test('both successful recovery copies produce no warning', async () => {
  assert.deepEqual(await saveRecoveryCopies({ browser: () => undefined, disk: async () => undefined }), {
    browserSaved: true, diskSaved: true, warning: null,
  });
});
