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
