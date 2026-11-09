import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {Worker as NodeWorker} from 'node:worker_threads';
import {RegionTournament,checkCoverageTournaments,type RegionCoverage,type RegionPair} from '../../src/core/regionTournament';
import {buildRegionTransitionSchedule,checkRegionTransitionChunks} from '../../src/core/regionTransitionSchedule';
import {RegionParallelPoolOwner,REGION_CONTROL,failRegionPool,waitForRegionPool,type RegionParallelPoolData} from '../../src/core/regionParallelProtocol';
import {createWorkerRegionCoverageChecker} from '../../src/core/regionParallelChecker';
import {regionParallelWorkerCount,REGION_MAX_WORKERS} from '../../src/core/regionParallelHardware';
import {RegionAllocationError} from '../../src/core/regionAllocation';
import {startFlatFold} from '../../src/core/workerClient';
const C=REGION_CONTROL;
const pairsFor=(n:number):RegionPair[]=>{const result:RegionPair[]=[];for(let a=0;a<n;a++)for(let b=a+1;b<n;b++)result.push([a,b]);return result;};
function coverage(faceCount:number,groups:number[][]):RegionCoverage{return{faceCount,cellCount:groups.length,walk(v){const active=new Set<number>();groups.forEach((ids,cell)=>{const wanted=new Set(ids),removed=[...active].filter(f=>!wanted.has(f)),added=ids.filter(f=>!active.has(f));for(const f of removed)active.delete(f);for(const f of added)active.add(f);v.onTransition?.({removed,added});v.onCell?.(cell,active);});const removed=[...active];active.clear();v.onTransition?.({removed,added:[]});}};}
function pool():RegionParallelPoolData{const schedule=buildRegionTransitionSchedule(coverage(3,[[0,1,2],[]]));return{id:1,workers:2,batchSize:10,schedule,matrix:new Uint32Array(new SharedArrayBuffer(12)),certificate:new SharedArrayBuffer(24),control:new Int32Array(new SharedArrayBuffer((C.slots+2*C.stride)*4)),triangles:new Uint32Array(new SharedArrayBuffer(320))};}

test('partitioned exact schedules match every tournament through five faces, including holes and rollback',()=>{
 for(let n=0;n<=5;n++){
  const pairs=pairsFor(n),ids=Array.from({length:n},(_,i)=>i),groups=[[],ids,ids.filter((_,i)=>i%2===0),ids,[],[...ids].reverse()],source=coverage(n,groups),schedule=buildRegionTransitionSchedule(source,4);
  for(let mask=0;mask<2**pairs.length;mask++){
   const values=Uint8Array.from(pairs,(_,i)=>(mask>>>i&1)+1),expected=checkCoverageTournaments(source,pairs,values),out={top:new Int32Array(groups.length),bottom:new Int32Array(groups.length),depth:new Uint32Array(groups.length)},triangles=[];let cells=0;
   for(let worker=0;worker<3;worker++){
    const state=new RegionTournament(n,pairs,values),result=checkRegionTransitionChunks(schedule,schedule.chunks.filter((_,i)=>i%3===worker),state,out,10000);assert.equal(result.complete,true);cells+=result.cells;triangles.push(...result.triangles);
   }
   assert.equal(cells,groups.length);assert.equal(Boolean(triangles.length),Boolean(expected.triangles.length));
   if(expected.complete&&expected.certificate){assert.deepEqual(out.top,expected.certificate.top);assert.deepEqual(out.bottom,expected.certificate.bottom);assert.deepEqual(out.depth,expected.certificate.depth);}
   for(const {visit,triangle:[a,b,c]} of triangles){assert.ok(groups[visit].includes(a)&&groups[visit].includes(b)&&groups[visit].includes(c));const state=new RegionTournament(n,pairs,values);assert.equal(state.below(a,b),state.below(b,c));assert.notEqual(state.below(a,b),state.below(a,c));}
  }
 }
});

test('schedule rejects incomplete, repeated, mismatched identities and malformed command boundaries',()=>{
 const malformed=(walk:RegionCoverage['walk']):RegionCoverage=>({faceCount:2,cellCount:1,walk});
 assert.throws(()=>buildRegionTransitionSchedule(malformed(v=>{v.onCell?.(0,new Set());v.onCell?.(0,new Set());})),/重复/);
 assert.throws(()=>buildRegionTransitionSchedule(malformed(v=>{v.onCell?.(.5,new Set());})),/索引/);
 assert.throws(()=>buildRegionTransitionSchedule(malformed(v=>{v.onTransition?.({removed:[],added:[0]});v.onCell?.(0,new Set([1]));})),/身份/);
 assert.throws(()=>buildRegionTransitionSchedule(malformed(()=>{})),/完整/);
 const schedule=buildRegionTransitionSchedule(coverage(2,[[0,1],[]]),2),output={top:new Int32Array(2),bottom:new Int32Array(2),depth:new Uint32Array(2)};
 const check=(s:typeof schedule)=>checkRegionTransitionChunks(s,s.chunks,new RegionTournament(2,[[0,1]],[1]),output,10);
 assert.throws(()=>check({...schedule,chunks:[{...schedule.chunks[0],end:2}]}),/头不完整/);
 assert.throws(()=>check({...schedule,chunks:[{...schedule.chunks[0],end:4}]}),/内容不完整/);
 assert.throws(()=>check({...schedule,chunks:[{...schedule.chunks[0],seed:[0,0]}]}),/重复/);
 assert.throws(()=>checkRegionTransitionChunks(schedule,schedule.chunks,new RegionTournament(2,[],[]),output,10),/缺少/);
 assert.throws(()=>buildRegionTransitionSchedule({faceCount:0,cellCount:0x80000000,walk(){}}),/大小/);
});

test('DFS backtracking and nonsequential real cell IDs retain exact coverage across chunk boundaries',()=>{
 const source:RegionCoverage={faceCount:4,cellCount:4,walk(v){const active=new Set<number>();const transition=(removed:number[],added:number[])=>{for(const f of removed)active.delete(f);for(const f of added)active.add(f);v.onTransition?.({removed,added});};transition([],[0,1]);v.onCell?.(2,active);transition([0],[2]);v.onCell?.(0,active);transition([2],[0]);transition([0,1],[3]);v.onCell?.(3,active);transition([3],[]);v.onCell?.(1,active);}};
 const pairs:RegionPair[]=[[0,1],[1,2]],values=[2,1],schedule=buildRegionTransitionSchedule(source,3),output={top:new Int32Array(4),bottom:new Int32Array(4),depth:new Uint32Array(4)};
 assert.deepEqual([...schedule.visitOrder],[1,3,0,2]);
 for(const chunk of schedule.chunks){const checked=checkRegionTransitionChunks(schedule,[chunk],new RegionTournament(4,pairs,values),output,10);assert.equal(checked.complete,true);assert.equal(checked.triangles.length,0);}
 const expected=checkCoverageTournaments(source,pairs,values);assert.ok(expected.complete&&expected.certificate);assert.deepEqual(output.top,expected.certificate.top);assert.deepEqual(output.bottom,expected.certificate.bottom);assert.deepEqual(output.depth,expected.certificate.depth);
});

test('a failure between the version read and condition check cannot lose the wakeup',()=>{
 const data=pool(),load=Atomics.load;let injected=false,waited=false;
 const loadMock=mock.method(Atomics,'load',((array:any,index:number)=>{const value=load(array,index);if(array===data.control&&index===C.signal&&!injected){injected=true;failRegionPool(data.control);}return value;}) as typeof Atomics.load);
 const waitMock=mock.method(Atomics,'wait',()=>{waited=true;throw Error('unexpected wait');});
 try{assert.throws(()=>waitForRegionPool(data,()=>false),/不可用/);assert.equal(waited,false);}finally{loadMock.mock.restore();waitMock.mock.restore();}
});

class StubWorker{onerror:any;onmessage:any;onmessageerror:any;terminated=false;postMessage(){}terminate(){this.terminated=true;}}
test('main-thread pool supervision terminates siblings for hard errors, malformed messages and constructor failures',()=>{
 for(const failure of ['error','messageerror','protocol','constructor']){
  const workers:StubWorker[]=[],data=pool();let notices=0;
  const owner=new RegionParallelPoolOwner(()=>{if(failure==='constructor'&&workers.length===1)throw Error('unavailable');const worker=new StubWorker();workers.push(worker);return worker as unknown as Worker;},()=>notices++);
  owner.start(data);if(failure==='error')workers[0].onerror({message:'OOM'});if(failure==='messageerror')workers[0].onmessageerror({});if(failure==='protocol')workers[0].onmessage({data:{ready:true}});
  assert.equal(Atomics.load(data.control,C.error),1);assert.equal(Atomics.load(data.control,C.cancelled),1);assert.ok(workers.every(w=>w.terminated));assert.equal(notices,1);
  workers[0].onerror({message:'late'});assert.equal(notices,1);owner.disposeAll();
 }
});

test('manual task cancellation terminates solver and all parallel children; late init cannot recreate them',async()=>{
 const Native=globalThis.Worker,workers:StubWorker[]=[];globalThis.Worker=class extends StubWorker{constructor(){super();workers.push(this);}} as unknown as typeof Worker;
 try{const task=startFlatFold({name:'cancel pool',paper:{width:1,height:1},segments:[]}),solver=workers[0],data=pool();solver.onmessage({data:{type:'region-pool-init',pool:data}});assert.equal(workers.length,3);task.cancel();assert.equal((await task.promise).layers.status,'cancelled');assert.ok(workers.every(w=>w.terminated));solver.onmessage({data:{type:'region-pool-init',pool:pool()}});assert.equal(workers.length,3);}finally{globalThis.Worker=Native;}
});

async function runReal(options:{failure?:string;enabled?:boolean;values?:number[][];batchSize?:number;workers?:number;groups?:number[][]}={}){
 const groups=options.groups??[[0,1,2],[1,2,3],[],[0,2,3],[0,1,2,3],[]],workers:NodeWorker[]=[],messages:any[]=[],solver=new NodeWorker(new URL('./helpers/regionParallelNodeWorker.ts',import.meta.url),{workerData:{kind:'solver',faceCount:4,groups,values:options.values??[[2,2,2,2,2,2],[1,1,1,1,1,1]],enabled:options.enabled,batchSize:options.batchSize,workers:options.workers}});
 const owner=new RegionParallelPoolOwner(()=>{const node=new NodeWorker(new URL('./helpers/regionParallelNodeWorker.ts',import.meta.url),{workerData:{kind:'checker',failure:options.failure}});workers.push(node);const shim:any={postMessage:(v:unknown)=>node.postMessage(v),terminate:()=>{void node.terminate();}};node.on('error',error=>shim.onerror?.({message:error.message}));node.on('messageerror',()=>shim.onmessageerror?.({}));node.on('message',data=>shim.onmessage?.({data}));return shim;});
 try{return await new Promise<any>((resolve,reject)=>{solver.on('error',reject);solver.on('message',message=>{messages.push(message);if(message.type==='region-pool-init')owner.start(message.pool);else if(message.type==='region-pool-dispose')owner.dispose(message.id);else if(message.type==='answers')resolve({...message,messages,childCount:workers.length});});});}finally{owner.disposeAll();await solver.terminate();await Promise.all(workers.map(w=>w.terminate()));}
}
test('real parallel workers retain complete certificates across changed generations without mutating older answers', {timeout:30000},async()=>{
 const result=await runReal();assert.ok(result.childCount>1);assert.ok(result.messages.some((m:any)=>m.type==='region-parallel-status'&&m.status==='enabled'));
 for(const answer of result.answers){assert.deepEqual(answer.result,answer.reference);assert.ok(answer.result.certificate.top.buffer instanceof ArrayBuffer);}
 assert.notDeepEqual(result.answers[0].result.certificate.top,result.answers[1].result.certificate.top);
});
test('real checker hard crash and wrong protocol wake a blocked solver and permanently fall back to complete CPU checking',{timeout:30000},async()=>{
 for(const failure of ['crash','protocol']){const result=await runReal({failure});assert.equal(result.messages.filter((m:any)=>m.type==='region-pool-init').length,1);assert.ok(result.messages.some((m:any)=>m.type==='region-parallel-status'&&m.status==='fallback'));for(const answer of result.answers)assert.deepEqual(answer.result,answer.reference);}
});
test('unavailable shared-memory acceleration uses complete CPU checking without starting a pool',async()=>{
 const result=await runReal({enabled:false});assert.equal(result.childCount,0);for(const answer of result.answers)assert.deepEqual(answer.result,answer.reference);
 const checker=createWorkerRegionCoverageChecker(()=>assert.fail(),{enabled:false});assert.throws(()=>checker(coverage(2,[[0,1]]),[],[]),/缺少/);
});
test('parallel cycles never expose a partial certificate and keep counterexample batches explicit',{timeout:30000},async()=>{
 const result=await runReal({values:[[2,1,2,2,2,2]],batchSize:1});const answer=result.answers[0].result;assert.ok(answer.triangles.length);assert.equal('certificate' in answer,false);assert.equal(answer.complete,false);
});

test('hardware selection follows valid reported cores and actual chunks, without a local 20-core ceiling',()=>{
 for(const [cores,expected]of [[1,1],[2,2],[4,4],[8,8],[20,20],[32,32],[64,64],[128,64],[Number.MAX_SAFE_INTEGER,64]])assert.equal(regionParallelWorkerCount(cores),expected);
 for(const invalid of [undefined,null,NaN,Infinity,-Infinity,0,-1,2.5,'32',{},Number.MAX_SAFE_INTEGER+1])assert.equal(regionParallelWorkerCount(invalid),1);
 assert.equal(REGION_MAX_WORKERS,64);assert.equal(regionParallelWorkerCount(64,3),3);assert.equal(regionParallelWorkerCount(128,128),64);
 for(const invalid of [NaN,0,-1,Infinity,undefined])assert.equal(regionParallelWorkerCount(8,invalid),invalid===undefined?8:1);
});

test('invalid explicit worker counts safely use complete CPU checking without allocating a pool',()=>{
 const input=coverage(4,[[0,1,2,3],[]]),pairs=pairsFor(4),values=pairs.map(()=>2),expected=checkCoverageTournaments(input,pairs,values);
 for(const workers of [NaN,Infinity,-Infinity,0,-4,1.5]){
  const checker=createWorkerRegionCoverageChecker(()=>assert.fail('invalid hardware must not start a pool'),{enabled:true,workers,minimumCells:0});assert.deepEqual(checker(input,pairs,values),expected);
 }
});

test('default hardware lookup handles absent or throwing metadata and ignores coarse deviceMemory',()=>{
 const priorNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),input=coverage(2,Array.from({length:96},()=>[0,1])),pairs:RegionPair[]=[[0,1]],expected=checkCoverageTournaments(input,pairs,[2]);
 try{
  for(const reported of [undefined,NaN,Infinity,0,-2,2.25,2,32,64,256]){
   Object.defineProperty(globalThis,'navigator',{configurable:true,value:{hardwareConcurrency:reported,deviceMemory:0.25}});
   let used=0;const checker=createWorkerRegionCoverageChecker(message=>{if(message.type==='region-pool-init'){used=message.pool.workers;failRegionPool(message.pool.control);}},{enabled:true,minimumCells:0});
   assert.deepEqual(checker(input,pairs,[2]),expected);assert.equal(used,regionParallelWorkerCount(reported)<2?0:Math.min(regionParallelWorkerCount(reported),48));
  }
  Object.defineProperty(globalThis,'navigator',{configurable:true,get(){throw Error('hardware metadata unavailable');}});
  assert.deepEqual(createWorkerRegionCoverageChecker(()=>assert.fail(),{enabled:true,minimumCells:0})(input,pairs,[2]),expected);
 }finally{if(priorNavigator)Object.defineProperty(globalThis,'navigator',priorNavigator);else Reflect.deleteProperty(globalThis,'navigator');}
});

test('missing SharedArrayBuffer or isolation keeps the full optimized CPU path',()=>{
 const native=globalThis.SharedArrayBuffer,isolation=Object.getOwnPropertyDescriptor(globalThis,'crossOriginIsolated'),input=coverage(2,[[0,1],[]]),expected=checkCoverageTournaments(input,[[0,1]],[2]);
 try{
  Object.defineProperty(globalThis,'crossOriginIsolated',{configurable:true,value:false});assert.deepEqual(createWorkerRegionCoverageChecker(()=>assert.fail(),{workers:64,minimumCells:0})(input,[[0,1]],[2]),expected);
  globalThis.SharedArrayBuffer=undefined as unknown as typeof SharedArrayBuffer;assert.deepEqual(createWorkerRegionCoverageChecker(()=>assert.fail(),{enabled:true,workers:64,minimumCells:0})(input,[[0,1]],[2]),expected);
 }finally{globalThis.SharedArrayBuffer=native;if(isolation)Object.defineProperty(globalThis,'crossOriginIsolated',isolation);else Reflect.deleteProperty(globalThis,'crossOriginIsolated');}
});

test('shared allocation failure switches permanently to paged CPU storage without retrying the dense matrix',()=>{
 const nativeShared=globalThis.SharedArrayBuffer,nativeUint=globalThis.Uint32Array,ids=Array.from({length:17},(_,i)=>i),input=coverage(17,[ids,[]]),pairs=pairsFor(17),values=pairs.map(()=>2),expected=checkCoverageTournaments(input,pairs,values),messages:any[]=[];let sharedAttempts=0,denseAttempts=0;
 try{
  globalThis.SharedArrayBuffer=new Proxy(nativeShared,{construct(){sharedAttempts++;throw new RangeError('injected shared allocation failure');}});
  globalThis.Uint32Array=new Proxy(nativeUint,{construct(target,args){if(args[0]===34)denseAttempts++;return Reflect.construct(target,args);}});
  const checker=createWorkerRegionCoverageChecker(m=>messages.push(m),{enabled:true,workers:4,minimumCells:0});assert.deepEqual(checker(input,pairs,values),expected);assert.deepEqual(checker(input,pairs,values),expected);
  assert.equal(sharedAttempts,1);assert.equal(denseAttempts,1);assert.equal(messages.filter(m=>m.type==='region-pool-init').length,0);assert.equal(messages.filter(m=>m.type==='region-parallel-status'&&m.status==='fallback').length,1);
 }finally{globalThis.SharedArrayBuffer=nativeShared;globalThis.Uint32Array=nativeUint;}
});

test('stream allocation failures fall back but traversal RangeErrors and invalid memberships remain errors',()=>{
 const nativeUint=globalThis.Uint32Array,input=coverage(3,[[0,1,2],[]]),pairs=pairsFor(3),values=[2,2,2],expected=checkCoverageTournaments(input,pairs,values),messages:any[]=[];let attempts=0;
 try{
  globalThis.Uint32Array=new Proxy(nativeUint,{construct(target,args){if(Array.isArray(args[0])){attempts++;throw new RangeError('injected transition stream allocation failure');}return Reflect.construct(target,args);}});
  const checker=createWorkerRegionCoverageChecker(m=>messages.push(m),{enabled:true,workers:4,minimumCells:0});assert.deepEqual(checker(input,pairs,values),expected);assert.equal(attempts,1);assert.ok(messages.some(m=>m.type==='region-parallel-status'&&m.status==='fallback'));
 }finally{globalThis.Uint32Array=nativeUint;}
 for(const failure of [Error('invalid topology'),new RangeError('invalid traversal bounds')]){
  const broken:RegionCoverage={faceCount:3,cellCount:1,walk(){throw failure;}},checker=createWorkerRegionCoverageChecker(()=>assert.fail('traversal exceptions are not fallback signals'),{enabled:true,workers:4,minimumCells:0});assert.throws(()=>checker(broken,pairs,values),error=>error===failure);
 }
 const invalid:RegionCoverage={faceCount:3,cellCount:1,walk(v){v.onTransition?.({removed:[],added:[0]});v.onCell?.(0,new Set([1]));}};
 assert.throws(()=>createWorkerRegionCoverageChecker(()=>assert.fail(),{enabled:true,workers:4,minimumCells:0})(invalid,pairs,values),/身份/);
});

test('stream push allocation failures are tagged locally without swallowing external callback errors',()=>{
 const nativePush=Array.prototype.push,input=coverage(2,[[0,1],[]]);let injected=false;
 Array.prototype.push=function(this:unknown[],...items:unknown[]){if(!injected&&this.length===0&&items.length===3&&items[0]===0&&items[1]===0&&items[2]===2){injected=true;throw new RangeError('injected stream growth failure');}return nativePush.apply(this,items);};
 try{assert.throws(()=>buildRegionTransitionSchedule(input),error=>error instanceof RegionAllocationError);assert.equal(injected,true);}finally{Array.prototype.push=nativePush;}
 const failure=new RangeError('external delta property');assert.throws(()=>buildRegionTransitionSchedule({faceCount:2,cellCount:1,walk(v){v.onTransition?.({get removed(){throw failure;},added:[]});}}),error=>error===failure);
});

test('actual 2/4/8/32/64-worker schedules and a 65537-cell case produce the identical full CPU certificates',{timeout:60000},async()=>{
 const shapes=[[0,1,2],[1,2,3],[],[0,2,3],[0,1,2,3],[]];
 for(const workers of [2,4,8,32,64]){
  const groups=Array.from({length:workers===8?65537:128},(_,i)=>shapes[i%shapes.length]),answer=await runReal({workers,groups,values:[[2,2,2,2,2,2]]});assert.equal(answer.childCount,workers);
  assert.deepEqual(answer.answers[0].result,answer.answers[0].reference);assert.equal(answer.answers[0].result.certificate.verifiedCells,groups.length);assert.equal(answer.messages.some((m:any)=>m.type==='region-parallel-status'&&m.status==='fallback'),false);
 }
});
