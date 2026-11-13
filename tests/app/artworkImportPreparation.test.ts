import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {tessPreset} from '../../src/app/tessellation';
import {createDiagramProject,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {prepareArtworkProject} from '../../src/app/artworkProject';
import {prepareExistingCreases} from '../../src/app/diagramProjectPreparation';
import {normalizeDiagramProjectCP} from '../../src/app/diagramCP';
import {prepareArtworkImport,getArtworkImportPreparation,isPreparedArtworkDiagram,registerPreparedArtworkImport,type PreparedArtworkImport} from '../../src/app/artworkImportPreparation';
import {artworkTransferChunks,createArtworkTransferReceiver,ARTWORK_TRANSFER_BUDGET,ARTWORK_TRANSFER_TEXT,type ArtworkTransferOperation} from '../../src/app/artworkImportTransfer';
import {startProjectImport,startArtworkImport,type ProjectImportReply} from '../../src/app/projectImportTask';
import {buildFold} from '../../src/core/geometry';
import {computeFlatFold} from '../../src/core/flatFold';
import {exportModelSnapshot} from '../../src/core/modelSnapshot';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {DEFAULT_SIMULATION_SOLVER_SETTINGS} from '../../src/engine/simSettings';
import {defaultModelView} from '../../src/app/modelViewState';
import {createDiagramProjectSaveBlob,getDiagramProjectSaveBlob} from '../../src/app/diagramProjectTransport';

function fixture(){
  const editor=blankDoc('后台准备',200,200),diagram=createDiagramProject(editor);
  diagram.states[0].doc.segments.push({id:'across-a',a:[0,100],b:[200,100],assignment:'M',angle:-180});
  diagram.states[0].doc.segments.push({id:'across-b',a:[100,0],b:[100,200],assignment:'V',angle:180});
  return JSON.stringify({format:'zhezhi-artwork',version:1,editor,models:null,diagram,simulation:null,construction:{tessellation:tessPreset('ring'),curve:null}});
}
function receive(value:unknown){const receiver=createArtworkTransferReceiver();for(const chunk of artworkTransferChunks(value))receiver.receive(structuredClone(chunk));return receiver.finish();}
function harness(){
  const fake={onmessage:null as ((e:{data:ProjectImportReply})=>void)|null,onerror:null as ((e:{message:string})=>void)|null,onmessageerror:null as (()=>void)|null,
    posted:[] as unknown[],terminated:0,postMessage(value:unknown){this.posted.push(value);},terminate(){this.terminated++;}};
  return {fake,factory:()=>fake as unknown as Worker};
}

test('background preparation keeps every former UI validator and normalization result',()=>{
  const text=fixture(),legacy=prepareArtworkProject(text),stages:string[]=[];
  const expected=prepareExistingCreases(normalizeDiagramProjectCP(importDiagramProject(exportDiagramProject(legacy.diagram!))).project);
  const prepared=prepareArtworkImport(text,stage=>stages.push(stage));
  assert.deepEqual(prepared.project.diagram,expected);
  assert.equal(prepared.preparation.editorSignature,JSON.stringify(prepared.project.editor));
  assert.deepEqual(prepared.project.editor,legacy.editor);
  assert.ok(stages.some(stage=>stage.includes('后台准备')));
  assert.equal(getArtworkImportPreparation(prepared.project),undefined,'Worker preparation alone cannot set a UI-trusted flag');
  assert.equal(isPreparedArtworkDiagram(prepared.project.diagram!),false);
  const cloned=receive(prepared) as PreparedArtworkImport,ready=registerPreparedArtworkImport(cloned);
  assert.equal(getArtworkImportPreparation(ready)?.editorSignature,prepared.preparation.editorSignature);
  assert.equal(isPreparedArtworkDiagram(ready.diagram!),true);
  const forged=structuredClone(ready) as typeof ready&{prepared?:boolean};forged.prepared=true;
  assert.equal(getArtworkImportPreparation(forged),undefined);
  assert.equal(isPreparedArtworkDiagram(forged.diagram!),false);
});

test('invalid content is rejected before becoming a prepared project',()=>{
  const raw=JSON.parse(fixture());raw.diagram.states.at(-1).doc.paper.width=-1;
  assert.throws(()=>prepareArtworkImport(raw));
});

test('prepared transfer retains independent model geometry, views and simulation pins',()=>{
  const raw=JSON.parse(fixture()),source=blankDoc('独立模型来源',100,100);
  source.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'M',angle:-180});
  const result=computeFlatFold(source),graph=buildFold(source).graph;
  raw.models={activeId:'saved-model',entries:[{id:'saved-model',name:'模型',snapshot:JSON.parse(exportModelSnapshot(source,result)),view:{...defaultModelView(),rotation:37,side:'back'}}]};
  const solver=new ReferenceSolver(new OrigamiModel(prepareSimulationDocument(graph).prepared),{...DEFAULT_SIMULATION_SOLVER_SETTINGS,foldPercent:45});
  solver.step(8);const pose=solver.capturePose();solver.setVertexConstraint(0,pose.positions.slice(0,3) as [number,number,number]);
  raw.simulation={version:1,source:graph,solver:solver.capturePose(),progress:.45,settings:{...DEFAULT_SIMULATION_SOLVER_SETTINGS},view:{yaw:.3,pitch:.4,zoom:1.2},collision:true};solver.dispose();
  const prepared=prepareArtworkImport(raw),restored=receive(prepared) as PreparedArtworkImport;
  assert.deepEqual(restored,prepared);
  assert.equal(restored.project.models.entries[0].source.doc.name,source.name);
  assert.notEqual(restored.project.models.entries[0].source.doc.name,restored.project.editor.name);
  assert.equal(restored.project.models.entries[0].view?.rotation,37);
  assert.equal(restored.project.simulation?.solver.pins.length,1);
});

test('bounded tree transfer preserves large geometry, images, undefined and JSON prototype-like keys',()=>{
  const value={editor:{segments:Array.from({length:20000},(_,id)=>({id:String(id),a:[id,0],b:[id,1],assignment:'V',angle:180})),metadata:JSON.parse('{"__proto__":{"retained":"yes"},"constructor":"data"}')},
    image:'图😀'.repeat(ARTWORK_TRANSFER_TEXT),optional:undefined,empty:[],nested:[{large:Array.from({length:40000},(_,index)=>[index,index+1,index+2])}]};
  const chunks=[...artworkTransferChunks(value)];assert.ok(chunks.length>10);
  for(const chunk of chunks)for(const operation of chunk){if(operation.kind==='text')assert.ok(operation.text.length<=ARTWORK_TRANSFER_TEXT);if(operation.kind==='items')assert.ok(operation.values.length<=ARTWORK_TRANSFER_BUDGET);}
  const restored=receive(value);assert.deepEqual(restored,value);
  assert.equal(({} as {retained?:string}).retained,undefined);
  assert.equal(Object.hasOwn((restored as typeof value).editor.metadata,'__proto__'),true);
});

test('truncation, duplicate fields, skipped offsets and unexpected paths reject detached transfer',()=>{
  const cases:ArtworkTransferOperation[][]=[
    [{kind:'array',path:[],length:2},{kind:'items',path:[],offset:1,values:[1]}],
    [{kind:'object',path:[],count:2},{kind:'set',path:['x'],value:1},{kind:'set',path:['x'],value:2}],
    [{kind:'object',path:[],count:1},{kind:'set',path:['missing','child'],value:1}],
    [{kind:'string',path:[],id:0,length:3},{kind:'text',id:0,offset:1,text:'a'}],
  ];
  for(const operations of cases){const receiver=createArtworkTransferReceiver();assert.throws(()=>receiver.receive(operations));}
  const receiver=createArtworkTransferReceiver();receiver.receive([{kind:'array',path:[],length:2},{kind:'items',path:[],offset:0,values:[1]}]);assert.throws(()=>receiver.finish());
});

test('artwork import only publishes after acknowledged complete transfer and locally registers readiness',async()=>{
  const value=prepareArtworkImport(fixture()),{fake,factory}=harness(),task=startArtworkImport(fixture(),undefined,factory);
  assert.equal((fake.posted[0] as {type:string}).type,'prepare-artwork');
  let resolved=false;void task.promise.then(()=>{resolved=true;});
  fake.onmessage!({data:{type:'artwork-begin'}});let index=0;
  for(const operations of artworkTransferChunks(value))fake.onmessage!({data:{type:'artwork-chunk',index:index++,operations:structuredClone(operations)}});
  await Promise.resolve();assert.equal(resolved,false);
  fake.onmessage!({data:{type:'artwork-complete',chunks:index}});
  const result=await task.promise;assert.equal(result.kind,'artwork');if(result.kind!=='artwork')return;
  assert.deepEqual(result.project,value.project);assert.equal(isPreparedArtworkDiagram(result.project.diagram!),true);
  assert.equal(fake.posted.length,index+2);assert.equal(fake.terminated,1);
});

test('cancelling a partial artwork transfer discards every late result and forged direct-result shortcut',async()=>{
  const value=prepareArtworkImport(fixture()),{fake,factory}=harness(),task=startProjectImport(new File([fixture()],'artwork.json'),true,undefined,factory);
  fake.onmessage!({data:{type:'artwork-begin'}});const operations=artworkTransferChunks(value).next().value!;
  fake.onmessage!({data:{type:'artwork-chunk',index:0,operations}});task.cancel();
  await assert.rejects(task.promise,{name:'AbortError'});const sent=fake.posted.length;
  fake.onmessage!({data:{type:'artwork-complete',chunks:1}});assert.equal(fake.posted.length,sent);assert.equal(fake.terminated,1);
  const direct=harness(),other=startProjectImport(new File(['{}'],'artwork.json'),true,undefined,direct.factory);
  direct.fake.onmessage!({data:{type:'result',result:{kind:'artwork',project:value.project}}});await assert.rejects(other.promise,/后台完整准备/);
});

test('actual artwork Worker waits for each ACK for both files and recovery text',async()=>{
  const raw=JSON.parse(fixture());raw.editor.metadata={embedded:'保留😀'.repeat(100000)};const text=JSON.stringify(raw);
  const scope=globalThis as any,oldMessage=scope.onmessage,oldPost=scope.postMessage;
  try{
    await import('../../src/workers/projectImport.worker');
    const handle=scope.onmessage as (event:{data:unknown})=>Promise<void>;
    for(const mode of ['file','recovery']){
      const delivered:ProjectImportReply[]=[];
      const worker={onmessage:null as ((event:{data:ProjectImportReply})=>void)|null,onerror:null as ((event:{message:string})=>void)|null,onmessageerror:null as (()=>void)|null,terminated:0,acknowledged:0,
        postMessage(data:unknown){const cloned=structuredClone(data);if((cloned as {type?:string}).type==='continue-artwork')this.acknowledged++;queueMicrotask(()=>{void handle({data:cloned}).catch(error=>this.onerror?.({message:String(error)}));});},
        terminate(){this.terminated++;}};
      scope.postMessage=(reply:ProjectImportReply)=>{const data=structuredClone(reply);delivered.push(data);queueMicrotask(()=>worker.onmessage?.({data}));};
      const task=mode==='file'?startProjectImport(new File([text],'complete.json'),true,undefined,()=>worker as unknown as Worker):startArtworkImport(text,undefined,()=>worker as unknown as Worker);
      const result=await task.promise;assert.equal(result.kind,'artwork');if(result.kind!=='artwork')return;
      assert.equal(result.project.editor.metadata?.embedded,raw.editor.metadata.embedded);
      assert.equal(isPreparedArtworkDiagram(result.project.diagram!),true);
      const saveBlob=getDiagramProjectSaveBlob(result.project.diagram!);assert.ok(saveBlob);
      assert.deepEqual(JSON.parse(await saveBlob.text()),JSON.parse(JSON.stringify(result.project.diagram)));
      assert.ok(delivered.filter(reply=>reply.type==='artwork-chunk').length>2);
      assert.equal(worker.acknowledged,delivered.filter(reply=>reply.type==='artwork-chunk').length+1);
      assert.equal(delivered.some(reply=>reply.type==='result'),false,'whole prepared projects are never cloned in one message');
      assert.equal(worker.terminated,1);
    }
  }finally{scope.onmessage=oldMessage;scope.postMessage=oldPost;}
});

test('save Blob readiness is published only with a complete owned transfer and never from a disk flag',async()=>{
  const value=prepareArtworkImport(fixture()),blob=createDiagramProjectSaveBlob(value.project.diagram!),{fake,factory}=harness();
  const task=startArtworkImport(fixture(),undefined,factory);fake.onmessage!({data:{type:'artwork-begin',diagramSaveBlob:blob}});
  const chunks=[...artworkTransferChunks(value)];fake.onmessage!({data:{type:'artwork-chunk',index:0,operations:structuredClone(chunks[0])}});
  assert.equal(getDiagramProjectSaveBlob(value.project.diagram!),undefined);task.cancel();await assert.rejects(task.promise,{name:'AbortError'});
  fake.onmessage!({data:{type:'artwork-complete',chunks:1}});assert.equal(getDiagramProjectSaveBlob(value.project.diagram!),undefined);
  const invalid=harness(),bad=startArtworkImport(fixture(),undefined,invalid.factory);
  invalid.fake.onmessage!({data:{type:'artwork-begin',diagramSaveBlob:{} as Blob}});await assert.rejects(bad.promise,/保存数据无效/);
  const raw=JSON.parse(fixture());raw.diagram.prepared=true;raw.diagram.diagramSaveBlob={size:100,type:'application/json'};
  assert.throws(()=>prepareArtworkImport(raw),/字段不完整/,'persisted transport flags also fail the existing strict project schema');
});
