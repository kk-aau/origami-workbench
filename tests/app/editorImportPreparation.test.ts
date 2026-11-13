import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {startProjectImport,startSavedProjectImport,type ProjectImportReply} from '../../src/app/projectImportTask';
import {getPreparedEditorSignature,registerPreparedEditorImport,type PreparedEditorImportData} from '../../src/app/editorImportPreparation';
import {artworkTransferChunks,ARTWORK_TRANSFER_TEXT} from '../../src/app/artworkImportTransfer';
import {prepareProjectImport,prepareSavedProjectImport} from '../../src/app/prepareProjectImport';
import {importDocument} from '../../src/core/formats';

function harness(){
  const worker={onmessage:null as ((event:{data:ProjectImportReply})=>void)|null,onerror:null as ((event:{message:string})=>void)|null,onmessageerror:null as (()=>void)|null,
    sent:[] as unknown[],terminated:0,postMessage(value:unknown){this.sent.push(value);},terminate(){this.terminated++;}};
  return {worker,factory:()=>worker as unknown as Worker};
}
function deliver(worker:ReturnType<typeof harness>['worker'],value:PreparedEditorImportData){
  worker.onmessage!({data:{type:'editor-begin'}});let index=0;
  for(const operations of artworkTransferChunks(value))worker.onmessage!({data:{type:'editor-chunk',index:index++,operations:structuredClone(operations)}});
  return ()=>worker.onmessage!({data:{type:'editor-complete',chunks:index}});
}

test('only the exact registered document reuses the Worker signature, while clones, edits and persisted flags cannot',()=>{
  const doc=blankDoc('精确来源'),signature=JSON.stringify(doc);
  assert.equal(getPreparedEditorSignature(doc),undefined);
  registerPreparedEditorImport({doc,warnings:[],signature});assert.equal(getPreparedEditorSignature(doc),signature);
  assert.equal(getPreparedEditorSignature(structuredClone(doc)),undefined);
  assert.equal(getPreparedEditorSignature({...doc,name:'已编辑'}),undefined);
  assert.equal(getPreparedEditorSignature({...doc,prepared:true,signature} as typeof doc),undefined);
  const saved=blankDoc('保存来源'),savedProject={draft:false,revision:'r',sourceSignature:JSON.stringify(saved),preparedSignature:JSON.stringify(saved),upgraded:false};
  registerPreparedEditorImport({doc:saved,warnings:[],savedProject});assert.equal(getPreparedEditorSignature(saved),savedProject.preparedSignature);
  for(const invalid of [
    {doc:blankDoc(),warnings:[]},
    {doc:blankDoc(),warnings:[],signature:''},
    {doc:blankDoc(),warnings:[5],signature:'text'},
    {doc:blankDoc(),warnings:[],savedProject:{...savedProject,revision:''}},
    {doc:blankDoc(),warnings:[],savedProject,signature:savedProject.preparedSignature},
  ])assert.throws(()=>registerPreparedEditorImport(invalid as PreparedEditorImportData));
});

test('metadata, warnings and encoded signature are bounded and stay detached until complete publication',async()=>{
  const h=harness(),doc=blankDoc('大元数据'),task=startProjectImport(new File(['{}'],'source.json'),true,undefined,h.factory);
  doc.metadata=JSON.parse('{"__proto__":{"retained":true},"source":"'+('保留😀'.repeat(ARTWORK_TRANSFER_TEXT))+'"}');
  const value={doc,warnings:['说明'.repeat(ARTWORK_TRANSFER_TEXT)],signature:JSON.stringify(doc)};
  let published=false;void task.promise.then(()=>{published=true;});const complete=deliver(h.worker,value);
  await Promise.resolve();assert.equal(published,false);assert.equal(getPreparedEditorSignature(doc),undefined);
  complete();const result=await task.promise;assert.equal(result.kind,'crease');if(result.kind!=='crease')return;
  assert.deepEqual(result.doc,doc);assert.deepEqual(result.warnings,value.warnings);
  assert.equal(getPreparedEditorSignature(result.doc),value.signature);assert.equal(getPreparedEditorSignature(doc),undefined);
  assert.equal(({} as {retained?:boolean}).retained,undefined);
  assert.ok(h.worker.sent.slice(1).every(value=>(value as {type?:string}).type==='continue-editor'));
});

test('cancel, mixed protocols, skipped and incomplete chunks cannot publish a prepared document',async()=>{
  const value={doc:blankDoc(),warnings:[],signature:JSON.stringify(blankDoc())};
  const cases:ProjectImportReply[][]=[
    [{type:'editor-chunk',index:0,operations:[{kind:'set',path:[],value}]}],
    [{type:'editor-begin'},{type:'editor-begin'}],
    [{type:'editor-begin'},{type:'editor-chunk',index:1,operations:[{kind:'set',path:[],value}]}],
    [{type:'editor-begin'},{type:'editor-chunk',index:0,operations:[{kind:'object',path:[],count:1}]},{type:'editor-complete',chunks:1}],
    [{type:'editor-begin'},{type:'editor-complete',chunks:0}],
    [{type:'editor-begin'},{type:'result',result:{kind:'crease',doc:value.doc,warnings:[]}}],
    [{type:'editor-begin'},{type:'artwork-begin'}],
    [{type:'editor-begin'},{type:'crease-complete'}],
  ];
  for(const replies of cases){const h=harness(),task=startProjectImport(new File(['{}'],'broken.json'),true,undefined,h.factory);for(const data of replies)h.worker.onmessage!({data});await assert.rejects(task.promise);assert.equal(h.worker.terminated,1);}
  const h=harness(),task=startProjectImport(new File(['{}'],'cancel.json'),true,undefined,h.factory);
  h.worker.onmessage!({data:{type:'editor-begin'}});task.cancel();await assert.rejects(task.promise,{name:'AbortError'});
  const before=h.worker.sent.length;deliver(h.worker,value)();assert.equal(h.worker.sent.length,before);
  assert.equal(getPreparedEditorSignature(value.doc),undefined);assert.equal(h.worker.terminated,1);
});

test('saved Blob is forwarded lazily and missing or malformed prepared baselines are rejected',async()=>{
  const blob=new Blob(['not read on UI'],{type:'application/json'});blob.text=()=>{throw Error('UI must not read Blob');};
  const h=harness(),task=startSavedProjectImport(blob,undefined,h.factory);
  assert.equal((h.worker.sent[0] as {text:Blob}).text,blob);task.cancel();await assert.rejects(task.promise,{name:'AbortError'});
  const missing=harness(),bad=startSavedProjectImport('{}',undefined,missing.factory);
  deliver(missing.worker,{doc:blankDoc(),warnings:[],signature:'must not grant saved trust'})();await assert.rejects(bad.promise,/准备信息不完整/);
});

test('actual normal File and saved Blob Workers fully prepare all geometry and preserve exact large metadata and signatures',async()=>{
  const doc=blankDoc('实际完整准备',200,200);doc.segments.push({id:'horizontal',a:[0,100],b:[200,100],assignment:'V',angle:133},{id:'vertical',a:[100,0],b:[100,200],assignment:'M',angle:-72});
  doc.metadata={author:'元数据来源',payload:'原样😀'.repeat(60000)};
  const fileText=JSON.stringify(doc),savedText=JSON.stringify({doc,revision:'original-revision',draft:true});
  const scope=globalThis as any,oldMessage=scope.onmessage,oldPost=scope.postMessage;
  try{
    await import('../../src/workers/projectImport.worker');const handle=scope.onmessage as (event:{data:any})=>Promise<void>;
    for(const mode of ['file','blob'] as const){
      const replies:ProjectImportReply[]=[],worker={onmessage:null as ((event:{data:ProjectImportReply})=>void)|null,onerror:null as ((event:{message:string})=>void)|null,onmessageerror:null,
        postMessage(data:unknown){queueMicrotask(()=>{void handle({data}).catch(error=>this.onerror?.({message:String(error)}));});},terminate(){}};
      scope.postMessage=(reply:ProjectImportReply)=>{const data=structuredClone(reply);replies.push(data);queueMicrotask(()=>worker.onmessage?.({data}));};
      const task=mode==='file'?startProjectImport(new File([fileText],'source.json'),true,undefined,()=>worker as unknown as Worker):startSavedProjectImport(new Blob([savedText],{type:'application/json'}),undefined,()=>worker as unknown as Worker);
      const result=await task.promise;assert.equal(result.kind,'crease');if(result.kind!=='crease')return;
      const expected=mode==='file'?prepareProjectImport(importDocument(fileText,'json').doc,true):prepareSavedProjectImport(savedText).doc;
      assert.deepEqual(result.doc,expected);assert.equal(getPreparedEditorSignature(result.doc),JSON.stringify(expected));
      assert.ok(replies.filter(reply=>reply.type==='editor-chunk').length>4);
      assert.equal(replies.some(reply=>['crease-begin','crease-segments','result'].includes(reply.type)),false);
      if(mode==='blob'){
        const saved=prepareSavedProjectImport(savedText).savedProject;assert.deepEqual(result.savedProject,saved);
        assert.equal(result.savedProject?.upgraded,true,'real crossing upgrade must retain the original saved baseline');
      }
    }
    const bad=structuredClone(doc);bad.paper.width=-1;const replies:ProjectImportReply[]=[];scope.postMessage=(reply:ProjectImportReply)=>replies.push(reply);
    await handle({data:{file:new File([JSON.stringify(bad)],'bad.json'),prepare:true}});
    assert.equal(replies.at(-1)?.type,'error');assert.equal(replies.some(reply=>reply.type==='editor-begin'),false);
  }finally{scope.onmessage=oldMessage;scope.postMessage=oldPost;}
});
