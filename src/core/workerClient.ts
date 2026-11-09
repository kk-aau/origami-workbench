import { emptyFoldResult } from './flatFold';
import { type Doc, type FlatFoldOptions, type FlatWorkerRequest, type FlatFoldResult, type FoldGraph } from './types';
import {rememberCompletedModelSurface,type ModelOverlapProgress} from '../app/modelOverlapTask';
import type {FlatFoldPublication} from '../app/flatFoldPublication';
import {RegionParallelPoolOwner,type RegionParallelMessage} from './regionParallelProtocol';
import {recordActivity} from '../app/activityLog';
import type {FlatComputationProgress} from './flatComputationProgress';

export interface FlatFoldTask { promise: Promise<FlatFoldResult>; cancel(): void }
// Manual calculations wait for a terminal solver result. Finite deadlines are
// opt-in for callers such as automatic previews; Infinity explicitly disables them.
interface TaskOptions { timeoutMs?: number; onProgress?: (result: FlatFoldResult) => void; onComputationProgress?:(progress:FlatComputationProgress)=>void; onSource?: (graph: FoldGraph) => void; timeoutForFaces?: (faceCount: number) => number }
export function startFlatFold(doc: Doc, options: FlatFoldOptions & TaskOptions = {}): FlatFoldTask {
  return startTask({ doc, ...(options.onSource||options.timeoutForFaces?{includeSource:true}:{}), options: { startingFace: options.startingFace, ...(options.flatCreases===undefined?{}:{flatCreases:options.flatCreases}), ...(options.solutionIndex===undefined?{}:{solutionIndex:options.solutionIndex}), ...(options.constraints===undefined?{}:{constraints:options.constraints}), ...(options.layerAdjustment===undefined?{}:{layerAdjustment:options.layerAdjustment}), ...(options.layerPreferences===undefined?{}:{layerPreferences:options.layerPreferences}), ...(options.relativeConstraints===undefined?{}:{relativeConstraints:options.relativeConstraints}) } }, options);
}
/** Reanalyse the edited model itself, never regenerate it from the source document. */
export function startFlatLayerReanalysis(result: FlatFoldResult, options: TaskOptions & Pick<FlatFoldOptions,'solutionIndex'|'constraints'|'layerAdjustment'|'layerPreferences'|'relativeConstraints'> = {}): FlatFoldTask {
  options={...options,relativeConstraints:options.relativeConstraints??result.layers.relativeConstraints, constraints:options.constraints??result.layers.constraints};
  const pending = structuredClone(result);
  delete pending.computationTimeMs;
  pending.layers = { status: 'unknown', message: '正在重新分析修改后的模型层序。',...(options.layerAdjustment&&result.layers.solutionIndex===undefined&&result.layers.faceOrders?{faceOrders:structuredClone(result.layers.faceOrders)}:{}) };
  if (pending.geometry.graph) {
    for (const key of ['faceOrders', 'faces_normal', 'faces_matrix', 'faces_matrix2']) delete pending.geometry.graph[key];
  }
  return startTask({ kind: 'layers', result: pending, ...(options.solutionIndex===undefined&&options.constraints===undefined&&options.layerAdjustment===undefined&&options.layerPreferences===undefined&&options.relativeConstraints===undefined?{}:{options:{...(options.solutionIndex===undefined?{}:{solutionIndex:options.solutionIndex}), ...(options.constraints===undefined?{}:{constraints:options.constraints}), ...(options.layerAdjustment===undefined?{}:{layerAdjustment:options.layerAdjustment}), ...(options.layerPreferences===undefined?{}:{layerPreferences:options.layerPreferences}), ...(options.relativeConstraints===undefined?{}:{relativeConstraints:options.relativeConstraints})}}) }, options, pending);
}
/** Each task gets its own worker; cancellation terminates a blocking solver, not just a UI flag. */
function startTask(request: FlatWorkerRequest, options: TaskOptions, initial?: FlatFoldResult): FlatFoldTask {
  const started = performance.now();
  let worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false, latest = initial, resolve!: (result: FlatFoldResult) => void;
  const promise = new Promise<FlatFoldResult>(r => { resolve = r; });
  const regionPool=new RegionParallelPoolOwner(()=>new Worker(new URL('../workers/regionTournament.worker.ts',import.meta.url),{type:'module'}),reason=>recordActivity('flat.parallel.failure',{reason},'warning'));
  const settle = () => { if (settled) return false; settled = true; if (timer) clearTimeout(timer); regionPool.disposeAll();worker?.terminate(); return true; };
  const finish = (result: FlatFoldResult) => { if (settle()) {result.computationTimeMs=Math.max(0,performance.now()-started);resolve(result);} };
  const stop = (status: 'timeout' | 'cancelled') => {
    // Stop the solver before copying a potentially large preview. Completed
    // tasks must not copy their last preview when a later UI action cancels them.
    if (!settle()) return;
    const text = status === 'timeout' ? '计算超时，尚未确定是否存在层序解。' : '计算已取消，尚未确定是否存在层序解。';
    const result = latest ? structuredClone(latest) : emptyFoldResult(status, text);
    result.layers = { status, message: text };result.computationTimeMs=Math.max(0,performance.now()-started);resolve(result);
  };
  const scheduleTimeout = (budget: number) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (budget === Infinity) return;
    if (!Number.isFinite(budget) || budget <= 0) throw new Error('计算时限必须为正数，或设为不限时。');
    const remaining = () => budget - (performance.now() - started);
    const arm = () => {
      if (settled) return;
      const delay = remaining();
      if (delay <= 0) { stop('timeout'); return; }
      timer = setTimeout(arm, Math.min(2_147_483_647, delay));
    };
    arm();
  };
  try {
    worker = new Worker(new URL('../workers/flatFold.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<FlatFoldPublication|RegionParallelMessage|{type:'geometry';result:FlatFoldResult}|{type:'progress';progress:ModelOverlapProgress}|{type:'computation-progress';progress:FlatComputationProgress}|{ type: 'source'; graph: FoldGraph }>) => {
      if (settled) return;
      if(event.data.type==='computation-progress'){options.onComputationProgress?.(event.data.progress);return;}
      if(event.data.type==='region-pool-init'){regionPool.start(event.data.pool);return;}
      if(event.data.type==='region-pool-dispose'){regionPool.dispose(event.data.id);return;}
      if(event.data.type==='region-parallel-status'){recordActivity('flat.parallel.'+event.data.status,{count:event.data.workers,...(event.data.reason?{reason:event.data.reason}:{})},event.data.status==='fallback'?'warning':'info');return;}
      if(event.data.type==='progress')return;
      if (event.data.type === 'source') {
        options.onSource?.(event.data.graph);
        if (!settled && options.timeoutMs !== Infinity && options.timeoutForFaces) {
          try { scheduleTimeout(options.timeoutForFaces(event.data.graph.faces_vertices?.length ?? 0)); }
          catch (error) { finish(emptyFoldResult('error', error instanceof Error ? error.message : String(error))); }
        }
      }
      else if (event.data.type === 'geometry') { latest = event.data.result; options.onProgress?.(latest); }
      else {
        const {result,surface}=event.data;
        if(surface)try{rememberCompletedModelSurface(result,surface);}catch(error){
          finish({...result,layers:{status:'error',message:`完整纸面结果校验失败：${error instanceof Error?error.message:String(error)}`}});return;
        }
        finish(result);
      }
    };
    worker.onerror = event => {
      const message = `计算线程异常：${event.message || '未知错误'}`;
      if (latest) finish({ ...latest, layers: { status: 'error', message } });
      else finish(emptyFoldResult('error', message));
    };
    worker.onmessageerror = () => {
      const message = '无法读取计算线程结果，计算已停止；请导出工作日志以便检查。';
      finish(latest ? { ...latest, layers: { status: 'error', message } } : emptyFoldResult('error', message));
    };
    // postMessage synchronously snapshots its data; a preceding clone would
    // duplicate the full document on the UI thread without adding isolation.
    worker.postMessage(request);
    if (!settled) scheduleTimeout(options.timeoutMs ?? Infinity);
  } catch (e) {
    const message = `无法启动独立计算线程：${(e as Error).message}`;
    finish(latest ? { ...latest, layers: { status: 'error', message } } : emptyFoldResult('error', message));
  }
  return { promise, cancel: () => stop('cancelled') };
}
