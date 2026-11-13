import test from 'node:test';
import assert from 'node:assert/strict';
import {artworkSerializationInput,createArtworkSerializer} from '../../src/app/artworkSerialization';
import {createArtworkSerializationClient,type ArtworkSerializationReply,type ArtworkSerializationRequest} from '../../src/app/artworkSerializationTask';
import {exportArtworkProject,prepareArtworkProject,type ArtworkProject} from '../../src/app/artworkProject';
import {exportModelSnapshot} from '../../src/core/modelSnapshot';
import {blankDoc} from '../../src/app/state';
import {prepareProjectImport} from '../../src/app/prepareProjectImport';
import {buildFold} from '../../src/core/geometry';
import {computeFlatFold} from '../../src/core/flatFold';
import {emptyFoldedModelCollection,foldedModelCollectionReducer as reduce} from '../../src/app/foldedModelCollection';
import {createDiagramProject,adoptDiagramPose} from '../../src/app/diagramProject';
import {tessPreset} from '../../src/app/tessellation';
import {newBaseDesign} from '../../src/app/baseDesign';
import {DEFAULT_SIMULATION_SOLVER_SETTINGS} from '../../src/engine/simSettings';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';

function fixture():ArtworkProject {
 const raw=blankDoc('模型来源',100,100);raw.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'M',angle:-180});
 const source=prepareProjectImport(raw),result=computeFlatFold(source);
 assert.equal(result.geometry.status,'ready');
 let models=reduce(emptyFoldedModelCollection(),{type:'add',id:'m1',name:'当前模型',source:{doc:source,graph:buildFold(source).graph},result});
 const edited=structuredClone(result);edited.geometry.startingFace=1;
 models=reduce(models,{type:'edit',action:{type:'commit',result:edited}});
 return {editor:blankDoc('独立编辑源',150,120),models,diagram:null,simulation:null,construction:{tessellation:tessPreset('ring'),curve:null}};
}

test('worker projection preserves the complete export while omitting history and old layer certificates',()=>{
 const project=fixture(),before=structuredClone(project),projected=artworkSerializationInput(project);
 assert.ok(project.models.entries[0].history.past.length);
 assert.ok(project.models.entries[0].history.present!.layers.faceOrders?.length);
 assert.deepEqual(projected.models.entries[0].history.past,[]);
 assert.deepEqual(projected.models.entries[0].history.future,[]);
 assert.equal(projected.models.entries[0].history.present!.layers.faceOrders,undefined);
 assert.equal(exportArtworkProject(projected),exportArtworkProject(project));
 assert.deepEqual(project,before);
});

test('unchanged validated models reuse topology work while current labels, views and editor are still exported',()=>{
 let calls=0;const serialize=createArtworkSerializer((...args)=>{calls++;return exportModelSnapshot(...args);}),project=fixture();
 assert.equal(serialize(project),exportArtworkProject(project));assert.equal(calls,1);
 const next=structuredClone(project);next.editor.name='编辑器更新';next.models.entries[0].name='模型重命名';next.models.entries[0].view.rotation=37;
 assert.equal(serialize(next),exportArtworkProject(next));assert.equal(calls,1);
 next.models.entries[0].history.present!.layers.message='层序有新的进展';
 next.models.entries[0].history.present!.layers.faceOrders=[];
 assert.equal(serialize(next),exportArtworkProject(next));assert.equal(calls,1);
});

test('source, geometry and explicit constraints changes each rerun the full snapshot validator',()=>{
 let calls=0;const serialize=createArtworkSerializer((...args)=>{calls++;return exportModelSnapshot(...args);}),project=fixture();
 serialize(project);project.models.entries[0].source.doc.name='来源更新';
 assert.equal(serialize(project),exportArtworkProject(project));assert.equal(calls,2);
 project.models.entries[0].history.present!.geometry.startingFace=0;
 assert.equal(serialize(project),exportArtworkProject(project));assert.equal(calls,3);
 project.models.entries[0].history.present!.layers.constraints=[{face:0,side:'white'}];
 assert.equal(serialize(project),exportArtworkProject(project));assert.equal(calls,4);
});

test('cached valid input cannot hide later in-place topology damage or null constraints',()=>{
 const project=fixture(),serialize=createArtworkSerializer();serialize(project);
 const damaged=project.models.entries[0].history.present!;
 damaged.geometry.graph!.edges_vertices[0][0]=9999;
 assert.throws(()=>serialize(project),/拓扑/);
 const clean=fixture();serialize(clean);
 (clean.models.entries[0].history.present!.layers as any).constraints=null;
 assert.throws(()=>serialize(clean),/约束/);
});

test('cached models do not bypass late artwork validation or empty/detached model semantics',()=>{
 const project=fixture(),serialize=createArtworkSerializer();serialize(project);
 const invalid=structuredClone(project);(invalid.construction.tessellation as any).family='invalid';
 assert.throws(()=>serialize(invalid),/构造参数/);
 project.models=reduce(project.models,{type:'detach'});
 assert.equal(serialize(project),exportArtworkProject(project));
 project.models=emptyFoldedModelCollection();assert.equal(serialize(project),exportArtworkProject(project));
});

test('drawing snapshots retain full validation after deferred capture and reuse',()=>{
 const project=fixture(),source=blankDoc('绘图',100,100);let serial=0;
 let diagram=createDiagramProject(source,()=>`d${++serial}`);
 diagram=adoptDiagramPose(diagram,diagram.activeStepId,diagram.states[0].id,computeFlatFold(source));
 project.diagram=diagram;const serialize=createArtworkSerializer(),text=serialize(project);
 assert.equal(text,exportArtworkProject(project));assert.equal(serialize(structuredClone(project)),text);
 assert.deepEqual(prepareArtworkProject(text).diagram,prepareArtworkProject(exportArtworkProject(project)).diagram);
 project.diagram.states[0].doc.paper.width=-1;
 assert.throws(()=>serialize(project));
});

function harness(){
 const workers:{onmessage:((event:{data:ArtworkSerializationReply})=>void)|null;onerror:((event:{message:string})=>void)|null;onmessageerror:(()=>void)|null;terminated:number;posted:ArtworkSerializationRequest[];terminate():void;postMessage(data:ArtworkSerializationRequest):void}[]=[];
 const factory=()=>{const worker={onmessage:null,onerror:null,onmessageerror:null,terminated:0,posted:[] as ArtworkSerializationRequest[],terminate(){this.terminated++;},postMessage(data:ArtworkSerializationRequest){this.posted.push(structuredClone(data));}};workers.push(worker);return worker as unknown as Worker;};
 return {workers,factory};
}

test('serialization client is lazy and persistent, snapshots input and matches each queued response',async()=>{
 const {workers,factory}=harness(),client=createArtworkSerializationClient(factory),project=fixture();
 assert.equal(workers.length,0);const first=client.serialize(project),second=client.serialize(project);
 assert.equal(workers.length,1);assert.equal(workers[0].posted.length,2);
 project.editor.name='在等待期间编辑';assert.notEqual(workers[0].posted[0].project.editor.name,project.editor.name);
 assert.equal(workers[0].posted[0].project.models.entries[0].history.present!.layers.faceOrders,undefined);
 const [a,b]=workers[0].posted;workers[0].onmessage!({data:{id:b.id,type:'result',text:'second'}});
 workers[0].onmessage!({data:{id:a.id,type:'result',text:'first'}});
 assert.deepEqual(await Promise.all([first,second]),['first','second']);assert.equal(workers[0].terminated,0);client.cancel();
});

test('scope cancellation rejects all pending captures, ignores late old messages and allows a fresh worker',async()=>{
 const {workers,factory}=harness(),client=createArtworkSerializationClient(factory),project=fixture();
 const first=client.serialize(project),second=client.serialize(project);client.cancel();
 await assert.rejects(first,{name:'AbortError'});await assert.rejects(second,{name:'AbortError'});
 assert.equal(workers[0].terminated,1);const next=client.serialize(project),id=workers[1].posted[0].id;
 workers[0].onmessage!({data:{id,type:'result',text:'stale'}});workers[0].onerror!({message:'old error'});
 workers[1].onmessage!({data:{id,type:'result',text:'current'}});assert.equal(await next,'current');client.cancel();
});
test('encoded editor snapshot avoids cloning the live document and remains fixed while waiting',async()=>{
 const {workers,factory}=harness(),client=createArtworkSerializationClient(factory),project=fixture();
 const editorText=JSON.stringify(project.editor);
 project.editor.metadata={notCloneable:()=>0};
 const pending=client.serialize(project,editorText),request=workers[0].posted[0];
 assert.ok('editorText' in request);assert.equal(request.editorText,editorText);assert.equal(Object.hasOwn(request.project,'editor'),false);
 project.editor.name='等待期间新名称';assert.notEqual(JSON.parse(request.editorText).name,project.editor.name);
 workers[0].onmessage!({data:{id:request.id,type:'result',text:'complete'}});assert.equal(await pending,'complete');client.cancel();
});

test('worker validation errors reject only the affected capture and preserve a usable worker',async()=>{
 const {workers,factory}=harness(),client=createArtworkSerializationClient(factory),project=fixture();
 const bad=client.serialize(project),good=client.serialize(project),[a,b]=workers[0].posted;
 workers[0].onmessage!({data:{id:a.id,type:'error',message:'拓扑不对应'}});
 workers[0].onmessage!({data:{id:b.id,type:'result',text:'valid'}});
 await assert.rejects(bad,/拓扑/);assert.equal(await good,'valid');assert.equal(workers[0].terminated,0);client.cancel();
});

test('worker failures and invalid replies clear outstanding captures instead of falling back to the main thread',async()=>{
 for(const cause of ['worker','clone','invalid']){
  const {workers,factory}=harness(),client=createArtworkSerializationClient(factory),task=client.serialize(fixture());
  if(cause==='worker')workers[0].onerror!({message:'内存不足'});
  if(cause==='clone')workers[0].onmessageerror!();
  if(cause==='invalid')workers[0].onmessage!({data:{id:workers[0].posted[0].id,type:'result',text:null} as any});
  await assert.rejects(task);assert.equal(workers[0].terminated,1);
  const retry=client.serialize(fixture()),id=workers[1].posted[0].id;
  workers[1].onmessage!({data:{id,type:'result',text:'retry'}});assert.equal(await retry,'retry');client.cancel();
 }
});

test('worker creation and native structured-clone failures surface without producing an artwork',async()=>{
 const unavailable=createArtworkSerializationClient(()=>{throw new Error('worker unavailable');});
 await assert.rejects(unavailable.serialize(fixture()),/unavailable/);
 const {workers,factory}=harness(),client=createArtworkSerializationClient(factory),project=fixture();
 project.editor.metadata={notCloneable:()=>0};
 await assert.rejects(client.serialize(project));assert.equal(workers[0].terminated,1);
});

test('archive and JSON captures share a worker without mixing queued output formats',async()=>{
 const {workers,factory}=harness(),client=createArtworkSerializationClient(factory),project=fixture();
 const json=client.serialize(project),archive=client.archive(project,JSON.stringify(project.editor));
 assert.equal(workers.length,1);const [a,b]=workers[0].posted;
 assert.equal(a.format,undefined);assert.equal(b.format,'archive');
 assert.ok('editorText' in b);assert.equal(Object.hasOwn(b.project,'editor'),false);
 project.editor.name='请求后仍可编辑';
 assert.notEqual(JSON.parse(b.editorText).name,project.editor.name);
 const blob=new Blob(['archive bytes'],{type:'application/zip'});
 workers[0].onmessage!({data:{id:b.id,type:'archive',blob}});
 workers[0].onmessage!({data:{id:a.id,type:'result',text:'JSON recovery'}});
 assert.equal(await archive,blob);assert.equal(await json,'JSON recovery');client.cancel();
});

test('cancelling mixed captures discards old archives and a later archive gets a fresh worker',async()=>{
 const {workers,factory}=harness(),client=createArtworkSerializationClient(factory),project=fixture();
 const json=client.serialize(project),archive=client.archive(project);client.cancel();
 await assert.rejects(json,{name:'AbortError'});await assert.rejects(archive,{name:'AbortError'});
 assert.equal(workers[0].terminated,1);
 const next=client.archive(project),id=workers[1].posted[0].id;
 workers[0].onmessage!({data:{id,type:'archive',blob:new Blob(['stale'])}});
 const current=new Blob(['current']);workers[1].onmessage!({data:{id,type:'archive',blob:current}});
 assert.equal(await next,current);client.cancel();
});

test('an archive validation failure preserves other captures and does not publish a partial file',async()=>{
 const {workers,factory}=harness(),client=createArtworkSerializationClient(factory),project=fixture();
 const invalid=client.archive(project),valid=client.serialize(project),[a,b]=workers[0].posted;
 workers[0].onmessage!({data:{id:a.id,type:'error',message:'容器编码失败'}});
 workers[0].onmessage!({data:{id:b.id,type:'result',text:'valid JSON'}});
 await assert.rejects(invalid,/编码失败/);assert.equal(await valid,'valid JSON');
 assert.equal(workers[0].terminated,0);client.cancel();
});

test('invalid archive replies reject outstanding work and can be retried without a main-thread fallback',async()=>{
 for(const cause of ['text','archive-for-json','empty','not-blob','worker','clone']){
  const {workers,factory}=harness(),client=createArtworkSerializationClient(factory),project=fixture();
  const archive=client.archive(project),json=client.serialize(project),id=workers[0].posted[0].id;
  if(cause==='text')workers[0].onmessage!({data:{id,type:'result',text:'wrong format'}});
  if(cause==='archive-for-json')workers[0].onmessage!({data:{id:workers[0].posted[1].id,type:'archive',blob:new Blob(['wrong format'])}});
  if(cause==='empty')workers[0].onmessage!({data:{id,type:'archive',blob:new Blob()}});
  if(cause==='not-blob')workers[0].onmessage!({data:{id,type:'archive',blob:{size:1}} as any});
  if(cause==='worker')workers[0].onerror!({message:'内存不足'});
  if(cause==='clone')workers[0].onmessageerror!();
  await assert.rejects(archive);await assert.rejects(json);assert.equal(workers[0].terminated,1);
  const retry=client.archive(project),retryId=workers[1].posted[0].id,blob=new Blob(['retry']);
  workers[1].onmessage!({data:{id:retryId,type:'archive',blob}});assert.equal(await retry,blob);client.cancel();
 }
});

test('actual worker handler returns the standard complete artwork and reports invalid topology without publishing',async()=>{
 const scope=globalThis as any,oldMessage=scope.onmessage,oldPost=scope.postMessage,replies:ArtworkSerializationReply[]=[];
 try{
  scope.postMessage=(reply:ArtworkSerializationReply)=>replies.push(reply);
  await import('../../src/workers/artworkSerialization.worker');
  const {decodeArtworkArchive}=await import('../../src/app/artworkArchive');
  const project=fixture(),expected=exportArtworkProject(project);
  scope.onmessage({data:{id:1,project:artworkSerializationInput(project)}});
  assert.deepEqual(replies[0],{id:1,type:'result',text:expected});
  const {editor,...remainder}=artworkSerializationInput(project);
  scope.onmessage({data:{id:3,project:remainder,editorText:JSON.stringify(editor)}});
  assert.deepEqual(replies[1],{id:3,type:'result',text:expected});
  project.models.entries[0].history.present!.geometry.graph!.edges_vertices[0][0]=9999;
  scope.onmessage({data:{id:2,project:artworkSerializationInput(project)}});
  assert.equal(replies[2].id,2);assert.equal(replies[2].type,'error');
  assert.match((replies[2] as Extract<ArtworkSerializationReply,{type:'error'}>).message,/拓扑/);
  scope.onmessage({data:{id:4,project:remainder,editorText:'{"name":"invalid","paper":{},"segments":[]}'}});
  assert.equal(replies[3].type,'error');
  const complete=fixture();complete.design=newBaseDesign('tree');complete.diagram=createDiagramProject(blankDoc('独立折序来源',120,110));
  const simulationSource=JSON.parse(JSON.stringify(buildFold(blankDoc('独立模拟来源',90,70)).graph));
  const prepared=prepareSimulationDocument(simulationSource).prepared,solver=new ReferenceSolver(new OrigamiModel(prepared),{...DEFAULT_SIMULATION_SOLVER_SETTINGS,foldPercent:45});
  solver.step(8);const pose=solver.capturePose();solver.setVertexConstraint(0,pose.positions.slice(0,3) as [number,number,number]);
  complete.simulation={version:1,source:simulationSource,solver:solver.capturePose(),progress:.45,settings:{...DEFAULT_SIMULATION_SOLVER_SETTINGS},view:{yaw:.3,pitch:.4,zoom:1.2}};solver.dispose();
  const projected=artworkSerializationInput(complete),{editor:completeEditor,...completeRemainder}=projected;
  scope.onmessage({data:{id:5,format:'archive',project:completeRemainder,editorText:JSON.stringify(completeEditor)}});
  const archive=replies[4];assert.equal(archive.type,'archive');
  if(archive.type!=='archive')assert.fail('Expected archive Blob');
  assert.ok(archive.blob instanceof Blob);assert.equal(archive.blob.type,'application/zip');
  const bytes=new Uint8Array(await archive.blob.arrayBuffer());assert.deepEqual([...bytes.slice(0,2)],[80,75]);
  assert.deepEqual(decodeArtworkArchive(bytes),JSON.parse(exportArtworkProject(complete)));
  const broken=structuredClone(artworkSerializationInput(complete));broken.models.entries[0].history.present!.geometry.graph!.edges_vertices[0][0]=9999;
  scope.onmessage({data:{id:6,format:'archive',project:broken}});
  assert.equal(replies[5].type,'error');assert.equal(Object.hasOwn(replies[5],'blob'),false);
  scope.onmessage({data:{id:7,format:'archive',project:projected}});
  const retry=replies[6];assert.equal(retry.type,'archive');
  if(retry.type!=='archive')assert.fail('Expected retry archive');
  assert.deepEqual(decodeArtworkArchive(new Uint8Array(await retry.blob.arrayBuffer())),JSON.parse(exportArtworkProject(complete)));
  scope.onmessage({data:{id:8,project:projected}});
  assert.deepEqual(replies[7],{id:8,type:'result',text:exportArtworkProject(complete)});
  const invalidSimulation=structuredClone(projected);invalidSimulation.simulation!.solver.positions.push(0,0,0);
  scope.onmessage({data:{id:9,format:'archive',project:invalidSimulation}});
  assert.equal(replies[8].type,'error');assert.equal(Object.hasOwn(replies[8],'blob'),false);
 }finally{scope.onmessage=oldMessage;scope.postMessage=oldPost;}
});
