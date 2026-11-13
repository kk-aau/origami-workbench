import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startDiagramProjectImport,type DiagramProjectImportReply,type DiagramProjectImportInput,type DiagramProjectImportRequest} from '../../src/app/diagramProjectImportTask';
import {createDiagramProject,exportDiagramProject,importDiagramProject,adoptDiagramPose,type DiagramProject} from '../../src/app/diagramProject';
import {blankDoc} from '../../src/app/state';
import {artworkTransferChunks,type ArtworkTransferOperation} from '../../src/app/artworkImportTransfer';
import {createDiagramProjectSaveBlob,getDiagramProjectSaveBlob} from '../../src/app/diagramProjectTransport';
import {normalizeDiagramProjectCP} from '../../src/app/diagramCP';
import {prepareExistingCreases} from '../../src/app/diagramProjectPreparation';
import {computeFlatFold} from '../../src/core/flatFold';

function harness(){
  let terminated=0,sent:unknown;const posted:unknown[]=[];
  const worker={onmessage:null as ((event:{data:DiagramProjectImportReply})=>void)|null,onerror:null as ((event:{message:string})=>void)|null,onmessageerror:null as (()=>void)|null,
    postMessage(value:unknown){sent=value;posted.push(value);},terminate(){terminated++;}};
  const file=new File(['not parsed on the main thread'],'large.diagram.json'),progress:string[]=[];
  // Confirm that starting the task never reads the file on this thread.
  file.text=()=>{throw Error('main-thread read');};
  const task=startDiagramProjectImport(file,message=>progress.push(message),()=>worker as unknown as Worker);
  return {file,worker,task,progress,posted,get sent(){return sent;},get terminated(){return terminated;}};
}
function deliver(h:ReturnType<typeof harness>,project:DiagramProject){
  h.worker.onmessage!({data:{type:'diagram-begin',saveBlob:createDiagramProjectSaveBlob(project)}});let index=0;
  for(const operations of artworkTransferChunks(project))h.worker.onmessage!({data:{type:'diagram-chunk',index:index++,operations:structuredClone(operations)}});
  return ()=>h.worker.onmessage!({data:{type:'diagram-complete',chunks:index}});
}
test('passes only the file handle and reports preparation before delivering the project',async()=>{
  const h=harness(),project=createDiagramProject(blankDoc('新工程',100,100));
  assert.equal(h.sent,h.file);
  h.worker.onmessage!({data:{type:'progress',message:'正在整理折痕和步骤…'}});
  assert.deepEqual(h.progress,['正在整理折痕和步骤…']);assert.equal(h.terminated,0);
  const complete=deliver(h,project);assert.equal(h.terminated,0);complete();
  const received=await h.task.promise;assert.deepEqual(received,project);assert.equal(h.terminated,1);
  assert.notEqual(received,project);assert.ok(getDiagramProjectSaveBlob(received));assert.equal(getDiagramProjectSaveBlob(project),undefined);
  assert.equal(getDiagramProjectSaveBlob(structuredClone(received)),undefined);
  assert.ok(h.posted.slice(1).every(value=>(value as {type?:string}).type==='continue-diagram'));
});
test('cancel terminates synchronous work and ignores a queued result',async()=>{
  const h=harness(),rejected=assert.rejects(h.task.promise,{name:'AbortError'});
  h.task.cancel();h.task.cancel();
  deliver(h,createDiagramProject(blankDoc('旧结果',100,100)))();
  h.worker.onmessage!({data:{type:'progress',message:'旧进度'}});
  await rejected;assert.equal(h.terminated,1);assert.deepEqual(h.progress,[]);
});
test('invalid files and worker transport failures reject without a replacement project',async()=>{
  for(const kind of ['validation','thread','transport'] as const){
    const h=harness(),rejected=assert.rejects(h.task.promise);
    if(kind==='validation')h.worker.onmessage!({data:{type:'error',message:'折序工程不是有效 JSON。'}});
    else if(kind==='thread')h.worker.onerror!({message:'worker failed'});
    else h.worker.onmessageerror!();
    await rejected;assert.equal(h.terminated,1);
  }
});
test('a file dispatch failure releases the worker',async()=>{
  let terminated=0;
  const worker={postMessage(){throw Error('dispatch failed');},terminate(){terminated++;}};
  const task=startDiagramProjectImport(new File(['{}'],'bad.json'),undefined,()=>worker as unknown as Worker);
  await assert.rejects(task.promise,/dispatch failed/);assert.equal(terminated,1);
});

test('worker creation errors are returned through the unchanged promise API',async()=>{
  const task=startDiagramProjectImport(new File(['{}'],'failed.json'),undefined,()=>{throw Error('creation failed');});
  await assert.rejects(task.promise,/creation failed/);task.cancel();
});

test('a partially received project remains unpublished and cancellation ignores every queued chunk',async()=>{
  const h=harness(),project=createDiagramProject(blankDoc('完整准备',100,100));
  h.worker.onmessage!({data:{type:'diagram-begin',saveBlob:createDiagramProjectSaveBlob(project)}});
  h.worker.onmessage!({data:{type:'diagram-chunk',index:0,operations:[{kind:'object',path:[],count:7}]}});
  assert.equal(h.terminated,0);assert.equal(getDiagramProjectSaveBlob(project),undefined);
  h.task.cancel();await assert.rejects(h.task.promise,{name:'AbortError'});
  h.worker.onmessage!({data:{type:'diagram-complete',chunks:1}});assert.equal(h.terminated,1);
});

test('duplicate, skipped, truncated, malformed and whole-project shortcut messages reject before publishing',async()=>{
  const project=createDiagramProject(blankDoc('旧工程',100,100)),begin:DiagramProjectImportReply={type:'diagram-begin',saveBlob:createDiagramProjectSaveBlob(project)};
  const incomplete:ArtworkTransferOperation[]=[{kind:'object',path:[],count:1}];
  const cases:unknown[][]=[
    [{type:'result',project}],
    [{type:'diagram-begin',saveBlob:{size:10,type:'application/json'}}],
    [begin,begin],
    [{type:'diagram-chunk',index:0,operations:incomplete}],
    [begin,{type:'diagram-chunk',index:1,operations:incomplete}],
    [begin,{type:'diagram-chunk',index:0,operations:incomplete},{type:'diagram-complete',chunks:1}],
    [begin,{type:'diagram-complete',chunks:0}],
    [begin,{type:'diagram-chunk',index:0,operations:[{kind:'set',path:[],value:{format:'zhezhi-diagram',version:1}}]},{type:'diagram-complete',chunks:1}],
    [begin,{type:'diagram-chunk',index:0,operations:[{kind:'set',path:[],value:project}]},{type:'diagram-complete',chunks:2}],
    [begin,{type:'diagram-chunk',index:0,operations:[{kind:'array',path:[],length:2},{kind:'items',path:[],offset:1,values:[1]}]}],
  ];
  for(const replies of cases){
    const h=harness(),rejected=assert.rejects(h.task.promise);
    for(const data of replies)h.worker.onmessage!({data:data as DiagramProjectImportReply});
    await rejected;assert.equal(h.terminated,1);
  }
});

test('an ACK dispatch failure rejects and releases a partially prepared import',async()=>{
  const h=harness(),project=createDiagramProject(blankDoc('确认失败',100,100));
  h.worker.postMessage=()=>{throw Error('ACK failed');};
  h.worker.onmessage!({data:{type:'diagram-begin',saveBlob:createDiagramProjectSaveBlob(project)}});
  await assert.rejects(h.task.promise,/ACK failed/);assert.equal(h.terminated,1);
});

test('actual file and stored-document Workers preserve complete normalization, models and large metadata through acknowledged batches',async()=>{
  const doc=blankDoc('完整折序',100,100);doc.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'V',angle:180});
  doc.metadata=JSON.parse('{"__proto__":{"data":true},"nested":{"encoded":"'+('保留😀'.repeat(30000))+'"}}');
  let project=createDiagramProject(doc);project=adoptDiagramPose(project,project.activeStepId,project.states[0].id,computeFlatFold(doc));
  project.steps[0].pose!.view!.rotation=37;project.steps[0].pose!.view!.side='back';
  const text=exportDiagramProject(project),expected=prepareExistingCreases(normalizeDiagramProjectCP(importDiagramProject(text)).project);
  const scope=globalThis as any,oldSelf=scope.self,oldMessage=scope.onmessage,oldPost=scope.postMessage;
  scope.self=scope;
  try{
    await import('../../src/workers/diagramProjectImport.worker');
    const handle=scope.onmessage as (event:{data:DiagramProjectImportRequest})=>Promise<void>;
    for(const mode of ['file','stored'] as const){
      const delivered:DiagramProjectImportReply[]=[],worker={onmessage:null as ((event:{data:DiagramProjectImportReply})=>void)|null,onerror:null as ((event:{message:string})=>void)|null,onmessageerror:null,terminated:0,acks:0,
        postMessage(data:DiagramProjectImportRequest){if('type' in data&&data.type==='continue-diagram')this.acks++;queueMicrotask(()=>{void handle({data}).catch(error=>this.onerror?.({message:String(error)}));});},terminate(){this.terminated++;}};
      scope.postMessage=(reply:DiagramProjectImportReply)=>{const data=structuredClone(reply);delivered.push(data);queueMicrotask(()=>worker.onmessage?.({data}));};
      const input:DiagramProjectImportInput=mode==='file'?new File([text],'complete.diagram.json'):{storedText:JSON.stringify({format:'zhezhi-diagram-library-document',version:1,project:JSON.parse(text),thumbnail:null})};
      const task=startDiagramProjectImport(input,undefined,()=>worker as unknown as Worker),received=await task.promise;
      assert.deepEqual(received,expected);assert.equal(worker.terminated,1);
      const chunks=delivered.filter(reply=>reply.type==='diagram-chunk');assert.ok(chunks.length>2);
      assert.equal(worker.acks,chunks.length+1);assert.equal(delivered.some(reply=>(reply as {type:string}).type==='result'),false);
      assert.deepEqual(JSON.parse(await getDiagramProjectSaveBlob(received)!.text()),JSON.parse(JSON.stringify(received)));
      assert.equal(({} as {data?:boolean}).data,undefined);assert.equal(Object.hasOwn(received.states[0].doc.metadata!,'__proto__'),true);
      assert.equal(received.steps[0].pose!.view!.rotation,37);assert.equal(received.steps[0].pose!.view!.side,'back');
    }
    for(const storedText of ['{bad',JSON.stringify({format:'zhezhi-diagram-library-document',version:1,project:JSON.parse(text),thumbnail:'x'.repeat(120001)})]){
      const replies:DiagramProjectImportReply[]=[];scope.postMessage=(reply:DiagramProjectImportReply)=>replies.push(reply);
      await handle({data:{storedText}});assert.equal(replies.at(-1)?.type,'error');assert.equal(replies.some(reply=>reply.type==='diagram-begin'),false);
    }
    const invalid=JSON.parse(text);invalid.states.at(-1).doc.paper.width=-1;
    const invalidReplies:DiagramProjectImportReply[]=[];scope.postMessage=(reply:DiagramProjectImportReply)=>invalidReplies.push(reply);
    await handle({data:new File([JSON.stringify(invalid)],'invalid.diagram.json')});
    assert.equal(invalidReplies.at(-1)?.type,'error');assert.equal(invalidReplies.some(reply=>reply.type==='diagram-begin'),false,'late invalid CP still fails before any replacement data');
    const held:DiagramProjectImportReply[]=[];scope.postMessage=(reply:DiagramProjectImportReply)=>held.push(reply);
    const pending=handle({data:new File([text],'ack.diagram.json')}),turn=()=>new Promise<void>(resolve=>setImmediate(resolve));
    await turn();assert.equal(held.at(-1)?.type,'diagram-begin');assert.equal(held.filter(reply=>reply.type==='diagram-chunk').length,0);
    await turn();assert.equal(held.filter(reply=>reply.type==='diagram-chunk').length,0,'Worker cannot send geometry before the header ACK');
    await handle({data:{type:'continue-diagram'}});await turn();
    assert.equal(held.filter(reply=>reply.type==='diagram-chunk').length,1);
    await turn();assert.equal(held.filter(reply=>reply.type==='diagram-chunk').length,1,'only one bounded geometry batch can be queued');
    while(held.at(-1)?.type!=='diagram-complete'){await handle({data:{type:'continue-diagram'}});await turn();}
    await pending;
  }finally{scope.self=oldSelf;scope.onmessage=oldMessage;scope.postMessage=oldPost;}
});
