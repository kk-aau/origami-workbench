import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startFlatFold, startFlatLayerReanalysis } from '../../src/core/workerClient';
import { computeFlatFold } from '../../src/core/flatFold';
import { blankDoc } from '../../src/app/state';
import { moveFoldedVertices } from '../../src/app/foldedVertexEdit';
import type { Doc, FlatWorkerRequest, FlatFoldResult, FoldGraph } from '../../src/core/types';
import type {FlatComputationProgress} from '../../src/core/flatComputationProgress';

class MockWorker {
  static latest: MockWorker;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  terminated = false;
  constructor() { MockWorker.latest = this; }
  request?: FlatWorkerRequest;
  // Match the browser boundary: mutations after postMessage cannot reach a worker.
  postMessage(request: FlatWorkerRequest) { this.request = structuredClone(request); }
  terminate() { this.terminated = true; }
}
const doc: Doc = { name: 'test', paper: { width: 100, height: 100 }, segments: [] };
const geometry: FlatFoldResult = { geometry: { status: 'ready', message: 'ready', vertices: [[0, 0]], faces: [] }, layers: { status: 'unknown', message: 'pending' }, warnings: [] };

test('terminal worker results retain measured time across model copies and reanalysis clears the previous duration',async t=>{
 const prior=globalThis.Worker;globalThis.Worker=MockWorker as unknown as typeof Worker;
 let now=100;t.mock.method(performance,'now',()=>now);
 try{
  const task=startFlatFold(doc),worker=MockWorker.latest;
  now=1475;worker.onmessage?.({data:{type:'result',result:structuredClone(geometry)}});
  const result=await task.promise;assert.equal(result.computationTimeMs,1375);
  now=9000;assert.equal(structuredClone(result).computationTimeMs,1375,'finished duration stays frozen');
  const reanalysis=startFlatLayerReanalysis(result),request=MockWorker.latest.request;
  assert.ok(request&&'kind'in request);assert.equal(request.result.computationTimeMs,undefined);
  now=9200;reanalysis.cancel();assert.equal((await reanalysis.promise).computationTimeMs,200);
  assert.equal(result.computationTimeMs,1375,'reanalysis does not rewrite the old result');
  const failed=startFlatFold(doc);now=9325;MockWorker.latest.onerror?.({message:'test failure'});
  assert.equal((await failed.promise).computationTimeMs,125,'failure also keeps actual elapsed time');
 }finally{globalThis.Worker=prior;}
});

function editedModel() {
  const result = moveFoldedVertices(computeFlatFold(blankDoc('修改模型', 100, 100)), { group: [0], selected: [0] }, [-20, -10]);
  result.layers = { status: 'solved', message: 'obsolete', faceOrder: [0], solutionCount: 1 };
  result.geometry.graph!.faceOrders = [[0, 1, 1]];
  return result;
}

test('worker requests preserve candidate index for both original and edited model tasks',async()=>{
  const prior=globalThis.Worker;globalThis.Worker=MockWorker as unknown as typeof Worker;
  try{
    const original=startFlatFold(doc,{startingFace:1,solutionIndex:3,onProgress:()=>{}});
    assert.deepEqual(MockWorker.latest.request,{doc,options:{startingFace:1,solutionIndex:3}});original.cancel();await original.promise;
    const input=editedModel(),task=startFlatLayerReanalysis(input,{solutionIndex:2,onProgress:()=>{}}),request=MockWorker.latest.request;
    assert.ok(request&&'kind' in request);assert.deepEqual(request.options,{solutionIndex:2});
    task.cancel();const result=await task.promise;
    assert.equal(result.layers.status,'cancelled');assert.equal(result.layers.solutionIndex,undefined);assert.deepEqual(result.geometry.vertices,input.geometry.vertices);
  }finally{globalThis.Worker=prior;}
});

test('diagram worker requests retain F mark semantics through calculation and layer reanalysis',async()=>{
  const prior=globalThis.Worker;globalThis.Worker=MockWorker as unknown as typeof Worker;
  try{
    const source=blankDoc('worker预折标记',100,100);source.segments.push({id:'mark',a:[0,40],b:[100,40],assignment:'F',angle:0});
    const task=startFlatFold(source,{flatCreases:'marks',startingFace:0}),worker=MockWorker.latest,request=worker.request;
    assert.ok(request&&!('kind' in request));assert.equal(request.options!.flatCreases,'marks');
    const calculated=computeFlatFold(request.doc,undefined,request.options);worker.onmessage?.({data:{type:'result',result:calculated}});
    const result=await task.promise;assert.equal(result.geometry.faces.length,1);assert.equal(result.geometry.graph!.zhezhi_flatCreases,'marks');assert.equal(result.layers.status,'solved');
    const reanalysis=startFlatLayerReanalysis(result),updated=MockWorker.latest;assert.ok(updated.request&&'kind' in updated.request);assert.equal(updated.request.result.geometry.graph!.zhezhi_flatCreases,'marks');
    reanalysis.cancel();await reanalysis.promise;assert.equal(computeFlatFold(source).geometry.faces.length,2,'ordinary calculation retains its existing F partition');
  }finally{globalThis.Worker=prior;}
});

test('reanalysis snapshots edited geometry and cancellation before any message retains it without stale orders', async () => {
  const prior = globalThis.Worker; globalThis.Worker = MockWorker as unknown as typeof Worker;
  try {
    const input = editedModel(), before = structuredClone(input);
    const task = startFlatLayerReanalysis(input, { onProgress: () => assert.fail('late progress') }), worker = MockWorker.latest;
    assert.ok(worker.request && 'kind' in worker.request);
    assert.equal(worker.request.kind, 'layers');
    assert.notEqual(worker.request.result.geometry.vertices, input.geometry.vertices);
    assert.equal(worker.request.result.layers.status, 'unknown');
    assert.equal(worker.request.result.geometry.graph!.faceOrders, undefined);
    task.cancel();
    worker.onmessage?.({ data: { type: 'geometry', result: input } });
    worker.onmessage?.({ data: { type: 'result', result: input } });
    const result = await task.promise;
    assert.equal(result.layers.status, 'cancelled'); assert.equal(result.layers.faceOrder, undefined);
    assert.equal(result.geometry.status, 'ready'); assert.equal(result.geometry.modified, true);
    assert.deepEqual(result.geometry.vertices, before.geometry.vertices);
    assert.deepEqual(input, before); assert.equal(worker.terminated, true);
    input.geometry.vertices[0][0] = 999;
    assert.equal(result.geometry.vertices[0][0], -20);
  } finally { globalThis.Worker = prior; }
});

test('reanalysis timeout before any message preserves the initial edited model', async () => {
  const prior = globalThis.Worker; globalThis.Worker = MockWorker as unknown as typeof Worker;
  try {
    const input = editedModel(), task = startFlatLayerReanalysis(input, { timeoutMs: 10 }), worker = MockWorker.latest;
    const result = await task.promise;
    assert.equal(result.layers.status, 'timeout'); assert.equal(result.layers.solutionCount, undefined);
    assert.deepEqual(result.geometry.vertices, input.geometry.vertices); assert.equal(worker.terminated, true);
  } finally { globalThis.Worker = prior; }
});

test('reanalysis worker startup and runtime failures both retain edited geometry', async () => {
  const prior = globalThis.Worker;
  try {
    const input = editedModel();
    globalThis.Worker = class { constructor() { throw new Error('startup failed'); } } as unknown as typeof Worker;
    const failed = await startFlatLayerReanalysis(input).promise;
    assert.equal(failed.layers.status, 'error'); assert.match(failed.layers.message, /startup failed/);
    assert.deepEqual(failed.geometry.vertices, input.geometry.vertices); assert.equal(failed.layers.faceOrder, undefined);
    globalThis.Worker = MockWorker as unknown as typeof Worker;
    const task = startFlatLayerReanalysis(input), worker = MockWorker.latest;
    worker.onerror?.({ message: 'runtime failed' });
    const crashed = await task.promise;
    assert.equal(crashed.layers.status, 'error'); assert.match(crashed.layers.message, /runtime failed/);
    assert.deepEqual(crashed.geometry.vertices, input.geometry.vertices); assert.equal(worker.terminated, true);
  } finally { globalThis.Worker = prior; }
});

test('worker module dispatches actual edited-geometry reanalysis without recreating the source fold', async () => {
  const scope = globalThis as unknown as { onmessage?: (event: { data: FlatWorkerRequest }) => void; postMessage?: (data: { type: string; result: FlatFoldResult }) => void };
  const oldHandler = scope.onmessage, oldPost = scope.postMessage;
  try {
    const messages: { type: string; result: FlatFoldResult }[] = [];
    scope.postMessage = data => messages.push(data);
    await import('../../src/workers/flatFold.worker');
    const input = editedModel(), before = structuredClone(input);
    scope.onmessage!({ data: { kind: 'layers', result: input } });
    const terminal=messages.filter(m=>m.type==='result');
    assert.ok(messages.some(m=>m.type==='computation-progress'));
    assert.equal(terminal.length, 1);
    assert.equal(terminal[0].result.layers.status, 'solved');
    assert.deepEqual(terminal[0].result.geometry.vertices, before.geometry.vertices);
    assert.equal(terminal[0].result.geometry.modified, true); assert.deepEqual(input, before);
    messages.length = 0;
    scope.onmessage!({ data: { doc: blankDoc('原路径', 100, 100) } });
    const originalMessages=messages.filter(m=>m.type!=='computation-progress');
    assert.deepEqual(originalMessages.map(m => m.type), ['geometry', 'result']);
    assert.equal(originalMessages[1].result.layers.status, 'solved');
    const source=blankDoc('后台准备',100,100);source.segments.push({id:'crease',a:[50,0],b:[50,100],assignment:'M',angle:-180});
    const sourceMessages:unknown[]=[];scope.postMessage=data=>sourceMessages.push(structuredClone(data));
    scope.onmessage!({data:{doc:source,includeSource:true}});
    const [prepared,folded,complete]=sourceMessages.filter(m=>(m as {type:string}).type!=='computation-progress') as [{type:string;graph:FoldGraph},{type:string;result:FlatFoldResult},{type:string;result:FlatFoldResult}];
    assert.deepEqual([prepared.type,folded.type,complete.type],['source','geometry','result']);
    assert.equal(prepared.graph.faces_vertices!.length,2);
    assert.notDeepEqual(prepared.graph.vertices_coords,folded.result.geometry.vertices);
    assert.equal(complete.result.layers.status,'solved');
  } finally {
    if (oldHandler === undefined) delete scope.onmessage; else scope.onmessage = oldHandler;
    if (oldPost === undefined) delete scope.postMessage; else scope.postMessage = oldPost;
  }
});

test('phase progress is separate from geometry and stops immediately on cancellation or completion',async()=>{
  const prior=globalThis.Worker;globalThis.Worker=MockWorker as unknown as typeof Worker;
  try{
    for(const end of ['cancel','complete'] as const){
      const received:FlatComputationProgress[]=[],task=startFlatFold(doc,{onComputationProgress:p=>received.push(p),onProgress:()=>assert.fail('phase event is not geometry')}),worker=MockWorker.latest;
      const screening={stage:'gpu-screening',label:'GPU 批量筛选 · CPU 精确复核',completed:12,total:40};
      const search={stage:'search',label:'搜索纸层顺序',detail:'搜索总量尚不确定'};
      worker.onmessage?.({data:{type:'computation-progress',progress:screening}});
      worker.onmessage?.({data:{type:'computation-progress',progress:search}});
      assert.deepEqual(received,[screening,search]);
      assert.deepEqual(worker.request,{doc,options:{startingFace:undefined}},'UI progress callback must not cross the structured clone boundary');
      if(end==='cancel')task.cancel();else worker.onmessage?.({data:{type:'result',result:geometry}});
      await task.promise;assert.equal(worker.terminated,true);
      worker.onmessage?.({data:{type:'computation-progress',progress:{...screening,completed:40}}});
      assert.equal(received.length,2,'settled tasks ignore stale progress');
    }
  }finally{globalThis.Worker=prior;}
});

test('worker request snapshots document and starting face without cloning UI callbacks', async () => {
  const prior = globalThis.Worker;
  globalThis.Worker = MockWorker as unknown as typeof Worker;
  try {
    const task = startFlatFold(doc,{startingFace:1,onProgress:()=>{}}), worker = MockWorker.latest;
    assert.deepEqual(worker.request,{doc,options:{startingFace:1}});
    assert.ok(worker.request && 'doc' in worker.request);
    assert.notEqual(worker.request.doc,doc);
    task.cancel(); await task.promise;
  } finally { globalThis.Worker = prior; }
});

test('worker message snapshots document and constraints synchronously in one copy', async () => {
  const prior=globalThis.Worker,clone=globalThis.structuredClone;
  globalThis.Worker=MockWorker as unknown as typeof Worker;
  try{
    const input=blankDoc('通信快照',100,100),before=clone(input),constraints=[{face:0,side:'white' as const}];
    let copies=0;
    globalThis.structuredClone=(value,options)=>{copies++;return clone(value,options);};
    const task=startFlatFold(input,{constraints}),worker=MockWorker.latest;
    assert.equal(copies,1,'the worker boundary already snapshots the request');
    input.segments[0].a[0]=999;constraints[0].face=9;
    assert.ok(worker.request&&'doc' in worker.request);
    assert.deepEqual(worker.request.doc,before);
    assert.deepEqual(worker.request.options?.constraints,[{face:0,side:'white'}]);
    task.cancel();await task.promise;
  }finally{globalThis.Worker=prior;globalThis.structuredClone=clone;}
});

test('cancellation terminates before copying the preview and completed tasks ignore further cancellation', async () => {
  const prior=globalThis.Worker,clone=globalThis.structuredClone;
  globalThis.Worker=MockWorker as unknown as typeof Worker;
  try{
    const preview=clone(geometry),task=startFlatFold(doc),worker=MockWorker.latest;
    worker.onmessage?.({data:{type:'geometry',result:preview}});
    let copies=0;
    globalThis.structuredClone=(value,options)=>{assert.equal(worker.terminated,true,'stop the solver before copying its result');copies++;return clone(value,options);};
    task.cancel();const result=await task.promise;
    assert.equal(copies,1);assert.equal(result.layers.status,'cancelled');assert.equal(preview.layers.status,'unknown');
    preview.geometry.vertices[0][0]=42;assert.equal(result.geometry.vertices[0][0],0,'cancelled geometry remains an independent snapshot');
    task.cancel();assert.equal(copies,1,'a settled task must not clone again');
    globalThis.structuredClone=clone;
    const completed=startFlatFold(doc),doneWorker=MockWorker.latest;
    doneWorker.onmessage?.({data:{type:'geometry',result:geometry}});
    doneWorker.onmessage?.({data:{type:'result',result:geometry}});
    await completed.promise;
    globalThis.structuredClone=()=>{assert.fail('a completed task must not copy old progress during cancellation');};
    completed.cancel();
  }finally{globalThis.Worker=prior;globalThis.structuredClone=clone;}
});

test('cancel terminates worker and resolves cancelled, late results ignored', async () => {
  const prior = globalThis.Worker;
  globalThis.Worker = MockWorker as unknown as typeof Worker;
  try {
    const task = startFlatFold(doc), worker = MockWorker.latest;
    task.cancel(); worker.onmessage?.({ data: { type: 'result', result: geometry } });
    const result = await task.promise; assert.equal(result.geometry.status, 'cancelled'); assert.equal(result.layers.status, 'cancelled'); assert.equal(worker.terminated, true);
  } finally { globalThis.Worker = prior; }
});
test('timeout preserves completed geometry and reports layer timeout, not no-solution', async () => {
  const prior = globalThis.Worker;
  globalThis.Worker = MockWorker as unknown as typeof Worker;
  try {
    const task = startFlatFold(doc, { timeoutMs: 10 }), worker = MockWorker.latest;
    worker.onmessage?.({ data: { type: 'geometry', result: geometry } });
    const result = await task.promise; assert.equal(result.geometry.status, 'ready'); assert.equal(result.layers.status, 'timeout'); assert.equal(worker.terminated, true);
  } finally { globalThis.Worker = prior; }
});

test('cancel during layer search keeps geometry and ignores a late solved result', async () => {
  const prior = globalThis.Worker;
  globalThis.Worker = MockWorker as unknown as typeof Worker;
  try {
    const progress: FlatFoldResult[] = [];
    const task = startFlatFold(doc, { onProgress: result => progress.push(result) }), worker = MockWorker.latest;
    worker.onmessage?.({ data: { type: 'geometry', result: geometry } });
    task.cancel();
    worker.onmessage?.({ data: { type: 'result', result: { ...geometry, layers: { status: 'solved', message: 'late' } } } });
    const result = await task.promise;
    assert.equal(result.geometry.status, 'ready');
    assert.equal(result.layers.status, 'cancelled');
    assert.equal(worker.terminated, true);
    assert.equal(progress.length, 1);
    assert.equal(geometry.layers.status, 'unknown');
  } finally { globalThis.Worker = prior; }
});

test('source graph progress enables background preparation without publishing callbacks to the worker', async () => {
  const prior=globalThis.Worker;globalThis.Worker=MockWorker as unknown as typeof Worker;
  try{
    const seen:FoldGraph[]=[],counts:number[]=[],graph:FoldGraph={vertices_coords:[],edges_vertices:[],edges_assignment:[],edges_foldAngle:[],faces_vertices:[[]]};
    const task=startFlatFold(doc,{onSource:source=>seen.push(source),timeoutForFaces:count=>{counts.push(count);return 10;}}),worker=MockWorker.latest;
    assert.deepEqual(worker.request,{doc,includeSource:true,options:{startingFace:undefined}});
    worker.onmessage?.({data:{type:'source',graph}});
    assert.deepEqual(seen,[graph]);assert.deepEqual(counts,[1]);
    const result=await task.promise;assert.equal(result.layers.status,'timeout');assert.equal(worker.terminated,true);
    worker.onmessage?.({data:{type:'source',graph}});assert.equal(seen.length,1);
  }finally{globalThis.Worker=prior;}
});
