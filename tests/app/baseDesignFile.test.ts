import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBaseDesignFile,prepareBaseDesignFile} from '../../src/app/baseDesignFile';
import {newBaseDesign} from '../../src/app/baseDesign';

test('design file preparation preserves every editable field and still requires complete topology',async()=>{
 const project=newBaseDesign('tree');if(project.kind!=='tree')assert.fail('tree');project.model.edges[0].length=3.75;
 assert.deepEqual(await prepareBaseDesignFile(JSON.stringify(project)),{type:'design',project});
 project.model.edges[0].nodes[0]=9999;assert.throws(()=>parseBaseDesignFile(JSON.stringify(project)),/节点不存在/);
 assert.throws(()=>parseBaseDesignFile('{bad'),/有效的设计工程/);assert.throws(()=>parseBaseDesignFile('{}'),/不是基础形设计/);
 const box=newBaseDesign('box');assert.deepEqual(parseBaseDesignFile(JSON.stringify(box.model)),{type:'box'},'native BPS importer retains responsibility for its source');
});

test('large file parsing stays in its worker and cancellation terminates the active read',async()=>{
 const original=globalThis.Worker,workers:any[]=[];
 class MockWorker {
  onmessage:any;onerror:any;onmessageerror:any;terminated=0;posted:string[]=[];
  constructor(){workers.push(this);}terminate(){this.terminated++;}postMessage(text:string){this.posted.push(text);}
 }
 try{
  globalThis.Worker=MockWorker as any;
  const controller=new AbortController(),text='invalid but deferred '.repeat(8192),pending=prepareBaseDesignFile(text,controller.signal);
  assert.equal(workers.length,1);assert.equal(workers[0].posted[0],text);
  controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(workers[0].terminated,1);
  const project=newBaseDesign('tree'),next=prepareBaseDesignFile(text);
  workers[1].onmessage({data:{result:{type:'design',project}}});assert.deepEqual(await next,{type:'design',project});assert.equal(workers[1].terminated,1);
  const aborted=new AbortController();aborted.abort();await assert.rejects(prepareBaseDesignFile(text,aborted.signal),{name:'AbortError'});assert.equal(workers.length,2);
 }finally{globalThis.Worker=original;}
});

test('worker file errors reject without a main-thread fallback or partial project',async()=>{
 const original=globalThis.Worker,workers:any[]=[];
 class MockWorker {onmessage:any;onerror:any;onmessageerror:any;terminated=0;constructor(){workers.push(this);}terminate(){this.terminated++;}postMessage(){}}
 try{
  globalThis.Worker=MockWorker as any;
  for(const kind of ['validation','runtime','clone']){
   const pending=prepareBaseDesignFile(' '.repeat(128*1024)),worker=workers.at(-1);
   if(kind==='validation')worker.onmessage({data:{error:'骨架无效'}});
   if(kind==='runtime')worker.onerror({message:'线程异常'});
   if(kind==='clone')worker.onmessageerror();
   await assert.rejects(pending);assert.equal(worker.terminated,1);
  }
 }finally{globalThis.Worker=original;}
});

test('actual design file worker preserves the complete design and rejects invalid topology',async()=>{
 const scope=globalThis as any,oldMessage=scope.onmessage,oldPost=scope.postMessage,replies:any[]=[];
 try{
  scope.postMessage=(reply:unknown)=>replies.push(reply);await import('../../src/workers/baseDesignFile.worker');
  const project=newBaseDesign('tree');scope.onmessage({data:JSON.stringify(project)});assert.deepEqual(replies[0],{result:{type:'design',project}});
  if(project.kind!=='tree')assert.fail('tree');project.model.edges[0].nodes[0]=9999;scope.onmessage({data:JSON.stringify(project)});
  assert.match(replies[1].error,/节点不存在/);assert.equal(Object.hasOwn(replies[1],'result'),false);
 }finally{scope.onmessage=oldMessage;scope.postMessage=oldPost;}
});
