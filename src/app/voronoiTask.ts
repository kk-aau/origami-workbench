import type { Point } from '../core/types';
import type { VoronoiEdge } from './voronoi';
export interface VoronoiResult { status: 'ready' | 'error' | 'cancelled'; edges: VoronoiEdge[]; error: string }
/** Terminating a per-request worker stops computation, including its inner loops. */
export function startVoronoi(sites: Point[], factory: () => Worker = () => new Worker(new URL('../workers/voronoi.worker.ts', import.meta.url), { type: 'module' })) {
  let worker: Worker | undefined, settled = false, resolve!: (result: VoronoiResult) => void;
  const promise = new Promise<VoronoiResult>(r => { resolve = r; });
  const finish = (result: VoronoiResult) => { if (settled) return; settled = true; worker?.terminate(); resolve(result); };
  try {
    worker = factory();
    worker.onmessage = (event: MessageEvent<VoronoiResult>) => finish(event.data);
    worker.onerror = event => { event.preventDefault(); finish({ status: 'error', edges: [], error: 'Voronoi 计算线程异常：' + (event.message || '未知错误') }); };
    worker.onmessageerror = () => finish({ status: 'error', edges: [], error: '无法读取 Voronoi 计算结果，请清空种子后重试。' });
    worker.postMessage(structuredClone(sites));
  } catch (error) { finish({ status: 'error', edges: [], error: '无法启动 Voronoi 计算：' + (error as Error).message }); }
  return { promise, cancel: () => finish({ status: 'cancelled', edges: [], error: '' }) };
}
