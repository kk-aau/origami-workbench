import test from 'node:test';
import assert from 'node:assert/strict';
import {startFlatFold,startFlatLayerReanalysis} from '../../src/core/workerClient';
import type {Doc,FoldGraph,FlatFoldResult} from '../../src/core/types';

const doc:Doc={name:'deadline',paper:{width:100,height:100},segments:[]};
const graph:FoldGraph={vertices_coords:[],edges_vertices:[],edges_assignment:[],edges_foldAngle:[],faces_vertices:[[]]};
class WorkerStub{
  static latest:WorkerStub;
  onmessage:((event:{data:unknown})=>void)|null=null;
  onerror:((event:{message:string})=>void)|null=null;
  onmessageerror:(()=>void)|null=null;
  terminated=false;
  constructor(){WorkerStub.latest=this;}
  postMessage(){}
  terminate(){this.terminated=true;}
}

test('the face-based deadline includes time already spent preparing the source graph',async context=>{
  let clock=1000;const scheduled:{callback:()=>void;delay:number}[]=[];
  context.mock.method(performance,'now',()=>clock);
  context.mock.method(globalThis,'setTimeout',(callback:()=>void,delay:number)=>{scheduled.push({callback,delay});return scheduled.length as unknown as ReturnType<typeof setTimeout>;});
  context.mock.method(globalThis,'clearTimeout',()=>{});
  const old=globalThis.Worker;globalThis.Worker=WorkerStub as unknown as typeof Worker;
  try{
    const task=startFlatFold(doc,{timeoutMs:100,timeoutForFaces:()=>50});
    assert.equal(scheduled[0].delay,100);
    clock+=40;WorkerStub.latest.onmessage?.({data:{type:'source',graph}});
    assert.equal(scheduled[1].delay,10,'receiving the graph must not restart a fresh 50 ms budget');
    clock+=10;scheduled[1].callback();assert.equal((await task.promise).layers.status,'timeout');assert.equal(WorkerStub.latest.terminated,true);
  }finally{globalThis.Worker=old;}
});

test('cancellation during a source callback cannot rearm the timer or accept later geometry',async context=>{
  let timers=0,budgets=0,progress=0;
  context.mock.method(globalThis,'setTimeout',()=>++timers as unknown as ReturnType<typeof setTimeout>);
  context.mock.method(globalThis,'clearTimeout',()=>{});
  const old=globalThis.Worker;globalThis.Worker=WorkerStub as unknown as typeof Worker;
  try{
    const task=startFlatFold(doc,{onSource:()=>task.cancel(),timeoutForFaces:()=>{budgets++;return 50;},onProgress:()=>{progress++;}});
    const worker=WorkerStub.latest;worker.onmessage?.({data:{type:'source',graph}});
    assert.equal((await task.promise).layers.status,'cancelled');assert.equal(worker.terminated,true);
    worker.onmessage?.({data:{type:'geometry',result:{}}});
    assert.equal(timers,0);assert.equal(budgets,0);assert.equal(progress,0);
  }finally{globalThis.Worker=old;}
});

test('explicit preview deadlines are not silently shortened to the former ten-minute cap',async context=>{
 const delays:number[]=[];
 context.mock.method(performance,'now',()=>0);
 context.mock.method(globalThis,'setTimeout',(_callback:()=>void,delay:number)=>{delays.push(delay);return delays.length as unknown as ReturnType<typeof setTimeout>;});
 context.mock.method(globalThis,'clearTimeout',()=>{});
 const old=globalThis.Worker;globalThis.Worker=WorkerStub as unknown as typeof Worker;
 try{
  const task=startFlatFold(doc,{timeoutMs:180_000,timeoutForFaces:()=>900_000});
  assert.equal(delays[0],180_000,'a large model must not still be cut off after 60 seconds');
  WorkerStub.latest.onmessage?.({data:{type:'source',graph}});assert.equal(delays[1],900_000);
  task.cancel();assert.equal((await task.promise).layers.status,'cancelled');assert.equal(WorkerStub.latest.terminated,true);
 }finally{globalThis.Worker=old;}
});

test('normal flat and layer jobs wait for complete results beyond old deadlines without scheduling a cutoff',async context=>{
 let clock=0,timers=0;
 context.mock.method(performance,'now',()=>clock);
 context.mock.method(globalThis,'setTimeout',()=>++timers as unknown as ReturnType<typeof setTimeout>);
 const preview:FlatFoldResult={geometry:{status:'ready',message:'geometry',vertices:[[0,0]],faces:[]},layers:{status:'unknown',message:'working'},warnings:[]};
 const complete:FlatFoldResult={...preview,layers:{status:'solved',message:'verified',faceOrders:[]}};
 const old=globalThis.Worker;globalThis.Worker=WorkerStub as unknown as typeof Worker;
 try{
  for(const launch of [()=>startFlatFold(doc),()=>startFlatFold(doc,{timeoutMs:Infinity,timeoutForFaces:()=>10}),()=>startFlatLayerReanalysis(preview)]){
   const task=launch(),worker=WorkerStub.latest;let finished=false;task.promise.then(()=>{finished=true;});
   worker.onmessage?.({data:{type:'source',graph}});worker.onmessage?.({data:{type:'geometry',result:preview}});
   clock+=3_600_000;await Promise.resolve();assert.equal(finished,false);assert.equal(worker.terminated,false);assert.equal(timers,0);
   worker.onmessage?.({data:{type:'result',result:complete}});assert.deepEqual(await task.promise,complete);assert.equal(worker.terminated,true);
  }
 }finally{globalThis.Worker=old;}
});

test('unlimited jobs can be cancelled and discard late completion; malformed deadlines fail explicitly',async context=>{
 context.mock.method(globalThis,'setTimeout',()=>{throw Error('unlimited job must not schedule a timer');});
 const old=globalThis.Worker;globalThis.Worker=WorkerStub as unknown as typeof Worker;
 try{
  const task=startFlatFold(doc,{timeoutMs:Infinity}),worker=WorkerStub.latest;task.cancel();
  const reply=await task.promise;assert.equal(reply.layers.status,'cancelled');assert.equal(worker.terminated,true);
  worker.onmessage?.({data:{type:'result',result:{layers:{status:'solved'}}}});assert.equal((await task.promise).layers.status,'cancelled');
  for(const timeoutMs of [0,-1,NaN,-Infinity])assert.equal((await startFlatFold(doc,{timeoutMs}).promise).geometry.status,'error');
 }finally{globalThis.Worker=old;}
});

test('an unreadable worker result ends an unlimited job with an explicit error and keeps its geometry',async()=>{
 const old=globalThis.Worker;globalThis.Worker=WorkerStub as unknown as typeof Worker;
 try{
  const task=startFlatFold(doc),worker=WorkerStub.latest;
  const preview:FlatFoldResult={geometry:{status:'ready',message:'geometry',vertices:[[1,2]],faces:[]},layers:{status:'unknown',message:'working'},warnings:[]};
  worker.onmessage?.({data:{type:'geometry',result:preview}});worker.onmessageerror?.();
  const reply=await task.promise;assert.equal(reply.layers.status,'error');assert.match(reply.layers.message,/无法读取/);assert.deepEqual(reply.geometry,preview.geometry);assert.equal(worker.terminated,true);
 }finally{globalThis.Worker=old;}
});
