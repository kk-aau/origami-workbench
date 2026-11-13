import test from 'node:test';
import assert from 'node:assert/strict';
import type {Doc} from '../../src/core/types';
import {blankDoc} from '../../src/app/state';
import {startSavedProjectImport} from '../../src/app/projectImportTask';
import {PROJECT_IMPORT_CHUNK,type ProjectImportReply,type SavedProjectImportInfo} from '../../src/app/projectImportProtocol';
import {createArtworkTransferReceiver} from '../../src/app/artworkImportTransfer';
import {getPreparedEditorSignature,type PreparedEditorImportData} from '../../src/app/editorImportPreparation';

function harness(){
  const worker={onmessage:null as ((event:{data:ProjectImportReply})=>void)|null,
    onerror:null as ((event:{message:string})=>void)|null,onmessageerror:null as (()=>void)|null,
    posted:[] as unknown[],terminated:0,postMessage(value:unknown){this.posted.push(value);},terminate(){this.terminated++;}};
  return {worker,factory:()=>worker as unknown as Worker};
}
function info(doc:Doc):SavedProjectImportInfo {
  return {draft:false,revision:'saved-revision',sourceSignature:JSON.stringify(doc),preparedSignature:JSON.stringify(doc),upgraded:false};
}

test('saved raw text and signatures survive ACK chunks, and publication waits for the exact final marker',async()=>{
  const {worker,factory}=harness(),source={...blankDoc('原保存稿'),extension:{keep:'顶层保留'}},savedProject=info(source);
  const text=JSON.stringify({doc:source,revision:savedProject.revision}),task=startSavedProjectImport(text,undefined,factory);
  assert.deepEqual(worker.posted,[{type:'prepare-saved-project',text}]);
  const {segments,...header}=source,current=blankDoc('当前仍保留');let published:Doc=current;
  const applied=task.promise.then(result=>{assert.equal(result.kind,'crease');if(result.kind==='crease')published=result.doc;return result;});
  worker.onmessage!({data:{type:'crease-begin',doc:header,count:segments.length,warnings:[],savedProject}});
  worker.onmessage!({data:{type:'crease-segments',offset:0,segments:segments.slice(0,2)}});
  await Promise.resolve();assert.equal(published,current);
  worker.onmessage!({data:{type:'crease-segments',offset:2,segments:segments.slice(2)}});
  await Promise.resolve();assert.equal(published,current);
  worker.onmessage!({data:{type:'crease-complete'}});
  assert.deepEqual(await applied,{kind:'crease',doc:source,warnings:[],savedProject});assert.deepEqual(published,source);
  assert.deepEqual(worker.posted.slice(1),Array.from({length:3},()=>({type:'continue-crease'})));
  assert.equal(worker.terminated,1);
  assert.equal(getPreparedEditorSignature(published),undefined,'legacy segment replies cannot grant prepared trust');
});

test('cancel, bad chunk order, truncation and worker failure leave the current saved document untouched and ignore late data',async()=>{
  const source=blankDoc('待打开'),savedProject=info(source),{segments,...header}=source;
  for(const cause of ['cancel','order','truncated','worker'] as const){
    const {worker,factory}=harness(),task=startSavedProjectImport(JSON.stringify({doc:source,revision:'r'}),undefined,factory);
    const current=blankDoc('原编辑工程');let published:Doc=current;
    const settled=task.promise.then(result=>{if(result.kind==='crease')published=result.doc;});
    worker.onmessage!({data:{type:'crease-begin',doc:header,count:segments.length,warnings:[],savedProject}});
    worker.onmessage!({data:{type:'crease-segments',offset:0,segments:segments.slice(0,2)}});
    if(cause==='cancel')task.cancel();
    if(cause==='order')worker.onmessage!({data:{type:'crease-segments',offset:0,segments:segments.slice(2)}});
    if(cause==='truncated')worker.onmessage!({data:{type:'crease-complete'}});
    if(cause==='worker')worker.onerror!({message:'memory allocation failed'});
    await assert.rejects(settled);assert.equal(published,current);assert.equal(worker.terminated,1);
    const sent=worker.posted.length;
    worker.onmessage!({data:{type:'crease-segments',offset:2,segments:segments.slice(2)}});
    worker.onmessage!({data:{type:'crease-complete'}});
    worker.onmessage!({data:{type:'result',result:{kind:'crease',doc:source,warnings:[],savedProject}}});
    assert.equal(worker.posted.length,sent);assert.equal(published,current);assert.equal(worker.terminated,1);
  }
});

test('a saved request rejects a missing baseline, invalid baseline metadata or another import result kind',async()=>{
  const doc=blankDoc(),savedProject=info(doc);
  for(const result of [
    {kind:'crease',doc,warnings:[]},
    {kind:'crease',doc,warnings:[],savedProject:{...savedProject,draft:'yes'}},
    {kind:'artwork',project:{}},
  ]){
    const {worker,factory}=harness(),task=startSavedProjectImport(JSON.stringify({doc,revision:'r'}),undefined,factory);
    worker.onmessage!({data:{type:'result',result} as ProjectImportReply});
    await assert.rejects(task.promise);assert.equal(worker.terminated,1);
  }
});

test('actual saved worker preserves a large source record and sends only one acknowledged chunk at a time',async t=>{
  const count=PROJECT_IMPORT_CHUNK*4+17;
  const source:Doc&{largeSourceRecord:{rows:string[]}}={schemaVersion:2,objects:[],name:'完整保存记录',paper:{width:count+1,height:2},
    segments:Array.from({length:count},(_,i)=>({id:'author-id-'+i,a:[i,0],b:[i,1],assignment:'V',angle:180})),
    metadata:{nativeExtras:{olderExtension:'仍在原处'},author:'来源作者'},
    largeSourceRecord:{rows:Array.from({length:4097},(_,i)=>'source-row-'+i+':'+('保留'.repeat(64)))}};
  const text=JSON.stringify({doc:source,draft:true,revision:'revision-full'}),scope=globalThis as any;
  const oldMessage=scope.onmessage,oldPost=scope.postMessage,replies:ProjectImportReply[]=[];
  const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
  try{
    scope.postMessage=(reply:ProjectImportReply)=>replies.push(structuredClone(reply));
    await import('../../src/workers/projectImport.worker');
    const handle=scope.onmessage as (event:{data:unknown})=>Promise<void>;
    const running=handle({data:{type:'prepare-saved-project',text}});
    await tick();
    const begin=replies.find(r=>r.type==='editor-begin');
    assert.ok(begin);assert.deepEqual(Object.keys(begin),['type']);assert.equal(replies.some(r=>r.type==='editor-chunk'),false);
    await handle({data:{type:'continue-editor'}});await tick();
    assert.equal(replies.filter(r=>r.type==='editor-chunk').length,1);
    const pausedCount=replies.length;await tick();assert.equal(replies.length,pausedCount,'a second chunk must not be queued before ACK');
    while(!replies.some(r=>r.type==='editor-complete')){
      await handle({data:{type:'continue-editor'}});await tick();
    }
    await running;
    const chunks=replies.filter((r):r is Extract<ProjectImportReply,{type:'editor-chunk'}>=>r.type==='editor-chunk');
    assert.ok(chunks.length>4);assert.deepEqual(chunks.map(c=>c.index),chunks.map((_,i)=>i));
    const receiver=createArtworkTransferReceiver();for(const chunk of chunks)receiver.receive(chunk.operations);
    const complete=receiver.finish() as PreparedEditorImportData;
    assert.deepEqual(complete.doc,source);assert.deepEqual((complete.doc as typeof source).largeSourceRecord,source.largeSourceRecord);
    assert.deepEqual(complete.savedProject,{draft:true,revision:'revision-full',sourceSignature:JSON.stringify(source),preparedSignature:JSON.stringify(source),upgraded:false});
    assert.equal(Object.hasOwn(complete,'signature'),false,'reuse the saved preparedSignature without a third copy');
    assert.equal(replies.at(-1)?.type,'editor-complete');
    await t.test('legacy saved records retain property order and exact baseline signatures through actual Worker and task ACK reconstruction',async()=>{
      const legacy:Doc&{authorExtension:{sourceId:string;labels:string[]}}={
        schemaVersion:2,name:'旧大工程的原始字段顺序',paper:{width:PROJECT_IMPORT_CHUNK*4+2,height:2},
        segments:Array.from({length:PROJECT_IMPORT_CHUNK*4+1},(_,i)=>({id:'legacy-author-'+i,a:[i,0],b:[i,1],assignment:'V',angle:180})),
        objects:[],authorExtension:{sourceId:'original-author-record',labels:['未知顶层字段保持位置']},
        metadata:{author:'原作者',nativeExtras:{alreadyStored:true}},
      };
      const originalSignature=JSON.stringify(legacy),delivered:ProjectImportReply[]=[];
      const worker={onmessage:null as ((event:{data:ProjectImportReply})=>void)|null,
        onerror:null as ((event:{message:string})=>void)|null,onmessageerror:null as (()=>void)|null,
        acknowledgments:0,terminated:0,
        postMessage(message:unknown){
          const data=structuredClone(message);
          if((data as {type?:string}).type==='continue-editor')this.acknowledgments++;
          queueMicrotask(()=>{void handle({data}).catch(error=>this.onerror?.({message:String(error)}));});
        },terminate(){this.terminated++;}};
      const previousPost=scope.postMessage;
      try{
        scope.postMessage=(reply:ProjectImportReply)=>{
          const data=structuredClone(reply);delivered.push(data);
          queueMicrotask(()=>worker.onmessage?.({data}));
        };
        const result=await startSavedProjectImport(JSON.stringify({doc:legacy,draft:false,revision:'legacy-record-revision'}),undefined,()=>worker as unknown as Worker).promise;
        assert.equal(result.kind,'crease');
        if(result.kind!=='crease')return;
        assert.ok(delivered.some(reply=>reply.type==='editor-begin'),'the real Worker must use the bounded full-record path');
        assert.equal(worker.acknowledgments,delivered.filter(reply=>reply.type==='editor-chunk').length+1);
        assert.equal(worker.terminated,1);
        assert.deepEqual(result.doc,legacy);
        assert.deepEqual(Object.keys(result.doc),Object.keys(legacy));
        assert.equal(JSON.stringify(result.doc),originalSignature,'recomputing after signature-cache eviction must still equal the saved baseline');
        assert.equal(JSON.stringify(result.doc),result.savedProject?.preparedSignature);
        assert.equal(result.savedProject?.preparedSignature,result.savedProject?.sourceSignature);
        assert.equal(result.savedProject?.upgraded,false);
        assert.equal(getPreparedEditorSignature(result.doc),result.savedProject?.preparedSignature);
        assert.deepEqual((result.doc as typeof legacy).authorExtension,legacy.authorExtension);
      }finally{scope.postMessage=previousPost;}
    });
    const beforeError=replies.length;await handle({data:{type:'prepare-saved-project',text:'{"doc":'}});
    const failed=replies.slice(beforeError);
    assert.equal(failed.at(-1)?.type,'error');
    assert.equal(failed.some(r=>!['stage','error'].includes(r.type)),false,'invalid input must not begin or publish a document');
  }finally{scope.onmessage=oldMessage;scope.postMessage=oldPost;}
});
