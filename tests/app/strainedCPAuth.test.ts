import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {connect} from '../../src/app/api';
import {requestStrainTQPreview,strainTQSourceMatches} from '../../src/app/strainTQDesignCP';
import {requestRotationalPleatsCP,rotationalPleatsCPSourceMatches} from '../../src/app/rotationalPleatsCP';

// These response mocks verify client protocol only. Real HTTP and actual App
// acceptance have separate evidence; fixture geometry is not machine proof.
const tq=JSON.parse(readFileSync(new URL('../fixtures/strain-tq-source-1012.json',import.meta.url),'utf8')).cases.find((r:any)=>r.name==='pleat-free');
const rot=JSON.parse(readFileSync(new URL('../fixtures/rotational-pleats-engineering-roots-1012.json',import.meta.url),'utf8')).cases.rectangle;
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const header=(init:RequestInit|undefined,name:string)=>new Headers(init?.headers).get(name);

test('TQ standalone caller initializes its own session before authenticated native POST',async t=>{
 const calls:{url:string;init?:RequestInit}[]=[],controller=new AbortController();
 t.mock.method(globalThis,'fetch',async(input:any,init?:RequestInit)=>{const url=String(input);calls.push({url,init});if(url==='/api/health')return reply({token:'tq-independent-worker'});assert.equal(url,'/api/tessellation/strain-tq-practical');assert.equal(init?.method,'POST');assert.equal(header(init,'X-Zhezhi-Token'),'tq-independent-worker');assert.equal(header(init,'Content-Type'),'application/json');assert.deepEqual(JSON.parse(String(init?.body)),tq.query);assert.ok(init?.signal instanceof AbortSignal);return reply(tq.minimum);});
 const p=await requestStrainTQPreview(tq.recipe,controller.signal);assert.ok(strainTQSourceMatches(p.doc));assert.deepEqual(calls.map(c=>c.url),['/api/health','/api/tessellation/strain-tq-practical']);const postSignal=calls[1].init!.signal!;assert.equal(postSignal.aborted,false);controller.abort();assert.equal(postSignal.aborted,true,'caller abort remains linked through apiWhenIdle composed signal');
});

test('Rot refreshes current environment authentication even after main connect, then prepares real core CP',async t=>{
 let health=0;const calls:{url:string;init?:RequestInit}[]=[];const controller=new AbortController();
 t.mock.method(globalThis,'fetch',async(input:any,init?:RequestInit)=>{const url=String(input);calls.push({url,init});if(url==='/api/health')return reply({token:++health===1?'rot-main-old':'rot-current-runtime'});assert.equal(url,'/api/tessellation/rotational-pleats-strain');assert.equal(header(init,'X-Zhezhi-Token'),'rot-current-runtime');assert.equal(init?.method,'POST');assert.deepEqual(JSON.parse(String(init?.body)),rot.query);return reply(rot);});
 await connect();const p=await requestRotationalPleatsCP(JSON.parse(rot.query.sourceKey),controller.signal);assert.ok(rotationalPleatsCPSourceMatches(p.doc));assert.equal(health,2);const s=calls.at(-1)!.init!.signal!;controller.abort();assert.equal(s.aborted,true);
});

test('both helpers reject already cancelled input without health or POST requests',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('cancelled input must not call fetch');});
 for(const call of [(s:AbortSignal)=>requestStrainTQPreview(tq.recipe,s),(s:AbortSignal)=>requestRotationalPleatsCP(JSON.parse(rot.query.sourceKey),s)]){const c=new AbortController();c.abort(new DOMException('caller cancelled','AbortError'));await assert.rejects(call(c.signal),{name:'AbortError'});}assert.equal(calls,0);
});

test('cancelling during Worker health initialization forbids the subsequent native POST',async t=>{
 const controller=new AbortController();let started!:()=>void,release!:()=>void;const began=new Promise<void>(r=>{started=r;}),gate=new Promise<void>(r=>{release=r;});let posts=0;
 t.mock.method(globalThis,'fetch',async(input:any)=>{if(String(input)==='/api/health'){started();await gate;return reply({token:'cancelled-worker-session'});}posts++;throw Error('cancelled worker must not POST');});
 const pending=requestStrainTQPreview(tq.recipe,controller.signal);await began;controller.abort(new DOMException('worker replaced','AbortError'));release();await assert.rejects(pending,{name:'AbortError'});assert.equal(posts,0);
});

test('local service connection and native domain failures propagate without a stale prepared result',async t=>{
 const mock=t.mock.method(globalThis,'fetch',async()=>{throw new TypeError('network unavailable');});await assert.rejects(requestStrainTQPreview(tq.recipe),/本地服务未连接/);mock.mock.restore();
 const nativeMock=t.mock.method(globalThis,'fetch',async(input:any)=>String(input)==='/api/health'?reply({token:'domain-error-session'}):reply({error:'原约束当前无有效工程解'},422));await assert.rejects(requestStrainTQPreview(tq.recipe),(e:any)=>e.status===422&&e.message==='原约束当前无有效工程解');await assert.rejects(requestRotationalPleatsCP(JSON.parse(rot.query.sourceKey)),(e:any)=>e.status===422&&e.message==='原约束当前无有效工程解');nativeMock.mock.restore();
 t.mock.method(globalThis,'fetch',async(input:any)=>String(input)==='/api/health'?reply({token:'rejected-session'}):reply({error:'本地请求校验未通过'},403));await assert.rejects(requestStrainTQPreview(tq.recipe),(e:any)=>e.status===403&&e.message==='本地请求校验未通过');await assert.rejects(requestRotationalPleatsCP(JSON.parse(rot.query.sourceKey)),(e:any)=>e.status===403&&e.message==='本地请求校验未通过');
});

test('authenticated busy native request waits and retries identical current query',async t=>{
 let health=0,posts=0;const bodies:string[]=[];
 t.mock.method(globalThis,'fetch',async(input:any,init?:RequestInit)=>{if(String(input)==='/api/health'){health++;return reply({token:'busy-worker-session'});}assert.equal(header(init,'X-Zhezhi-Token'),'busy-worker-session');bodies.push(String(init?.body));return ++posts===1?reply({error:'已有镶嵌计算正在进行，请等待或取消后重试。'},409):reply(tq.minimum);});
 const p=await requestStrainTQPreview(tq.recipe);assert.ok(strainTQSourceMatches(p.doc));assert.equal(health,1);assert.equal(posts,2);assert.equal(bodies[0],bodies[1]);
});

test('cancellation while waiting for a busy lease stops further authenticated POSTs',async t=>{
 const controller=new AbortController();let posts=0;
 t.mock.method(globalThis,'fetch',async(input:any)=>{if(String(input)==='/api/health')return reply({token:'busy-cancel-session'});posts++;setTimeout(()=>controller.abort(new DOMException('newer input','AbortError')),20);return reply({error:'已有镶嵌计算正在进行，请等待或取消后重试。'},409);});
 await assert.rejects(requestStrainTQPreview(tq.recipe,controller.signal),{name:'AbortError'});assert.equal(posts,1);
});
