import test from 'node:test';
import assert from 'node:assert/strict';
import {api,connect,deleteProject} from '../../src/app/api';
test('worker contention retains status 429 and its message for automatic retry',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async()=>new Response(JSON.stringify({error:'正在计算，请稍后重试。'}),{status:429});
  await assert.rejects(api('tessellate',{family:'periodic'}),(error:unknown)=>{
   assert.ok(error instanceof Error);assert.equal(error.message,'正在计算，请稍后重试。');
   assert.equal((error as Error&{status:number}).status,429);return true;
  });
 }finally{globalThis.fetch=original;}
});
test('invalid geometry remains a rejected result rather than retryable worker contention',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async()=>new Response(JSON.stringify({error:'折痕几何无解。'}),{status:422});
  await assert.rejects(api('tessellate',{family:'periodic'}),(error:unknown)=>{
   assert.equal((error as Error&{status:number}).status,422);return true;
  });
 }finally{globalThis.fetch=original;}
});
test('project deletion uses the current session and DELETE without sending a document body',async t=>{
 const id='5238e5f3-b0cf-43ed-adfd-d074d803d9bf';
 const calls:{url:string;init?:RequestInit}[]=[];
 t.mock.method(globalThis,'fetch',async(url:string,init?:RequestInit)=>{
  calls.push({url,init});
  return new Response(JSON.stringify(url==='/api/health'?{token:'delete-session'}:{id,deleted:true}));
 });
 await connect();
 const controller=new AbortController();
 assert.deepEqual(await deleteProject(id,controller.signal),{id,deleted:true});
 assert.equal(calls.length,2);
 const removal=calls[1];assert.equal(removal.url,'/api/projects/'+id);
 assert.equal(removal.init?.method,'DELETE');assert.equal(removal.init?.body,undefined);
 assert.equal(new Headers(removal.init?.headers).get('X-Zhezhi-Token'),'delete-session');
 assert.equal(removal.init?.signal,controller.signal);
});
test('a rejected deletion preserves the server status and message for the confirmation dialog',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({error:'删除未完成，原文档已恢复。'}),{status:503}));
 await assert.rejects(deleteProject('5238e5f3-b0cf-43ed-adfd-d074d803d9bf'),(error:unknown)=>{
  assert.ok(error instanceof Error);assert.equal(error.message,'删除未完成，原文档已恢复。');
  assert.equal((error as Error&{status:number}).status,503);return true;
 });
});
