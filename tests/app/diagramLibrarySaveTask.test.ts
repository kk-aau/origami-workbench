import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {createDiagramProject,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {computeFlatFold} from '../../src/core/flatFold';
import {adoptDiagramPose} from '../../src/app/diagramProject';
import {createDiagramProjectSaveBlob,getDiagramProjectSaveBlob,registerDiagramProjectSaveBlob} from '../../src/app/diagramProjectTransport';
import {createDiagramLibrarySaveClient,type DiagramLibrarySaveRequest,type DiagramLibrarySaveReply} from '../../src/app/diagramLibrarySaveTask';
import {createDiagramLibrary,DIAGRAM_LIBRARY_KEY} from '../../src/app/diagramLibrary';
import {connect} from '../../src/app/api';

function fixture(){
  const doc=blankDoc('后台保存传输',100,100);doc.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'V',angle:180});
  const project=createDiagramProject(doc);return adoptDiagramPose(project,project.activeStepId,project.states[0].id,computeFlatFold(doc));
}
function backing(values=new Map<string,string>()){
  return {values,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},compareAndSet(key:string,expected:string|null,value:string){if((values.get(key)??null)!==expected)return false;values.set(key,value);return true;}};
}

test('prepared save bytes are identity bound and never inferred from persisted properties or immutable edits',async()=>{
  const project=fixture(),blob=createDiagramProjectSaveBlob(project);
  assert.equal(getDiagramProjectSaveBlob(project),undefined);
  registerDiagramProjectSaveBlob(project,blob);assert.equal(getDiagramProjectSaveBlob(project),blob);
  assert.deepEqual(JSON.parse(await blob.text()),JSON.parse(JSON.stringify(project)));
  assert.equal(getDiagramProjectSaveBlob(structuredClone(project)),undefined);
  assert.equal(getDiagramProjectSaveBlob({...project,name:'修改后的名称'}),undefined);
  assert.equal(getDiagramProjectSaveBlob({...project,projectBlob:blob,prepared:true} as typeof project),undefined);
  assert.throws(()=>registerDiagramProjectSaveBlob(project,new Blob(['{}'])),/不完整/);
});

test('save client forwards a reusable Blob and small settings without walking the registered project graph',async()=>{
  const previousFetch=globalThis.fetch,previousLocation=Object.getOwnPropertyDescriptor(globalThis,'location');
  try{
    globalThis.fetch=async()=>({ok:true,json:async()=>({token:'test-save-token'})}) as Response;
    Object.defineProperty(globalThis,'location',{configurable:true,value:{href:'http://127.0.0.1:8788/'}});await connect();
    const sent:DiagramLibrarySaveRequest[]=[];
    const worker={onmessage:null as ((event:{data:DiagramLibrarySaveReply})=>void)|null,onerror:null,onmessageerror:null,terminated:0,
      postMessage(request:DiagramLibrarySaveRequest){sent.push(structuredClone(request));},terminate(){this.terminated++;}};
    const client=createDiagramLibrarySaveClient(()=>worker as unknown as Worker),project=fixture(),blob=createDiagramProjectSaveBlob(project);
    registerDiagramProjectSaveBlob(project,blob);
    // The Blob was completed in the import Worker. Posting this snapshot must
    // never visit its CP/geometry graph on the UI thread a second time.
    Object.defineProperty(project,'states',{enumerable:true,get(){throw Error('UI walked the prepared geometry');}});
    const first=client.save({project,settings:{kind:'draft'},openedHead:'exact-opened-head',legacyDraft:true});
    assert.equal(sent.length,1);assert.equal('project' in sent[0].request,false);
    const transport=sent[0].request;assert.ok('projectBlob' in transport);
    assert.equal(transport.openedHead,'exact-opened-head');assert.equal(transport.legacyDraft,true);
    if('projectBlob' in transport)assert.equal(await transport.projectBlob.text(),await blob.text());
    const receipt={entry:{id:'receipt'},index:{documents:[],folders:[]},thumbnail:null,warnings:[]} as unknown as Extract<DiagramLibrarySaveReply,{type:'result'}>['result'];
    worker.onmessage!({data:{id:sent[0].id,type:'result',result:receipt}});assert.equal(await first,receipt);
    const retry=client.save({project,settings:{kind:'draft'}});assert.ok('projectBlob' in sent[1].request);
    worker.onmessage!({data:{id:sent[1].id,type:'result',result:receipt}});await retry;
    const ordinary=fixture(),normal=client.save({project:ordinary,settings:{kind:'draft'}});assert.ok('project' in sent[2].request);
    worker.onmessage!({data:{id:sent[2].id,type:'result',result:receipt}});await normal;
    await client.dispose();assert.equal(worker.terminated,1);
  }finally{
    globalThis.fetch=previousFetch;if(previousLocation)Object.defineProperty(globalThis,'location',previousLocation);else Reflect.deleteProperty(globalThis,'location');
  }
});

test('actual save Worker keeps full validation, exact content, sequential commits and opened-head conflicts for Blob transport',async()=>{
  const scope=globalThis as any,oldMessage=scope.onmessage,oldPost=scope.postMessage;
  try{
    const waiting=new Map<number,(reply:DiagramLibrarySaveReply)=>void>();
    scope.postMessage=(reply:DiagramLibrarySaveReply)=>{const resolve=waiting.get(reply.id);assert.ok(resolve);waiting.delete(reply.id);resolve(reply);};
    await import('../../src/workers/diagramLibrarySave.worker');
    const dispatch=(input:DiagramLibrarySaveRequest)=>new Promise<DiagramLibrarySaveReply>(resolve=>{waiting.set(input.id,resolve);scope.onmessage({data:structuredClone(input)});});
    const project=fixture(),blob=createDiagramProjectSaveBlob(project),input=(id:number,request:DiagramLibrarySaveRequest['request'],values:Map<string,string>=new Map()):DiagramLibrarySaveRequest=>({id,request,url:'http://unused/',token:'test',webPreferences:[...values]});
    const reply=await dispatch(input(1,{projectBlob:blob,settings:{kind:'draft'},legacyDraft:true}));assert.equal(reply.type,'result');if(reply.type!=='result')return;
    const store=backing(new Map(reply.webUpdates)),library=createDiagramLibrary(store),loaded=library.load(reply.result.entry.id);
    assert.deepEqual(loaded,importDiagramProject(exportDiagramProject(project)));
    assert.equal(reply.result.warnings.length,0);
    const previousIndex=store.getItem(DIAGRAM_LIBRARY_KEY),previousEntry=reply.result.entry;
    const externallyChanged={...loaded,name:'其他窗口已保存'};library.save(externallyChanged,{id:previousEntry.id,kind:'saved'});
    assert.notEqual(store.getItem(DIAGRAM_LIBRARY_KEY),previousIndex);
    const conflict=await dispatch(input(2,{projectBlob:blob,settings:{id:previousEntry.id,kind:'draft'},openedHead:JSON.stringify([previousEntry.draftKey,previousEntry.savedKey,previousEntry.modifiedAt,previousEntry.name])},store.values));
    assert.equal(conflict.type,'error');if(conflict.type==='error')assert.equal(conflict.conflict,true);
    assert.equal(createDiagramLibrary(store).load(previousEntry.id).name,'其他窗口已保存');
    const invalid=fixture();invalid.states[0].doc.paper.width=-1;
    const results=await Promise.all([
      dispatch(input(3,{projectBlob:new Blob(['{broken'],{type:'application/json'}),settings:{kind:'draft'}})),
      dispatch(input(4,{projectBlob:createDiagramProjectSaveBlob(invalid),settings:{kind:'draft'}})),
      dispatch(input(5,{projectBlob:blob,settings:{kind:'draft'}})),
    ]);
    assert.deepEqual(results.map(result=>result.type),['error','error','result'],'invalid JSON or geometry never commits, and a failed job cannot poison the queue');
    for(const result of results.slice(0,2))assert.equal('webUpdates' in result,false);
  }finally{scope.onmessage=oldMessage;scope.postMessage=oldPost;}
});
