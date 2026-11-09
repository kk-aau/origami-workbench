import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startCPProcessingPreview} from '../../src/app/cpProcessingTask';
import {blankDoc} from '../../src/app/state';

test('加工预览取消真正终止计算线程，迟到结果不会覆盖取消，也不修改原工程',async()=>{
  const old=globalThis.Worker,doc=blankDoc('取消'),before=structuredClone(doc);
  let current:FakeWorker|undefined;
  class FakeWorker {
    onmessage?: (event:any)=>void;onerror?: (event:any)=>void;onmessageerror?:()=>void;terminated=0;request:any;
    constructor(){current=this;}
    postMessage(request:unknown){this.request=request;}
    terminate(){this.terminated++;}
  }
  globalThis.Worker=FakeWorker as unknown as typeof Worker;
  try {
    const task=startCPProcessingPreview({doc,options:{}}),worker=current!;
    assert.notEqual(worker.request.doc,doc);task.cancel();task.cancel();
    worker.onmessage?.({data:{status:'error',message:'迟到错误'}});
    assert.equal((await task.promise).status,'cancelled');assert.equal(worker.terminated,1);
    assert.deepEqual(doc,before);
  }finally{globalThis.Worker=old;}
});
test('加工预览时限及线程错误有明确状态且不会交付部分文件',async()=>{
  const old=globalThis.Worker;let current:any;
  class FakeWorker {onmessage?: (event:any)=>void;onerror?: (event:any)=>void;terminated=false;constructor(){current=this;}postMessage(){}terminate(){this.terminated=true;}}
  globalThis.Worker=FakeWorker as unknown as typeof Worker;
  try {
    const invalid=startCPProcessingPreview({doc:blankDoc(),options:{}},NaN);assert.equal((await invalid.promise).status,'error');
    const task=startCPProcessingPreview({doc:blankDoc(),options:{}});current.onerror({message:'测试错误'});
    assert.equal((await task.promise).status,'error');assert.equal(current.terminated,true);
    const timed=startCPProcessingPreview({doc:blankDoc(),options:{}},5);assert.equal((await timed.promise).status,'timeout');assert.equal(current.terminated,true);
  }finally{globalThis.Worker=old;}
});
