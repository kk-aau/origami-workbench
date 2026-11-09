import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {FlatFoldResult} from '../../src/core/types';
import {acquireModelSurface,startModelOverlapAnalysis,type ModelOverlapReply,type ModelOverlapRequest} from '../../src/app/modelOverlapTask';
const model=():FlatFoldResult=>({geometry:{status:'ready',message:'',vertices:[[0,0],[10,0],[10,10],[0,10]],faces:[[0,1,2,3],[0,1,2,3]]},layers:{status:'solved',message:'',faceOrders:[[0,1,-1]]},warnings:[]});
test('real region worker computes both directions from the same unchanged snapshot',async()=>{
 const scope=globalThis as unknown as {onmessage?:(e:{data:ModelOverlapRequest})=>void;postMessage?:(r:ModelOverlapReply)=>void},old=scope.onmessage,post=scope.postMessage,replies:ModelOverlapReply[]=[];
 try{
  scope.postMessage=r=>replies.push(r);await import('../../src/workers/modelOverlap.worker');const input=model(),before=structuredClone(input);
  for(const side of ['front','back'] as const){scope.onmessage!({data:{result:input,side}});const reply=replies.at(-1)!;assert.equal(reply.status,'complete');if(reply.status==='complete'){assert.equal(reply.boundaries!.edges.length,4);assert.deepEqual(reply.shadows,{strips:[],ambiguousEdges:0});assert.equal(reply.boundaries!.ambiguousEdges,0);assert.equal(reply.regions!.length,reply.analysis.cells.length);assert.ok(reply.regions!.length>0);for(const region of reply.regions!)assert.deepEqual(region.layers,{status:'ordered',topToBottom:side==='front'?[1,0]:[0,1]});}}
  scope.onmessage!({data:{result:input,side:'front',bothSides:true,shadows:false}});
  const both=replies.at(-1)!;assert.equal(both.status,'complete');
  if(both.status==='complete'){
   assert.equal(both.shadows,undefined);assert.equal(both.opposite!.shadows,undefined);
   assert.equal(both.opposite!.regions.length,both.regions!.length);
   for(const r of both.opposite!.regions)assert.deepEqual(r.layers,{status:'ordered',topToBottom:[0,1]});
  }
  // A concave coverage polygon needs several convex cells, all sharing the
  // same local order. Native worker transfer must retain that sharing too.
  const repeated=model();repeated.geometry.vertices=[[0,0],[10,0],[10,10],[8,10],[8,2],[2,2],[2,10],[0,10]];
  repeated.geometry.faces=[repeated.geometry.vertices.map((_,i)=>i),repeated.geometry.vertices.map((_,i)=>i)];
  const repeatedBefore=structuredClone(repeated);
  for(const side of ['front','back'] as const){
   scope.onmessage!({data:{result:repeated,side,bothSides:true,shadows:false}});
   const reply=structuredClone(replies.at(-1)!);assert.equal(reply.status,'complete');
   if(reply.status==='complete'){
    const same=reply.regions!,opposite=reply.opposite!.regions;assert.ok(same.length>1);assert.equal(opposite.length,same.length);
    assert.deepEqual(same[0].layers,{status:'ordered',topToBottom:side==='front'?[1,0]:[0,1]});
    assert.deepEqual(opposite[0].layers,{status:'ordered',topToBottom:side==='front'?[0,1]:[1,0]});
    assert.notEqual(opposite[0].layers,same[0].layers);
    for(let i=0;i<same.length;i++){
     assert.equal(same[i].layers,same[0].layers);assert.equal(opposite[i].layers,opposite[0].layers);
     assert.notEqual(opposite[i],same[i]);assert.equal(opposite[i].polygon,same[i].polygon);assert.equal(opposite[i].faces,same[i].faces);assert.equal(opposite[i].area,same[i].area);
    }
   }
   assert.deepEqual(repeated,repeatedBefore);
  }
  for(const status of ['unconfirmed','conflict'] as const){
   const uncertainInput=structuredClone(repeatedBefore);
   if(status==='unconfirmed')uncertainInput.layers.status='timeout';else uncertainInput.layers.faceOrders!.push([0,1,1]);
   const before=structuredClone(uncertainInput);scope.onmessage!({data:{result:uncertainInput,side:'front',bothSides:true,shadows:false}});
   const reply=structuredClone(replies.at(-1)!);assert.equal(reply.status,'error');
   if(reply.status==='error')assert.match(reply.message,/未发布不完整纸面/);
   assert.deepEqual(uncertainInput,before);
  }
  assert.deepEqual(input,before);input.layers.status='timeout';scope.onmessage!({data:{result:input,side:'front'}});const uncertain=replies.at(-1)!;assert.equal(uncertain.status,'error');
  input.layers.status='solved';input.layers.faceOrders!.push([0,1,1]);scope.onmessage!({data:{result:input,side:'back'}});const conflict=replies.at(-1)!;assert.equal(conflict.status,'error');
  scope.onmessage!({data:{result:input,side:'bad' as any}});assert.equal(replies.at(-1)!.status,'error');
 }finally{if(old===undefined)delete scope.onmessage;else scope.onmessage=old;if(post===undefined)delete scope.postMessage;else scope.postMessage=post;}
});

test('front and back share one surface task, cancellation is per subscriber and completed snapshots are reused',async()=>{
 const saved=globalThis.Worker,workers:FakeWorker[]=[];
 class FakeWorker {request?:ModelOverlapRequest;stops=0;onmessage?: (e:{data:ModelOverlapReply})=>void;constructor(){workers.push(this);}postMessage(r:ModelOverlapRequest){this.request=structuredClone(r);}terminate(){this.stops++;}}
 globalThis.Worker=FakeWorker as unknown as typeof Worker;
 try{
  const source=model(),front=acquireModelSurface(source,'front'),back=acquireModelSurface(source,'back');
  assert.equal(workers.length,1);assert.deepEqual(workers[0].request,{result:source,side:'front',bothSides:true,shadows:false});
  front.cancel();assert.equal((await front.promise).status,'cancelled');assert.equal(workers[0].stops,0);
  const analysis={cells:[{polygon:[[0,0],[1,0],[0,1]] as [number,number][],area:.5,faces:[0,1]}],maxDepth:2,omittedThinRegions:0,epsilon:1e-8},boundaries={edges:analysis.cells[0].polygon.map((a,i)=>({a,b:analysis.cells[0].polygon[(i+1)%3],leftRegion:0,rightRegion:null})),ambiguousEdges:0};
  const regions=analysis.cells.map(c=>({...c,layers:{status:'ordered' as const,topToBottom:[1,0]}}));
  const opposite={regions:analysis.cells.map(c=>({...c,layers:{status:'ordered' as const,topToBottom:[0,1]}})),boundaries};
  workers[0].onmessage!({data:{status:'complete',analysis,regions,boundaries,opposite}});
  const reply=await back.promise;assert.equal(reply.status,'complete');if(reply.status==='complete')assert.deepEqual(reply.regions,opposite.regions);
  back.cancel();const cached=acquireModelSurface(source,'front');assert.equal(workers.length,1);
  assert.equal((await cached.promise).status,'complete');cached.cancel();assert.equal(workers[0].stops,1);
  const changed=model(),first=acquireModelSurface(changed,'front'),second=acquireModelSurface(changed,'back');
  first.cancel();second.cancel();assert.equal(workers[1].stops,1);
  const retry=acquireModelSurface(changed,'front');assert.equal(workers.length,3);retry.cancel();
  const withShadows=acquireModelSurface(source,'front',true);assert.equal(workers.length,4);assert.equal(workers[3].request!.shadows,true);withShadows.cancel();
 }finally{globalThis.Worker=saved;}
});
test('region tasks freeze direction, reject incomplete responses and suppress late cancelled replies',async()=>{
 const saved=globalThis.Worker;let worker:FakeWorker;
 class FakeWorker {request?:ModelOverlapRequest;stops=0;onmessage?: (e:{data:ModelOverlapReply})=>void;constructor(){worker=this;}postMessage(r:ModelOverlapRequest){this.request=structuredClone(r);}terminate(){this.stops++;}}
 globalThis.Worker=FakeWorker as unknown as typeof Worker;
 try{
  const input=model(),before=structuredClone(input),task=startModelOverlapAnalysis(input,1000,'back');input.layers.faceOrders=[];assert.deepEqual(worker!.request,{result:before,side:'back'});
  worker!.onmessage!({data:{status:'complete',analysis:{cells:[],maxDepth:0,omittedThinRegions:0,epsilon:1e-8}}});assert.equal((await task.promise).status,'error');assert.equal(worker!.stops,1);
  const analysis={cells:[],maxDepth:0,omittedThinRegions:0,epsilon:1e-8};
  const missingEdges=startModelOverlapAnalysis(before,1000,'back');worker!.onmessage!({data:{status:'complete',analysis,regions:[]}});assert.equal((await missingEdges.promise).status,'error');
  const emptyEdges=startModelOverlapAnalysis(before,1000,'back');worker!.onmessage!({data:{status:'complete',analysis,regions:[],boundaries:{edges:[],ambiguousEdges:0}}});assert.equal((await emptyEdges.promise).status,'complete');
  const cancelled=startModelOverlapAnalysis(before,1000,'front');cancelled.cancel();worker!.onmessage!({data:{status:'complete',analysis:{cells:[],maxDepth:0,omittedThinRegions:0,epsilon:1e-8},regions:[]}});assert.equal((await cancelled.promise).status,'cancelled');assert.equal(worker!.stops,1);
  assert.equal((await startModelOverlapAnalysis(before,1000,'bad' as any).promise).status,'error');
 }finally{globalThis.Worker=saved;}
});

test('shared surfaces have no automatic deadline at any size and cancel only when all subscribers stop',async()=>{
 const savedWorker=globalThis.Worker,savedSet=globalThis.setTimeout,savedClear=globalThis.clearTimeout;
 const workers:FakeWorker[]=[],timers=new Map<number,{callback:()=>void;delay:number}>();let serial=0;
 class FakeWorker {stops=0;onmessage?: (e:{data:ModelOverlapReply})=>void;constructor(){workers.push(this);}postMessage(){}terminate(){this.stops++;}}
 globalThis.Worker=FakeWorker as unknown as typeof Worker;
 globalThis.setTimeout=((callback:()=>void,delay:number)=>{const id=++serial;timers.set(id,{callback,delay});return id;}) as unknown as typeof setTimeout;
 globalThis.clearTimeout=((id:number)=>{timers.delete(id);}) as unknown as typeof clearTimeout;
 try{
  for(const faceCount of [9999,10_000,19_491]){
   // Only exercise scheduling: no geometry calculation or large worker transfer.
   const source=model();source.geometry.faces=Array.from({length:faceCount},()=>[0,1,2,3]);
   const count=workers.length,front=acquireModelSurface(source,'front'),back=acquireModelSurface(source,'back'),worker=workers.at(-1)!;
   assert.equal(workers.length,count+1);assert.equal(timers.size,0);
   front.cancel();assert.equal((await front.promise).status,'cancelled');assert.equal(worker.stops,0);assert.equal(timers.size,0);
   back.cancel();assert.equal((await back.promise).status,'cancelled');assert.equal(worker.stops,1);assert.equal(timers.size,0);
   assert.equal(source.layers.status,'solved','cancellation must preserve the certified layer result');
   const retry=acquireModelSurface(source,'front');assert.equal(workers.length,count+2);assert.equal(timers.size,0);
   retry.cancel();assert.equal((await retry.promise).status,'cancelled');assert.equal(workers.at(-1)!.stops,1);assert.equal(timers.size,0);
   back.cancel();assert.equal(worker.stops,1);
  }
  const capped=startModelOverlapAnalysis(model(),120_000,'front');assert.equal([...timers.values()][0].delay,120_000);
  capped.cancel();assert.equal((await capped.promise).status,'cancelled');assert.equal(timers.size,0);
 }finally{globalThis.Worker=savedWorker;globalThis.setTimeout=savedSet;globalThis.clearTimeout=savedClear;}
});
