import test from 'node:test';
import assert from 'node:assert/strict';

test('web recovery summary uses IDB getKey while the old GET and POST retain their body semantics',async()=>{
 const globals=globalThis as any,prior=Object.fromEntries(['indexedDB','IDBKeyRange','window','navigator'].map(key=>[key,Object.getOwnPropertyDescriptor(globals,key)]));
 const records=new Map<string,unknown>();let valueReads=0,keyReads=0;
 const db={onversionchange:null,close(){},transaction(){
  const tx:any={oncomplete:null,onabort:null,error:null};
  const read=(value:()=>unknown)=>{const request:any={result:undefined,onsuccess:null,onerror:null};queueMicrotask(()=>{request.result=value();request.onsuccess?.();queueMicrotask(()=>tx.oncomplete?.());});return request;};
  tx.objectStore=()=>({get(key:string){valueReads++;return read(()=>records.get(key));},getKey(key:string){keyReads++;return read(()=>records.has(key)?key:undefined);},openCursor(){return read(()=>undefined);},put(value:unknown,key:string){records.set(key,value);},delete(key:string){records.delete(key);}});return tx;
 }};
 try{
  Object.defineProperty(globals,'window',{configurable:true,value:{addEventListener(){},dispatchEvent(){}}});
  Object.defineProperty(globals,'navigator',{configurable:true,value:{locks:{request:async(_name:string,_options:unknown,callback:(lock:unknown)=>Promise<unknown>)=>callback({})}}});
  Object.defineProperty(globals,'IDBKeyRange',{configurable:true,value:{bound:()=>({})}});
  Object.defineProperty(globals,'indexedDB',{configurable:true,value:{open(){const request:any={result:db,onsuccess:null,onerror:null};queueMicrotask(()=>request.onsuccess?.());return request;}}});
  const {browserRequest}=await import('../../src/app/browserApi');
  assert.deepEqual(await browserRequest('recovery?summary=1','GET'),{exists:false,revision:null});assert.equal(valueReads,0);
  records.set('recovery',Object.defineProperty({},'doc',{get(){throw Error('Summary read the large record value');},enumerable:true}));
  assert.deepEqual(await browserRequest('recovery?summary=1','GET'),{exists:true,revision:null});assert.equal(valueReads,0);assert.equal(keyReads,2);
  const doc={name:'网页原稿',paper:{width:100,height:100},segments:[],metadata:{retained:true}},saved={doc,projectId:null,baseRevision:null,updated:'2020-01-01T00:00:00.000Z'};records.set('recovery',saved);
  assert.deepEqual(await browserRequest('recovery','GET'),saved);assert.equal(valueReads,1);
  assert.deepEqual(await browserRequest('recovery','POST',{doc}),{ok:true});assert.deepEqual((records.get('recovery') as any).doc,doc);
  assert.deepEqual(await browserRequest('recovery?summary=1','GET'),{exists:true,revision:null});
 }finally{for(const [key,descriptor]of Object.entries(prior)){if(descriptor)Object.defineProperty(globals,key,descriptor);else delete globals[key];}}
});
