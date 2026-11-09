import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {FlatFoldResult} from '../../src/core/types';
import {startModelShadowAnalysis,type ModelShadowRequest,type ModelShadowReply} from '../../src/app/modelShadowTask';
import {modelShadowBoundaries} from '../../src/app/modelShadowBoundaries';

class MockWorker{
 static latest:MockWorker;
 onmessage:((event:{data:ModelShadowReply})=>void)|null=null;
 onerror:((event:{message:string})=>void)|null=null;
 onmessageerror:(()=>void)|null=null;
 request?:ModelShadowRequest;terminations=0;
 constructor(){MockWorker.latest=this;}
 postMessage(request:ModelShadowRequest){this.request=request;}
 terminate(){this.terminations++;}
}
function model():FlatFoldResult{
 return {geometry:{status:'ready',message:'',vertices:[[0,0],[100,0],[100,100],[0,100],[50,0],[150,0],[150,100],[50,100]],faces:[[0,1,2,3],[4,5,6,7]]},layers:{status:'solved',message:'',faceOrder:[0,1],faceOrders:[[0,1,1]]},warnings:[]};
}
const complete:ModelShadowReply={status:'complete',analysis:{status:'ready',boundaries:[],ambiguousEdges:0}};
async function withWorker(run:()=>Promise<void>){
 const prior=globalThis.Worker;globalThis.Worker=MockWorker as unknown as typeof Worker;
 try{await run();}finally{globalThis.Worker=prior;}
}
test('shadow task snapshots model, direction and rotation; successful reply cleans up once',()=>withWorker(async()=>{
 const input=model(),before=structuredClone(input),task=startModelShadowAnalysis(input,'back',22.5),worker=MockWorker.latest;
 input.geometry.vertices[0][0]=999;
 assert.deepEqual(worker.request,{result:before,side:'back',rotation:22.5});
 worker.onmessage?.({data:complete});assert.deepEqual(await task.promise,complete);
 task.cancel();worker.onerror?.({message:'late'});assert.equal(worker.terminations,1);
}));
test('shadow cancellation terminates blocking worker and ignores late completion',()=>withWorker(async()=>{
 const input=model(),before=structuredClone(input),task=startModelShadowAnalysis(input,'front'),worker=MockWorker.latest;
 task.cancel();worker.onmessage?.({data:complete});task.cancel();
 assert.equal((await task.promise).status,'cancelled');assert.equal(worker.terminations,1);assert.deepEqual(input,before);
}));
test('shadow timeout terminates worker without changing trusted layer order',()=>withWorker(async()=>{
 const input=model(),before=structuredClone(input),task=startModelShadowAnalysis(input,'front',0,10),worker=MockWorker.latest;
 assert.equal((await task.promise).status,'timeout');assert.equal(worker.terminations,1);assert.deepEqual(input,before);
 worker.onmessage?.({data:complete});assert.equal((await task.promise).status,'timeout');
}));
test('shadow worker runtime, serialization and construction errors resolve explicitly',()=>withWorker(async()=>{
 let task=startModelShadowAnalysis(model(),'front'),worker=MockWorker.latest;
 worker.onerror?.({message:'crashed'});assert.match((await task.promise as {message:string}).message,/crashed/);assert.equal(worker.terminations,1);
 task=startModelShadowAnalysis(model(),'front');worker=MockWorker.latest;worker.onmessageerror?.();
 assert.equal((await task.promise).status,'error');assert.equal(worker.terminations,1);
 globalThis.Worker=class extends MockWorker{postMessage(){throw new Error('clone failed');}} as unknown as typeof Worker;
 assert.match((await startModelShadowAnalysis(model(),'front').promise as {message:string}).message,/clone failed/);assert.equal(MockWorker.latest.terminations,1);
 globalThis.Worker=class{constructor(){throw new Error('unavailable');}} as unknown as typeof Worker;
 assert.match((await startModelShadowAnalysis(model(),'front').promise as {message:string}).message,/unavailable/);
}));
test('shadow task rejects invalid view or time budget before launching worker',()=>withWorker(async()=>{
 globalThis.Worker=class{constructor(){assert.fail('must not start');}} as unknown as typeof Worker;
 assert.equal((await startModelShadowAnalysis(model(),'front',NaN).promise).status,'error');
 for(const budget of [NaN,-Infinity,0,-1])assert.equal((await startModelShadowAnalysis(model(),'front',0,budget).promise).status,'error');
 assert.equal((await startModelShadowAnalysis(model(),'invalid' as 'front').promise).status,'error');
}));
test('actual shadow worker calculates both directions and reports invalid geometry without mutating input',async()=>{
 const scope=globalThis as unknown as {onmessage?: (event:{data:ModelShadowRequest})=>void;postMessage?:(reply:ModelShadowReply)=>void};
 const oldHandler=scope.onmessage,oldPost=scope.postMessage,messages:ModelShadowReply[]=[];
 try{
  scope.postMessage=reply=>messages.push(reply);await import('../../src/workers/modelShadow.worker');
  const input=model(),before=structuredClone(input);
  for(const side of ['front','back'] as const){
   scope.onmessage!({data:{result:input,side,rotation:22.5}});
   assert.deepEqual(messages.at(-1),{status:'complete',analysis:modelShadowBoundaries(input,side,22.5)});
  }
  assert.deepEqual(input,before);
  input.geometry.vertices[0][0]=NaN;scope.onmessage!({data:{result:input,side:'front',rotation:0}});
  assert.equal(messages.at(-1)?.status,'error');
 }finally{
  if(oldHandler===undefined)delete scope.onmessage;else scope.onmessage=oldHandler;
  if(oldPost===undefined)delete scope.postMessage;else scope.postMessage=oldPost;
 }
});
