import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startDiagramGeometry} from '../../src/app/diagramGeometryTask';
import {blankDoc} from '../../src/app/state';
import {Worker as NativeWorker} from 'node:worker_threads';
import {once} from 'node:events';
import {computeFlatFold} from '../../src/core/flatFold';
import type {DiagramPose} from '../../src/app/diagramProject';

test('manual cancellation terminates a geometry worker and cannot publish a late completion',async()=>{
  const previous=globalThis.Worker;
  class FakeWorker {
    static last:FakeWorker;
    onmessage:((event:{data:unknown})=>void)|null=null;terminated=0;request:unknown;
    constructor(){FakeWorker.last=this;}
    postMessage(request:unknown){this.request=request;}
    terminate(){this.terminated++;}
  }
  globalThis.Worker=FakeWorker as unknown as typeof Worker;
  try{
    const doc=blankDoc('停止测试',100,100),progress:number[]=[];
    const task=startDiagramGeometry('prepare',[doc,doc],n=>progress.push(n));
    const worker=FakeWorker.last;
    worker.onmessage!({data:{type:'progress',operations:2_000_001}});
    const stopped=assert.rejects(task.promise,{name:'AbortError'});
    task.cancel();task.cancel();await stopped;
    worker.onmessage!({data:{type:'result',value:{}}});
    worker.onmessage!({data:{type:'progress',operations:4_000_000}});
    assert.equal(worker.terminated,1);assert.deepEqual(progress,[2_000_001]);
  }finally{globalThis.Worker=previous;}
});

test('a real geometry thread reports progress, remains cancellable inside long loops and leaves its source untouched',async()=>{
  const previous=globalThis.Worker;
  class Adapter {
    static last:Adapter;
    native=new NativeWorker(new URL('../fixtures/diagramGeometryThread.mjs',import.meta.url));
    onmessage:((event:{data:unknown})=>void)|null=null;
    onerror:((event:{message:string})=>void)|null=null;
    constructor(){Adapter.last=this;this.native.on('message',data=>this.onmessage?.({data}));this.native.on('error',error=>this.onerror?.({message:error.message}));}
    postMessage(request:unknown){this.native.postMessage(request);}
    terminate(){void this.native.terminate();}
  }
  globalThis.Worker=Adapter as unknown as typeof Worker;
  try{
    const doc=blankDoc('线程停止',100,100),source=JSON.stringify(doc);
    const preparation=startDiagramGeometry('prepare',[doc,doc]);
    const normalExit=once(Adapter.last.native,'exit');
    assert.equal((await preparation.promise).activeFold,false);await normalExit;
    const pose:DiagramPose={sourceStateId:'source',sourceRevision:0,sourceDoc:doc,result:computeFlatFold(doc)};
    const after={...doc,segments:[...doc.segments,...Array.from({length:40_001},(_,i)=>({id:'m'+i,a:[0,(i+1)/401] as [number,number],b:[100,(i+1)/401] as [number,number],assignment:'M' as const,angle:-180}))]};
    let progress=0;
    const task=startDiagramGeometry('project',[pose,doc,after],count=>{progress=count;task.cancel();});
    const exit=once(Adapter.last.native,'exit');
    await assert.rejects(task.promise,{name:'AbortError'});await exit;
    assert.ok(progress>0);assert.equal(JSON.stringify(doc),source);
  }finally{globalThis.Worker=previous;}
});
