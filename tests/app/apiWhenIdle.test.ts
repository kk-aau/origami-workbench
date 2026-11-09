import test from 'node:test';
import assert from 'node:assert/strict';
import {apiWhenIdle} from '../../src/app/api';

test('an analysis request waits for the worker without changing its body and returns the result once',async t=>{
 const requests:string[]=[],statuses=[429,409,200],body={family:'archimedean-vertex-figure-native',vertexType:[3,4,6,4]};
 t.mock.method(globalThis,'fetch',async(_url:string,init:RequestInit)=>{requests.push(init.body as string);const status=statuses.shift()!;return new Response(JSON.stringify(status===200?{data:'actual-result'}:{error:'已有镶嵌计算正在进行，请等待或取消后重试。'}),{status});});
 assert.deepEqual(await apiWhenIdle('tessellation/archimedean-vertex-figure',body),{data:'actual-result'});
 assert.deepEqual(requests,Array(3).fill(JSON.stringify(body)));
});
test('closing a waiting analysis aborts before another request is sent',async t=>{
 const controller=new AbortController();let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(JSON.stringify({error:'已有镶嵌计算正在进行，请等待或取消后重试。'}),{status:409});});
 const pending=apiWhenIdle('tessellation/gore-data',{family:'gore-data-native'},controller.signal);
 setTimeout(()=>controller.abort(),25);await assert.rejects(pending,e=>e instanceof DOMException&&e.name==='AbortError');assert.equal(calls,1);
});
test('an actual invalid input is returned without busy retry',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(JSON.stringify({error:'原顶点图输入无效'}),{status:422});});
 await assert.rejects(apiWhenIdle('tessellation/archimedean-vertex-figure',{vertexType:[2]}),/原顶点图输入无效/);assert.equal(calls,1);
});
