import test from 'node:test';
import assert from 'node:assert/strict';
import {startSimulationGraphPreparation,type SimulationGraphPreparationReply,type SimulationGraphPreparationRequest} from '../../src/app/simulationGraphPreparation';
import {prepareSimulationGraph} from '../../src/engine/simulationGraphPreparation';
import {blankDoc} from '../../src/app/state';
import {buildFold} from '../../src/core/geometry';
import {createMaterialTopology} from '../../src/core/materialTopology';
import type {Doc,FoldGraph} from '../../src/core/types';
import type {SimulationPose} from '../../src/engine/simPose';
import {artworkTransferChunks,createArtworkTransferReceiver,ARTWORK_TRANSFER_TEXT} from '../../src/app/artworkImportTransfer';
import {simulationSourceSignature} from '../../src/engine/simLayerOrder';

function source(){const doc=blankDoc('三维源',100,100);doc.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'M',angle:-123});return doc;}
function pose(source:unknown){return {source,solver:{positions:[()=>{throw Error('solver must not be transferred');}]}} as unknown as SimulationPose;}
function harness(doc=source(),saved?:SimulationPose){
 const posted:SimulationGraphPreparationRequest[]=[];let terminated=0;
 const worker={onmessage:null as ((event:{data:SimulationGraphPreparationReply})=>void)|null,onerror:null as ((event:{message:string})=>void)|null,onmessageerror:null as (()=>void)|null,postMessage(data:SimulationGraphPreparationRequest){posted.push(structuredClone(data));},terminate(){terminated++;}};
 const task=startSimulationGraphPreparation(doc,saved,()=>worker as unknown as Worker);
 return {doc,worker,posted,task,get terminated(){return terminated;}};
}
function upload(h:ReturnType<typeof harness>){
 const receiver=createArtworkTransferReceiver();let index=0;
 while(true){h.worker.onmessage!({data:{type:'continue-input',index}});const message=h.posted.at(-1)!;
  if(message.type==='input-complete'){assert.equal(message.chunks,index);return receiver.finish() as {doc:Doc;hasPose:boolean;poseSource?:unknown};}
  assert.equal(message.type,'input');if(message.type!=='input')assert.fail('input');assert.equal(message.index,index++);receiver.receive(message.operations);
 }
}
function deliver(h:ReturnType<typeof harness>,value:unknown){
 h.worker.onmessage!({data:{type:'result-begin'}});let index=0;
 for(const operations of artworkTransferChunks(value))h.worker.onmessage!({data:{type:'result-chunk',index:index++,operations:structuredClone(operations)}});
 return ()=>h.worker.onmessage!({data:{type:'result-complete',chunks:index}});
}

test('worker graph preparation matches ordinary geometry, angles and source matching without mutation',()=>{
 const doc=source(),before=structuredClone(doc),expected=buildFold(doc);
 assert.deepEqual(prepareSimulationGraph(doc),{graph:expected.graph,warnings:expected.warnings,matchesPose:false});
 assert.equal(prepareSimulationGraph(doc,true,expected.graph).matchesPose,true);
 const stale=structuredClone(expected.graph);stale.edges_foldAngle[0]=91;assert.equal(prepareSimulationGraph(doc,true,stale).matchesPose,false);
 assert.deepEqual(doc,before);assert.ok(expected.graph.edges_foldAngle.includes(-123));
});

test('an invalid current CP rejects ordinary loading but retains independent pose restoration',()=>{
 const doc=source();doc.paper.width=-1;
 assert.throws(()=>prepareSimulationGraph(doc));assert.deepEqual(prepareSimulationGraph(doc,true,buildFold(source()).graph),{graph:null,warnings:[],matchesPose:false});
});

test('two sources without a usable source signature are never declared the same pose source',()=>{
 const doc=blankDoc('大型独立三角纸片',200,200);doc.segments=[];
 for(let i=0;i<2734;i++){
  const x=(i%60)*2,y=Math.floor(i/60)*2,points:[[number,number],[number,number],[number,number]]=[[x,y],[x+1,y],[x,y+1]];
  for(let edge=0;edge<3;edge++)doc.segments.push({id:`t${i}-${edge}`,a:points[edge],b:points[(edge+1)%3],assignment:'B',angle:0});
 }
 const expected=buildFold(doc).graph;assert.ok(expected.vertices_coords.length>8192);
 assert.equal(simulationSourceSignature(expected),'');
 const independent=structuredClone(expected);independent.vertices_coords[0][0]+=.25;
 assert.equal(prepareSimulationGraph(doc,true,independent).matchesPose,false);
});

test('indexed cut banks in material metadata keep their independent topology',()=>{
 const graph:FoldGraph={vertices_coords:[[0,0],[50,0],[50,100],[0,100],[50,0],[100,0],[100,100],[50,100]],edges_vertices:[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4]],edges_assignment:Array(8).fill('B'),edges_foldAngle:Array(8).fill(0),faces_vertices:[[0,1,2,3],[4,5,6,7]],faces_edges:[[0,1,2,3],[4,5,6,7]],edges_faces:[[0],[0],[0],[0],[1],[1],[1],[1]],faces_faces:[[null,null,null,null],[null,null,null,null]] as unknown as number[][]};
 const doc:Doc={schemaVersion:2,name:'独立切口',paper:{width:100,height:100},segments:graph.edges_vertices.map(([a,b],i)=>({id:`e${i}`,a:graph.vertices_coords[a],b:graph.vertices_coords[b],assignment:'B',angle:0}))};
 doc.metadata={materialTopology:createMaterialTopology(doc,graph,doc.segments.map(s=>s.id)),unknown:{keep:'all'}};
 assert.deepEqual(prepareSimulationGraph(doc).graph,buildFold(doc).graph);assert.equal(prepareSimulationGraph(doc).graph!.vertices_coords.length,8);
});

test('large unknown metadata is uploaded in ACK bounded batches and only pose source is included',async()=>{
 const doc=source();doc.metadata={unknown:'x'.repeat(17*1024*1024)};const graph=buildFold(doc).graph,h=harness(doc,pose(graph));
 assert.deepEqual(h.posted,[{type:'begin'}],'starting a task performs no complete document clone');
 const received=upload(h);assert.deepEqual(received.doc,doc);assert.equal(received.hasPose,true);assert.deepEqual(received.poseSource,graph);assert.equal(Object.hasOwn(received,'solver'),false);
 const inputs=h.posted.filter(message=>message.type==='input');assert.ok(inputs.length>250);
 for(const message of inputs){assert.ok(JSON.stringify(message).length<512*1024);for(const op of message.operations)if(op.kind==='text')assert.ok(op.text.length<=ARTWORK_TRANSFER_TEXT);}
 let resolved=false;h.task.promise.then(()=>{resolved=true;});
 const complete=deliver(h,{graph,warnings:[],matchesPose:true});await Promise.resolve();assert.equal(resolved,false);assert.equal(h.terminated,0);
 complete();assert.deepEqual(await h.task.promise,{graph,warnings:[],matchesPose:true});assert.equal(h.terminated,1);
});

test('cancel rejects during upload or partial result and discards every late message',async()=>{
 for(const stage of ['upload','result']){
  const h=harness();if(stage==='result'){upload(h);deliver(h,{graph:buildFold(h.doc).graph,warnings:[],matchesPose:false});}
  const rejected=assert.rejects(h.task.promise,{name:'AbortError'});h.task.cancel();h.task.cancel();await rejected;
  h.worker.onmessage!({data:{type:'result-complete',chunks:1}});assert.equal(h.terminated,1);
 }
});

test('bad protocol, truncated results and transport failures never publish a partial graph',async()=>{
 for(const cause of ['skipped-ack','early-result','truncated','null-ordinary','runtime','clone','validation']){
  const h=harness(),rejected=assert.rejects(h.task.promise);
  if(cause==='skipped-ack')h.worker.onmessage!({data:{type:'continue-input',index:1}});
  if(cause==='early-result')h.worker.onmessage!({data:{type:'result-begin'}});
  if(cause==='truncated'){upload(h);h.worker.onmessage!({data:{type:'result-begin'}});h.worker.onmessage!({data:{type:'result-chunk',index:0,operations:[{kind:'object',path:[],count:1}]}});h.worker.onmessage!({data:{type:'result-complete',chunks:1}});}
  if(cause==='null-ordinary'){upload(h);deliver(h,{graph:null,warnings:[],matchesPose:false})();}
  if(cause==='runtime')h.worker.onerror!({message:'thread failed'});
  if(cause==='clone')h.worker.onmessageerror!();
  if(cause==='validation')h.worker.onmessage!({data:{type:'error',message:'材料拓扑无效'}});
  await rejected;assert.equal(h.terminated,1);
 }
 const unavailable=startSimulationGraphPreparation(source(),undefined,()=>{throw Error('unavailable');});await assert.rejects(unavailable.promise,/unavailable/);unavailable.cancel();
});

test('actual worker handler completes both acknowledged transfer directions with the full graph',async()=>{
 const scope=globalThis as any,oldMessage=scope.onmessage,oldPost=scope.postMessage;let terminated=0;
 const worker={onmessage:null as any,onerror:null as any,onmessageerror:null as any,postMessage(data:unknown){const cloned=structuredClone(data);queueMicrotask(()=>{if(!terminated)void scope.onmessage({data:cloned});});},terminate(){terminated++;}};
 try{
  scope.postMessage=(reply:unknown)=>{const cloned=structuredClone(reply);queueMicrotask(()=>worker.onmessage?.({data:cloned}));};
  await import('../../src/workers/simulationGraphPreparation.worker');
  const doc=source();doc.metadata={unknown:'y'.repeat(17*1024*1024)};
  const expected=buildFold(doc),task=startSimulationGraphPreparation(doc,pose(expected.graph),()=>worker as unknown as Worker);
  assert.deepEqual(await task.promise,{graph:expected.graph,warnings:expected.warnings,matchesPose:true});assert.equal(terminated,1);
 }finally{scope.onmessage=oldMessage;scope.postMessage=oldPost;}
});
