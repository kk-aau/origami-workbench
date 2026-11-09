import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startVoronoi } from '../../src/app/voronoiTask';
import type { Point } from '../../src/core/types';
function mock() {
  const state = { terminated: 0, input: null as Point[] | null };
  const worker = { onmessage: null, onerror: null, onmessageerror: null,
    postMessage: (sites: Point[]) => { state.input = sites; }, terminate: () => { state.terminated++; } } as unknown as Worker;
  return { worker, state, factory: () => worker };
}
test('Voronoi task copies its seed snapshot and terminates after success', async () => {
  const m = mock(), sites: Point[] = [[1, 2], [3, 4]], task = startVoronoi(sites, m.factory);
  sites[0][0] = 90; assert.equal(m.state.input![0][0], 1);
  m.worker.onmessage!({ data: { status: 'ready', edges: [], error: '' } } as MessageEvent);
  assert.equal((await task.promise).status, 'ready'); assert.equal(m.state.terminated, 1);
  task.cancel(); assert.equal(m.state.terminated, 1);
});
test('cancel terminates worker and ignores a late posted result', async () => {
  const m = mock(), task = startVoronoi([[0, 0], [10, 0]], m.factory);
  task.cancel(); task.cancel();
  m.worker.onmessage!({ data: { status: 'ready', edges: [], error: '' } } as MessageEvent);
  assert.equal((await task.promise).status, 'cancelled'); assert.equal(m.state.terminated, 1);
});
test('startup, transport and runtime failures produce actionable errors', async () => {
  assert.match((await startVoronoi([], () => { throw new Error('blocked'); }).promise).error, /无法启动.*blocked/);
  const a = mock(), task = startVoronoi([], a.factory);
  a.worker.onerror!({ message: 'failure', preventDefault() {} } as ErrorEvent);
  assert.match((await task.promise).error, /线程异常.*failure/); assert.equal(a.state.terminated, 1);
  const b = mock(), transfer = startVoronoi([], b.factory);
  b.worker.onmessageerror!({} as MessageEvent);
  assert.match((await transfer.promise).error, /无法读取/); assert.equal(b.state.terminated, 1);
});
