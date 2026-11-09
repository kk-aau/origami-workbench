import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startProjectImport,type ProjectImportReply} from '../../src/app/projectImportTask';
import {blankDoc,transformSelection} from '../../src/app/state';

function harness(){
  const fake={onmessage:null as ((e:{data:ProjectImportReply})=>void)|null,onerror:null as ((e:{message:string})=>void)|null,
    onmessageerror:null as (()=>void)|null,terminated:0,posted:[] as unknown[],
    terminate(){this.terminated++;},postMessage(data:unknown){this.posted.push(data);}};
  return {fake,factory:()=>fake as unknown as Worker};
}
test('large file is sent to worker without a byte gate; stage and prepared result are forwarded',async()=>{
  const {fake,factory}=harness(),stages:string[]=[],file=new File(['{}'],'large.json');
  Object.defineProperty(file,'size',{value:256*1024*1024});
  const task=startProjectImport(file,true,s=>stages.push(s),factory),doc=blankDoc();
  assert.deepEqual(fake.posted,[{file,prepare:true}]);
  fake.onmessage!({data:{type:'stage',message:'整理交点'}});
  fake.onmessage!({data:{type:'result',result:{kind:'crease',doc,warnings:[]}}});
  assert.deepEqual(await task.promise,{kind:'crease',doc,warnings:[]});
  assert.deepEqual(stages,['整理交点']);assert.equal(fake.terminated,1);
  task.cancel();assert.equal(fake.terminated,1);
});
test('cancel terminates the worker and ignores a late result or progress',async()=>{
  const {fake,factory}=harness(),stages:string[]=[];
  const task=startProjectImport(new File([''],'cancel.cp'),true,s=>stages.push(s),factory);
  task.cancel();await assert.rejects(task.promise,{name:'AbortError'});
  fake.onmessage!({data:{type:'stage',message:'late'}});
  fake.onmessage!({data:{type:'result',result:{kind:'crease',doc:blankDoc(),warnings:[]}}});
  assert.equal(fake.terminated,1);assert.deepEqual(stages,[]);
});
test('worker format errors and failures terminate without producing a replacement document',async()=>{
  for(const cause of ['format','worker','clone']){
    const {fake,factory}=harness(),task=startProjectImport(new File([''],'bad.cp'),false,undefined,factory);
    if(cause==='format')fake.onmessage!({data:{type:'error',message:'格式无效'}});
    if(cause==='worker')fake.onerror!({message:'资源不足'});
    if(cause==='clone')fake.onmessageerror!();
    await assert.rejects(task.promise);assert.equal(fake.terminated,1);
  }
});
test('chunked import remains pending until every real segment and the final marker arrive',async()=>{
  const {fake,factory}=harness(),doc=blankDoc(),{segments,...header}=doc;
  const task=startProjectImport(new File([''],'large.cp'),true,undefined,factory);
  let resolved=false;void task.promise.then(()=>{resolved=true;});
  fake.onmessage!({data:{type:'crease-begin',doc:header,count:segments.length,warnings:['完整警告']}});
  fake.onmessage!({data:{type:'crease-segments',offset:0,segments:segments.slice(0,2)}});
  await Promise.resolve();assert.equal(resolved,false);assert.equal(fake.terminated,0);
  fake.onmessage!({data:{type:'crease-segments',offset:2,segments:segments.slice(2)}});
  await Promise.resolve();assert.equal(resolved,false);
  fake.onmessage!({data:{type:'crease-complete'}});
  assert.deepEqual(await task.promise,{kind:'crease',doc,warnings:['完整警告']});
  assert.deepEqual(fake.posted.slice(1),Array.from({length:3},()=>({type:'continue-crease'})));
  assert.equal(fake.terminated,1);
});
test('cancelled partially received imports cannot replace the current document with a late chunk',async()=>{
  const {fake,factory}=harness(),{segments,...header}=blankDoc();
  const task=startProjectImport(new File([''],'cancel-large.cp'),true,undefined,factory);
  fake.onmessage!({data:{type:'crease-begin',doc:header,count:segments.length,warnings:[]}});
  fake.onmessage!({data:{type:'crease-segments',offset:0,segments:segments.slice(0,2)}});
  task.cancel();await assert.rejects(task.promise,{name:'AbortError'});
  const sent=fake.posted.length;
  fake.onmessage!({data:{type:'crease-segments',offset:2,segments:segments.slice(2)}});
  fake.onmessage!({data:{type:'crease-complete'}});
  assert.equal(fake.posted.length,sent);assert.equal(fake.terminated,1);
});
test('truncated, repeated, out-of-order and oversized import chunks are rejected atomically',async()=>{
  const {segments,...header}=blankDoc();
  for(const reply of [
    {type:'crease-complete'},
    {type:'crease-segments',offset:1,segments},
    {type:'crease-segments',offset:0,segments:[]},
    {type:'crease-segments',offset:0,segments:Array.from({length:4097},()=>segments[0])},
    {type:'crease-begin',doc:header,count:4,warnings:[]},
    {type:'result',result:{kind:'crease',doc:blankDoc(),warnings:[]}},
  ] satisfies ProjectImportReply[]){
    const {fake,factory}=harness(),task=startProjectImport(new File([''],'broken.cp'),true,undefined,factory);
    fake.onmessage!({data:{type:'crease-begin',doc:header,count:4,warnings:[]}});
    fake.onmessage!({data:reply});
    await assert.rejects(task.promise);assert.equal(fake.terminated,1);
  }
});
test('moving a selection beyond the JS argument limit preserves every segment',()=>{
  const doc=blankDoc();doc.segments=Array.from({length:70000},(_,i)=>({id:'s'+i,a:[i,0],b:[i,1],assignment:'V',angle:180}));
  const moved=transformSelection(doc,new Set(doc.segments.map(s=>s.id)),'move',1,2);
  assert.equal(moved.segments.length,70000);assert.deepEqual(moved.segments.at(-1)!.b,[70000,3]);
  assert.deepEqual(doc.segments.at(-1)!.b,[69999,1]);
});
