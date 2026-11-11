import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiagramSpatialPreviewSession,startDiagramSpatialLayerAdjustment} from '../../src/app/diagramSpatialTask';
import type {DiagramPose} from '../../src/app/diagramProject';

test('preview session sends history once, reuses the worker, and cancels pending frames',async()=>{
 class MockWorker {
  static instances:MockWorker[]=[];messages:any[]=[];terminated=false;onmessage?:(event:any)=>void;onerror?:(event:any)=>void;
  constructor(){MockWorker.instances.push(this);}postMessage(request:unknown){this.messages.push(request);}terminate(){this.terminated=true;}
  reply(value:unknown){this.onmessage?.({data:{ok:true,value}});}
 }
 const prior=globalThis.Worker;globalThis.Worker=MockWorker as unknown as typeof Worker;
 try{
  const pose={} as DiagramPose,history=[pose],session=createDiagramSpatialPreviewSession(pose,history,90),worker=MockWorker.instances[0];
  assert.deepEqual(worker.messages,[{mode:'preview-init',pose,history,drawingRotation:90}]);worker.reply(null);
  for(let yaw=0;yaw<5;yaw++){const frame=session.frame({yaw,elevation:25});await Promise.resolve();assert.deepEqual(worker.messages.at(-1),{mode:'preview-frame',camera:{yaw,elevation:25}});worker.reply('<svg/>');assert.equal(await frame,'<svg/>');}
  assert.equal(MockWorker.instances.length,1);assert.equal(worker.messages.filter(m=>'history' in m).length,1);
  const pending=session.frame({yaw:8,elevation:25});await Promise.resolve();session.close();await assert.rejects(pending,/取消/);assert.equal(worker.terminated,true);
  await assert.rejects(session.frame({yaw:9,elevation:25}),/关闭/);
 }finally{globalThis.Worker=prior;}
});
test('layer request remains interruptible and never resolves cancelled output',async()=>{
 class MockWorker{static latest:MockWorker;terminated=false;onmessage?:(event:any)=>void;request:any;constructor(){MockWorker.latest=this;}postMessage(request:unknown){this.request=request;}terminate(){this.terminated=true;}}
 const prior=globalThis.Worker;globalThis.Worker=MockWorker as unknown as typeof Worker;
 try{const request={relativeConstraints:[{above:2,below:1}]},task=startDiagramSpatialLayerAdjustment({} as DiagramPose,request);assert.deepEqual(MockWorker.latest.request.request,request);task.cancel();await assert.rejects(task.promise,/取消/);MockWorker.latest.onmessage?.({data:{ok:true,value:{}}});assert.equal(MockWorker.latest.terminated,true);}finally{globalThis.Worker=prior;}
});

test('preview mode serializes frames, exact commits and sync without creating a second worker',async()=>{
 class MockWorker{
  static instances:MockWorker[]=[];messages:any[]=[];terminated=false;onmessage?:(event:any)=>void;onerror?:(event:any)=>void;
  constructor(){MockWorker.instances.push(this);}postMessage(message:unknown){this.messages.push(message);}terminate(){this.terminated=true;}
  reply(value:unknown){this.onmessage?.({data:{ok:true,value}});}
 }
 const prior=globalThis.Worker;globalThis.Worker=MockWorker as unknown as typeof Worker;
 try{
  const pose={} as DiagramPose,session=createDiagramSpatialPreviewSession(pose),worker=MockWorker.instances[0],camera={yaw:10,elevation:20};
  const frame=session.frame(camera),project=session.project(camera),sync=session.sync(pose,[pose],15);
  assert.equal(worker.messages.length,1,'initialization must finish before queued work starts');worker.reply(null);await session.ready;
  assert.equal(worker.messages.at(-1).mode,'preview-frame');worker.reply('<svg/>');assert.equal(await frame,'<svg/>');
  assert.equal(worker.messages.at(-1).mode,'preview-project');const answer={result:{},spatial:{}};worker.reply(answer);assert.deepEqual(await project,answer);
  assert.equal(worker.messages.at(-1).mode,'preview-sync');worker.reply(null);await sync;assert.equal(MockWorker.instances.length,1);
  const next=session.frame(camera);worker.reply('<svg data-reused/>');assert.equal(await next,'<svg data-reused/>');
  const active=session.frame(camera),queued=session.project(camera),waiting=session.sync(pose);session.close();
  for(const pending of [active,queued,waiting])await assert.rejects(pending,/取消/);
  worker.reply('<svg stale/>');assert.equal(worker.terminated,true);await assert.rejects(session.project(camera),/关闭/);
 }finally{globalThis.Worker=prior;}
});

test('failed preview initialization rejects ready and all queued requests, with no stale success',async()=>{
 class MockWorker{static latest:MockWorker;terminated=false;onmessage?:(event:any)=>void;onerror?:(event:any)=>void;constructor(){MockWorker.latest=this;}postMessage(){}terminate(){this.terminated=true;}}
 const prior=globalThis.Worker;globalThis.Worker=MockWorker as unknown as typeof Worker;
 try{
  const session=createDiagramSpatialPreviewSession({} as DiagramPose),frame=session.frame({yaw:0,elevation:0}),project=session.project({yaw:0,elevation:0});
  MockWorker.latest.onmessage?.({data:{ok:false,message:'输入材料无效'}});
  for(const pending of [session.ready,frame,project])await assert.rejects(pending,/输入材料无效/);
  assert.equal(MockWorker.latest.terminated,true);await assert.rejects(session.frame({yaw:0,elevation:0}),/关闭/);
 }finally{globalThis.Worker=prior;}
});
