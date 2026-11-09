import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {startOriconfigPreview,type OriconfigRequest,type OriconfigReply} from '../../src/app/oriconfigTask';
import {defaultToolShortcuts} from '../../src/app/toolShortcuts';
const zip=()=>zipSync({'hotkey.properties':strToU8('drawCreaseFreeAction=Q')});
test('preview freezes settings and transfers only a copied archive; cancellation ignores late completion',async()=>{
 const old=globalThis.Worker;let worker:FakeWorker;
 class FakeWorker {request?:OriconfigRequest;onmessage?: (e:{data:OriconfigReply})=>void;stops=0;constructor(){worker=this;}postMessage(r:OriconfigRequest,transfer:Transferable[]){assert.equal(transfer[0],r.bytes.buffer);this.request=structuredClone(r,{transfer});}terminate(){this.stops++;}}
 globalThis.Worker=FakeWorker as unknown as typeof Worker;
 try{const bytes=zip(),before=bytes.slice(),bindings=defaultToolShortcuts(),task=startOriconfigPreview(bytes,bindings);bindings['tool:line']='P';bytes[0]=0;assert.deepEqual(worker!.request!.bytes,before);assert.equal(worker!.request!.bindings['tool:line'],'L');assert.equal(bytes.byteLength,before.byteLength);task.cancel();task.cancel();worker!.onmessage!({data:{status:'complete',archive:{config:null,hotkeys:'',ignoredFiles:[],warnings:[]},hotkeys:null}});assert.equal((await task.promise).status,'cancelled');assert.equal(worker!.stops,1);}finally{globalThis.Worker=old;}
});
test('timeout and worker failures terminate once; invalid input never launches',async()=>{
 const old=globalThis.Worker;let launches=0,worker:FakeWorker;
 class FakeWorker {onerror?:(e:{message:string})=>void;onmessageerror?:()=>void;stops=0;constructor(){launches++;worker=this;}postMessage(){}terminate(){this.stops++;}}
 globalThis.Worker=FakeWorker as unknown as typeof Worker;
 try{
  assert.equal((await startOriconfigPreview(zip(),defaultToolShortcuts(),5).promise).status,'timeout');assert.equal(worker!.stops,1);
  for(const kind of ['error','message']as const){const task=startOriconfigPreview(zip(),defaultToolShortcuts());if(kind==='error')worker!.onerror!({message:'test'});else worker!.onmessageerror!();assert.equal((await task.promise).status,'error');assert.equal(worker!.stops,1);}
  const before=launches;for(const budget of [NaN,0,60001,Infinity])assert.equal((await startOriconfigPreview(zip(),defaultToolShortcuts(),budget).promise).status,'error');assert.equal((await startOriconfigPreview(new Uint8Array(),defaultToolShortcuts()).promise).status,'error');assert.equal(launches,before);
 }finally{globalThis.Worker=old;}
});
test('real worker module parses archives, previews conflicts and never turns absent hotkeys into a reset',async()=>{
 const scope=globalThis as unknown as {onmessage?:(e:{data:OriconfigRequest})=>void;postMessage?:(r:OriconfigReply)=>void},old=scope.onmessage,post=scope.postMessage;let reply:OriconfigReply;
 try{scope.postMessage=r=>reply=r;await import('../../src/workers/oriconfig.worker');const bindings=defaultToolShortcuts(),before=structuredClone(bindings);
  scope.onmessage!({data:{bytes:zip(),bindings}});assert.equal(reply!.status,'complete');if(reply!.status==='complete')assert.equal(reply!.hotkeys!.bindings!['tool:line'],'Q');
  scope.onmessage!({data:{bytes:zipSync({'config.json':strToU8('{"lineWidth":2}')}),bindings}});if(reply!.status==='complete'){assert.equal(reply!.hotkeys,null);assert.deepEqual(reply!.archive.config,{lineWidth:2});}else assert.fail('config preview failed');
  scope.onmessage!({data:{bytes:zipSync({'hotkey.properties':strToU8('unknownAction=Q')}),bindings}});if(reply!.status==='complete'){assert.equal(reply!.hotkeys!.bindings,null);assert.equal(reply!.hotkeys!.issues.length,1);}else assert.fail('conflict preview failed');
  scope.onmessage!({data:{bytes:new Uint8Array(22),bindings}});assert.equal(reply!.status,'error');assert.deepEqual(bindings,before);
 }finally{if(old)scope.onmessage=old;else delete scope.onmessage;if(post)scope.postMessage=post;else delete scope.postMessage;}
});
