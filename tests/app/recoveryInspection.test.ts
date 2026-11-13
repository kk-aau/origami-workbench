import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseRecovery} from '../../src/app/recovery';
import {inspectRecoveryBlobs,type RecoveryInspectionReply,type RecoveryCandidate} from '../../src/app/recoveryInspection';
import {startRecoveryInspection} from '../../src/app/recoveryInspectionTask';
import {exportDocument} from '../../src/core/formats';
import {blankDoc} from '../../src/app/state';

const id='11111111-1111-4111-8111-111111111111';
function fixture(name:string,updated='2020-01-01T00:00:00.000Z'){
 const doc=blankDoc(name);doc.metadata=JSON.parse('{"__proto__":{"retained":"own"},"constructor":"data","$ref":"metadata://unchanged","nested":[null,"中文😀"]}');
 return {doc,projectId:id,baseRevision:'a'.repeat(64),updated};
}
function harness(){const worker={onmessage:null as ((event:{data:RecoveryInspectionReply})=>void)|null,onerror:null as ((event:{message:string})=>void)|null,onmessageerror:null as (()=>void)|null,posted:[] as unknown[],terminated:0,postMessage(value:unknown){this.posted.push(value);},terminate(){this.terminated++;}};return {worker,factory:()=>worker as unknown as Worker};}

test('recovery inspection preserves existing source ordering, alternatives and full JSON backup bytes',async()=>{
 const server=fixture('本机副本'),browser=fixture('浏览器副本','2020-01-02T00:00:00.000Z');
 const expected=chooseRecovery(JSON.stringify(server),JSON.stringify(browser)),result=await inspectRecoveryBlobs(new Blob([JSON.stringify(server)]),new Blob([JSON.stringify(browser)]));
 assert.deepEqual(result.warnings,expected.warnings);assert.equal(result.recovery?.source,'browser');assert.equal(result.alternatives[0].source,'server');
 assert.deepEqual(Object.keys(result).sort(),['alternatives','recovery','warnings'],'successful reads keep the old result keys');
 for(const [candidate,snapshot]of [[result.recovery!,expected.recovery!],[result.alternatives[0],expected.alternatives[0]]] as const){
  assert.deepEqual(JSON.parse(await candidate.restore.text()),{doc:snapshot.doc,revision:'recovery',draft:true});
  assert.equal(await candidate.backup.text(),exportDocument(snapshot.doc,'json').text);assert.equal(candidate.name,snapshot.doc.name);
  assert.equal(candidate.projectId,snapshot.projectId);assert.equal(candidate.baseRevision,snapshot.baseRevision);assert.equal(candidate.updated,snapshot.updated);
  assert.equal(Object.hasOwn(candidate,'doc'),false);assert.equal(Object.hasOwn(candidate,'signature'),false);
  const restored=JSON.parse(await candidate.restore.text());assert.equal(Object.hasOwn(restored.doc.metadata,'__proto__'),true);
 }
 assert.equal(({} as {retained?:string}).retained,undefined);
});

test('malformed sources, invalid metadata and duplicate snapshots retain chooseRecovery decisions',async()=>{
 const valid=JSON.stringify(fixture('有效稿'));
 for(const [server,browser]of [[null,null],['{broken',valid],[valid,valid],[JSON.stringify({...fixture('无效编号'),projectId:'bad',baseRevision:'bad',updated:'3020-02-30'}),null],[JSON.stringify({doc:{invalid:true}}),null]] as const){
  const expected=chooseRecovery(server,browser),result=await inspectRecoveryBlobs(server===null?null:new Blob([server]),browser===null?null:new Blob([browser]));
  assert.deepEqual(result.warnings,expected.warnings);assert.equal(result.recovery?.source,expected.recovery?.source);assert.equal(result.alternatives.length,expected.alternatives.length);
  if(result.recovery){assert.deepEqual(JSON.parse(await result.recovery.restore.text()).doc,expected.recovery!.doc);assert.equal(result.recovery.projectId,expected.recovery!.projectId);}
 }
});

test('main-thread client passes only immutable Blob handles and accepts only small metadata replies',async()=>{
 const {worker,factory}=harness(),server=new Blob(['not read by UI']);server.text=()=>{throw Error('UI must not read recovery text');};
 const task=startRecoveryInspection(server,null,factory);assert.deepEqual(worker.posted,[{server,browser:null}]);
 const result={recovery:null,alternatives:[],warnings:['保留提示']};worker.onmessage!({data:{type:'result',choice:result}});
 assert.deepEqual(await task.promise,result);assert.equal(worker.terminated,1);
});

test('cancellation, failed Workers and invalid complete replies never publish a candidate',async()=>{
 const valid:RecoveryCandidate={name:'候选',source:'server',restore:new Blob(['restore']),backup:new Blob(['backup'])};
 for(const cause of ['cancel','worker','clone','error','doc-tree','empty-blob','bad-source']){
  const {worker,factory}=harness(),task=startRecoveryInspection(null,null,factory);
  if(cause==='cancel')task.cancel();
  else if(cause==='worker')worker.onerror!({message:'线程不可用'});
  else if(cause==='clone')worker.onmessageerror!();
  else if(cause==='error')worker.onmessage!({data:{type:'error',message:'保留原稿'}});
  else{const candidate:any={...valid};if(cause==='doc-tree')candidate.doc=blankDoc();if(cause==='empty-blob')candidate.restore=new Blob();if(cause==='bad-source')candidate.source='other';worker.onmessage!({data:{type:'result',choice:{recovery:candidate,alternatives:[],warnings:[]}}});}
  await assert.rejects(task.promise);assert.equal(worker.terminated,1);worker.onmessage!({data:{type:'result',choice:{recovery:valid,alternatives:[],warnings:[]}}});assert.equal(worker.terminated,1);
 }
});

test('actual inspection Worker returns Blob contents and reports an unread source without declaring it absent',async()=>{
 const scope=globalThis as any,oldMessage=scope.onmessage,oldPost=scope.postMessage,replies:RecoveryInspectionReply[]=[];
 try{
  scope.postMessage=(reply:RecoveryInspectionReply)=>replies.push(structuredClone(reply));await import('../../src/workers/recoveryInspection.worker');
  const source=fixture('后台恢复');await scope.onmessage({data:{server:new Blob([JSON.stringify(source)]),browser:null}});
  const result=replies[0];assert.equal(result.type,'result');if(result.type!=='result')assert.fail('Expected result');
  assert.equal(Object.hasOwn(result.choice.recovery!,'doc'),false);assert.deepEqual(JSON.parse(await result.choice.recovery!.restore.text()).doc,source.doc);
  const broken=new Blob();broken.text=async()=>{throw Error('读取失败');};await scope.onmessage({data:{server:broken,browser:null}});
  const unread=replies[1];assert.equal(unread.type,'result');if(unread.type!=='result')assert.fail('Expected incomplete inspection result');
  assert.equal(unread.choice.recovery,null);assert.deepEqual(unread.choice.unreadableSources,['server']);assert.match(unread.choice.warnings[0],/本机磁盘.*尚未读取.*原件已保留/);
 }finally{scope.onmessage=oldMessage;scope.postMessage=oldPost;}
});

test('one failed Blob read preserves the complete other source and reads each source exactly once',async()=>{
 const source=fixture('独立有效稿');
 for(const failedSource of ['server','browser'] as const){
  let failedReads=0,validReads=0;
  const broken=new Blob(['unread bytes']),valid=new Blob([JSON.stringify(source)]);
  broken.text=failedSource==='server'?(()=>{failedReads++;throw Error('同步读取失败');}):(async()=>{failedReads++;throw Error('异步读取失败');});
  valid.text=async()=>{validReads++;return JSON.stringify(source);};
  const result=await inspectRecoveryBlobs(failedSource==='server'?broken:valid,failedSource==='server'?valid:broken);
  assert.deepEqual(result.unreadableSources,[failedSource]);assert.equal(failedReads,1);assert.equal(validReads,1);
  assert.equal(result.recovery?.source,failedSource==='server'?'browser':'server');assert.equal(result.alternatives.length,0);
  assert.deepEqual(JSON.parse(await result.recovery!.restore.text()),{doc:source.doc,revision:'recovery',draft:true});
  assert.equal(await result.recovery!.backup.text(),exportDocument(source.doc,'json').text);
  assert.equal(result.recovery!.projectId,source.projectId);assert.equal(result.recovery!.baseRevision,source.baseRevision);
  assert.match(result.warnings.at(-1)!,failedSource==='server'?/本机磁盘.*尚未读取.*原件已保留/:/浏览器.*尚未读取.*原件已保留/);
  assert.equal(broken.size,12,'inspection cannot replace or erase the unread input Blob');
 }
});

test('two failed Blob reads return an explicit incomplete empty choice with both original sources protected',async()=>{
 const server=new Blob(['server original']),browser=new Blob(['browser original']);let serverReads=0,browserReads=0;
 server.text=async()=>{serverReads++;throw Error('server unavailable');};browser.text=async()=>{browserReads++;throw Error('browser unavailable');};
 const result=await inspectRecoveryBlobs(server,browser);
 assert.equal(result.recovery,null);assert.deepEqual(result.alternatives,[]);assert.deepEqual(result.unreadableSources,['server','browser']);
 assert.equal(result.warnings.length,2);assert.match(result.warnings[0],/本机磁盘.*尚未读取/);assert.match(result.warnings[1],/浏览器.*尚未读取/);
 assert.equal(serverReads,1);assert.equal(browserReads,1);
});

test('task accepts unique unreadable-source metadata, rejects malformed metadata and ignores a late partial result after cancel',async()=>{
 for(const unreadableSources of [['server'],['browser'],['server','browser']] as const){
  const h=harness(),task=startRecoveryInspection(null,null,h.factory),choice={recovery:null,alternatives:[],warnings:['尚未读取，原件保留'],unreadableSources:[...unreadableSources]};
  h.worker.onmessage!({data:{type:'result',choice}});assert.deepEqual(await task.promise,choice);assert.equal(h.worker.terminated,1);
 }
 for(const unreadableSources of [[],['server','server'],['browser','other'],'server',undefined]){
  const h=harness(),task=startRecoveryInspection(null,null,h.factory);
  h.worker.onmessage!({data:{type:'result',choice:{recovery:null,alternatives:[],warnings:[],unreadableSources}} as RecoveryInspectionReply});
  await assert.rejects(task.promise,/无效结果/);assert.equal(h.worker.terminated,1);
 }
 const h=harness(),task=startRecoveryInspection(new Blob(['pending']),null,h.factory);task.cancel();await assert.rejects(task.promise,{name:'AbortError'});
 h.worker.onmessage!({data:{type:'result',choice:{recovery:null,alternatives:[],warnings:['尚未读取，原件保留'],unreadableSources:['server']}}});assert.equal(h.worker.terminated,1);
});
