import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startModelOverlapAnalysis,createModelOverlapPreview,type ModelOverlapReply,type ModelOverlapRequest} from '../../src/app/modelOverlapTask';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {computeFlatFold} from '../../src/core/flatFold';
import {blankDoc} from '../../src/app/state';
const model=()=>computeFlatFold(blankDoc('预览',100,100));
const complete:ModelOverlapReply={status:'complete',analysis:{cells:[],maxDepth:0,omittedThinRegions:0,epsilon:1e-8}};
test('continuous submissions keep original launch deadline and return exact draft ticket',async()=>{
 const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
 let timer: (()=>void)|undefined,scheduled=0;const published:number[]=[];
 try{
  globalThis.setTimeout=((callback:()=>void)=>{scheduled++;timer=callback;return 1;}) as unknown as typeof setTimeout;
  globalThis.clearTimeout=(()=>{timer=undefined;}) as typeof clearTimeout;
  let resolve!:(r:ModelOverlapReply)=>void;const seen:number[]=[];
  const scheduler=createModelOverlapPreview((_reply,ticket)=>published.push(ticket),80,input=>{seen.push(input.geometry.vertices[0][0]);return {promise:new Promise(r=>resolve=r),cancel(){}};});
  const input=model();let ticket=0;
  for(let i=0;i<20;i++){input.geometry.vertices[0][0]=i;ticket=scheduler.submit(input);}
  assert.equal(scheduled,1);timer!();assert.deepEqual(seen,[19]);resolve(complete);await Promise.resolve();assert.deepEqual(published,[ticket]);
  input.geometry.vertices[0][0]=30;scheduler.submit(input);assert.equal(scheduled,2);scheduler.cancel();assert.equal(timer,undefined);
 }finally{globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}
});
class FakeWorker{
 static latest:FakeWorker;request?:ModelOverlapRequest;stops=0;
 onmessage:((e:{data:ModelOverlapReply})=>void)|null=null;onerror:((e:{message:string})=>void)|null=null;onmessageerror:(()=>void)|null=null;
 constructor(){FakeWorker.latest=this;}postMessage(request:ModelOverlapRequest){this.request=structuredClone(request);}terminate(){this.stops++;}
}
async function withWorker(run:()=>Promise<void>){const saved=globalThis.Worker;globalThis.Worker=FakeWorker as unknown as typeof Worker;try{await run();}finally{globalThis.Worker=saved;}}
test('overlap task freezes geometry and cleans up successful or cancelled workers exactly once',()=>withWorker(async()=>{
 const input=model(),before=structuredClone(input),task=startModelOverlapAnalysis(input),worker=FakeWorker.latest;input.geometry.vertices[0][0]=999;assert.deepEqual(worker.request,{result:before});worker.onmessage!({data:complete});assert.deepEqual(await task.promise,complete);task.cancel();assert.equal(worker.stops,1);
 const next=startModelOverlapAnalysis(before),other=FakeWorker.latest;next.cancel();other.onmessage!({data:complete});assert.equal((await next.promise).status,'cancelled');assert.equal(other.stops,1);
}));
test('overlap communication snapshots the model once and preserves both directions of isolation',()=>withWorker(async()=>{
  const clone=globalThis.structuredClone,input=model(),before=clone(input);let copies=0;
  try{
    globalThis.structuredClone=(value,options)=>{copies++;return clone(value,options);};
    const task=startModelOverlapAnalysis(input,1500,'front',{bothSides:true,shadows:false}),worker=FakeWorker.latest;
    assert.equal(copies,1,'postMessage already snapshots the model');
    input.geometry.vertices[0][0]=999;
    assert.deepEqual(worker.request,{result:before,side:'front',bothSides:true,shadows:false});
    worker.request!.result.geometry.vertices[1][0]=888;
    assert.equal(input.geometry.vertices[1][0],before.geometry.vertices[1][0]);
    task.cancel();assert.equal((await task.promise).status,'cancelled');assert.equal(worker.stops,1);
  }finally{globalThis.structuredClone=clone;}
}));
test('overlap timeout and worker errors preserve model and never claim no solution',()=>withWorker(async()=>{
 const source=model(),before=structuredClone(source),task=startModelOverlapAnalysis(source,10),worker=FakeWorker.latest;assert.equal((await task.promise).status,'timeout');assert.equal(worker.stops,1);assert.deepEqual(source,before);
 for(const error of ['runtime','message'] as const){const job=startModelOverlapAnalysis(source),w=FakeWorker.latest;if(error==='runtime')w.onerror!({message:'故障'});else w.onmessageerror!();assert.equal((await job.promise).status,'error');assert.equal(w.stops,1);}
 for(const n of [0,-1,NaN,-Infinity])assert.equal((await startModelOverlapAnalysis(source,n).promise).status,'error');
 globalThis.Worker=class{constructor(){throw Error('无法启动');}} as unknown as typeof Worker;assert.equal((await startModelOverlapAnalysis(source).promise).status,'error');
}));
test('actual overlap worker returns geometric coverage without changing layer data',async()=>{
 const scope=globalThis as unknown as {onmessage?:(e:{data:ModelOverlapRequest})=>void;postMessage?:(r:ModelOverlapReply)=>void},old=scope.onmessage,post=scope.postMessage,messages:ModelOverlapReply[]=[];
 try{scope.postMessage=r=>{if('status' in r)messages.push(r);};await import('../../src/workers/modelOverlap.worker');const source=model(),before=structuredClone(source);scope.onmessage!({data:{result:source}});assert.deepEqual(messages[0],{status:'complete',analysis:modelOverlapRegions(source)});assert.deepEqual(source,before);source.geometry.vertices[0][0]=NaN;scope.onmessage!({data:{result:source}});assert.equal(messages[1].status,'error');}
 finally{if(old===undefined)delete scope.onmessage;else scope.onmessage=old;if(post===undefined)delete scope.postMessage;else scope.postMessage=post;}
});
test('draft scheduler coalesces input, freezes drafts, cancels active work and drops late replies',async()=>{
 const replies:ModelOverlapReply[]=[],inputs:ReturnType<typeof model>[]=[],jobs:{resolve:(r:ModelOverlapReply)=>void;stops:number}[]=[];
 let launched!:()=>void;let waiting=new Promise<void>(r=>launched=r);
 const scheduler=createModelOverlapPreview(r=>replies.push(r),0,input=>{inputs.push(input);let resolve!:(r:ModelOverlapReply)=>void;const promise=new Promise<ModelOverlapReply>(r=>resolve=r),job={resolve,stops:0};jobs.push(job);launched();return {promise,cancel(){job.stops++;}};});
 const input=model();scheduler.submit(input);input.geometry.vertices[0][0]=10;scheduler.submit(input);input.geometry.vertices[0][0]=20;await waiting;assert.equal(inputs.length,1);assert.equal(inputs[0].geometry.vertices[0][0],10);
 waiting=new Promise<void>(r=>launched=r);scheduler.submit(input);assert.equal(jobs[0].stops,1);jobs[0].resolve(complete);await waiting;assert.equal(replies.length,0);jobs[1].resolve(complete);await Promise.resolve();assert.deepEqual(replies,[complete]);scheduler.cancel();
 scheduler.submit(input);scheduler.cancel();await new Promise(r=>setTimeout(r,10));assert.equal(inputs.length,2);
});
test('scheduler suppresses in-flight replies after cancellation and reports current rejection',async()=>{
 let entered!:()=>void,resolve!:(r:ModelOverlapReply)=>void;const waiting=new Promise<void>(r=>entered=r),replies:ModelOverlapReply[]=[];
 const scheduler=createModelOverlapPreview(r=>replies.push(r),0,()=>{entered();return {promise:new Promise(r=>resolve=r),cancel(){}};});scheduler.submit(model());await waiting;scheduler.cancel();resolve(complete);await Promise.resolve();assert.equal(replies.length,0);
 const failed=await new Promise<ModelOverlapReply>(done=>{const s=createModelOverlapPreview(done,0,()=>({promise:Promise.reject(Error('计算失败')),cancel(){}}));s.submit(model());});assert.equal(failed.status,'error');
 assert.throws(()=>createModelOverlapPreview(()=>{},NaN),/等待/);
});
