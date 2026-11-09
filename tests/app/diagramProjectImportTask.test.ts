import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startDiagramProjectImport,type DiagramProjectImportReply} from '../../src/app/diagramProjectImportTask';
import {createDiagramProject} from '../../src/app/diagramProject';
import {blankDoc} from '../../src/app/state';

function harness(){
  let terminated=0,sent:unknown;
  const worker={onmessage:null as ((event:{data:DiagramProjectImportReply})=>void)|null,onerror:null as ((event:{message:string})=>void)|null,onmessageerror:null as (()=>void)|null,
    postMessage(value:unknown){sent=value;},terminate(){terminated++;}};
  const file=new File(['not parsed on the main thread'],'large.diagram.json'),progress:string[]=[];
  // Confirm that starting the task never reads the file on this thread.
  file.text=()=>{throw Error('main-thread read');};
  const task=startDiagramProjectImport(file,message=>progress.push(message),()=>worker as unknown as Worker);
  return {file,worker,task,progress,get sent(){return sent;},get terminated(){return terminated;}};
}
test('passes only the file handle and reports preparation before delivering the project',async()=>{
  const h=harness(),project=createDiagramProject(blankDoc('新工程',100,100));
  assert.equal(h.sent,h.file);
  h.worker.onmessage!({data:{type:'progress',message:'正在整理折痕和步骤…'}});
  assert.deepEqual(h.progress,['正在整理折痕和步骤…']);assert.equal(h.terminated,0);
  h.worker.onmessage!({data:{type:'result',project}});
  assert.equal(await h.task.promise,project);assert.equal(h.terminated,1);
});
test('cancel terminates synchronous work and ignores a queued result',async()=>{
  const h=harness(),rejected=assert.rejects(h.task.promise,{name:'AbortError'});
  h.task.cancel();h.task.cancel();
  h.worker.onmessage!({data:{type:'result',project:createDiagramProject(blankDoc('旧结果',100,100))}});
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
