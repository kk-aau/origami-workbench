import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {startFlatFold} from '../../src/core/workerClient';
import type {FlatWorkerRequest} from '../../src/core/types';
import {flatExactProof} from '../../src/app/flatExactProof';
import {flatFoldPublication,type FlatFoldPublication} from '../../src/app/flatFoldPublication';
import {exactSurfaceIssue} from '../../src/app/modelExactSurfaceData';
import {acquireModelSurface} from '../../src/app/modelOverlapTask';
import {modelSurfaceTransfer} from '../../src/app/modelSurfaceTransfer';

function grid(){
 const doc=blankDoc('完整分区线程验收',16,16);
 for(let i=1;i<16;i++)doc.segments.push({id:`x${i}`,a:[i,0],b:[i,16],assignment:'F',angle:0},{id:`y${i}`,a:[0,i],b:[16,i],assignment:'F',angle:0});
 return doc;
}

test('large finite F routes preserve the complete proof on public geometry through initial and repeated analysis',()=>{
 const source=grid();source.segments.push({id:'finite-tip',a:[.2,.2],b:[.8,.2],assignment:'F',angle:0});
 const before=structuredClone(source),result=computeFlatFold(source);
 assert.equal(result.layers.status,'solved',result.layers.message);assert.ok(flatExactProof(result),'private same-face-ID solver proof must reach the public result');
 const published=flatFoldPublication(result);assert.ok(published.surface?.status==='complete'&&published.surface.exact);
 assert.deepEqual(source,before);assert.equal(exactSurfaceIssue(published.surface,result),null);
 const reanalysed=recomputeFlatLayers(result);assert.equal(reanalysed.layers.status,'solved',reanalysed.layers.message);assert.ok(flatExactProof(reanalysed));
 const next=flatFoldPublication(reanalysed);assert.ok(next.surface?.status==='complete'&&next.surface.exact);assert.deepEqual(reanalysed.geometry,result.geometry);
});

test('the actual large flat worker completes both surfaces before publication and transfers only visible buffers',async()=>{
 const scope=globalThis as unknown as {onmessage?: (event:{data:FlatWorkerRequest})=>void;postMessage?:(data:unknown,transfer?:ArrayBuffer[])=>void};
 const oldHandler=scope.onmessage,oldPost=scope.postMessage,source=grid(),before=structuredClone(source),messages:any[]=[];let transferred=0;
 try{
  scope.postMessage=(data,transfer)=>{transferred+=transfer?.length??0;messages.push(structuredClone(data,{transfer:transfer??[]}));};
  await import('../../src/workers/flatFold.worker');
  scope.onmessage!({data:{doc:source}});
  const reply=messages.at(-1) as FlatFoldPublication;
  // Preparation/progress can precede geometry; the first data result must
  // still be the unsolved geometry, followed by the certified final result.
  const dataMessages=messages.filter(message=>message.type!=='computation-progress'&&message.type!=='progress');
  assert.equal(dataMessages[0].type,'geometry');assert.equal(dataMessages[0].result.layers.status,'unknown');
  assert.equal(reply.type,'result');assert.equal(reply.result.layers.status,'solved',reply.result.layers.message);
  assert.ok(reply.surface?.status==='complete'&&reply.surface.exact&&reply.surface.opposite?.exact);
  assert.equal(reply.surface.exactAnalysis.verifiedCells,256);assert.equal(reply.surface.exact.side,'front');assert.equal(reply.surface.opposite.exact.side,'back');
  assert.equal(exactSurfaceIssue(reply.surface,reply.result),null);assert.equal(exactSurfaceIssue(reply.surface.opposite,reply.result),null);
  assert.ok(transferred>0);assert.equal(new Set(modelSurfaceTransfer(reply.surface)).size,transferred);
  assert.equal('topology' in reply.result,false);assert.equal('certificate' in reply.result,false);assert.equal('cellArea' in reply.surface.exact,false);assert.deepEqual(source,before);
 }finally{if(oldHandler===undefined)delete scope.onmessage;else scope.onmessage=oldHandler;if(oldPost===undefined)delete scope.postMessage;else scope.postMessage=oldPost;}
});

test('flat client ignores progress, caches front/back completion and does not launch another surface worker',async()=>{
 const Native=globalThis.Worker;let made=0,latest:any;
 class WorkerStub{onmessage?: (event:{data:unknown})=>void;terminated=false;constructor(){made++;latest=this;}postMessage(){}terminate(){this.terminated=true;}}
 globalThis.Worker=WorkerStub as unknown as typeof Worker;
 try{
  const task=startFlatFold(grid()),worker=latest;let settled=false;task.promise.then(()=>{settled=true;});
  worker.onmessage({data:{type:'progress',progress:{stage:'boundaries',pass:1,epsilon:0}}});await Promise.resolve();assert.equal(settled,false);assert.equal(worker.terminated,false);
  const publication=flatFoldPublication(computeFlatFold(grid()));assert.ok(publication.surface?.status==='complete'&&publication.surface.exact);
  worker.onmessage({data:structuredClone(publication,{transfer:modelSurfaceTransfer(publication.surface)})});const result=await task.promise;
  assert.equal(result.layers.status,'solved');assert.equal(worker.terminated,true);
  const front=acquireModelSurface(result,'front',true),back=acquireModelSurface(result,'back',true);
  const a=await front.promise,b=await back.promise;assert.ok(a.status==='complete'&&a.exact&&b.status==='complete'&&b.exact);
  assert.equal(a.exact.side,'front');assert.equal(b.exact.side,'back');assert.equal(made,1);front.cancel();back.cancel();
  const cancelled=startFlatFold(grid()),other=latest;cancelled.cancel();other.onmessage({data:{type:'progress',progress:{stage:'boundaries',pass:1,epsilon:0}}});other.onmessage({data:publication});
  assert.equal((await cancelled.promise).layers.status,'cancelled');assert.equal(other.terminated,true);
 }finally{globalThis.Worker=Native;}
});

test('a bad full-coverage certificate fails publication and releases transient proof instead of publishing solved paper',()=>{
 const result=computeFlatFold(grid()),proof=flatExactProof(result);assert.ok(proof);proof.certificate.depth[0]=2;
 const reply=flatFoldPublication(result);
 assert.equal(reply.result.layers.status,'error');assert.match(reply.result.layers.message,/完整纸面计算未完成/);assert.equal(reply.surface,undefined);assert.equal(flatExactProof(result),undefined);
 assert.deepEqual(reply.result.geometry,result.geometry);
});
