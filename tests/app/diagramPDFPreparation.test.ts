import assert from 'node:assert/strict';
import test from 'node:test';
import {blankDoc} from '../../src/app/state';
import type {DiagramProject} from '../../src/app/diagramProject';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import type {FlatFoldResult,FlatWorkerRequest} from '../../src/core/types';
import {defaultDiagramPDFOptions} from '../../src/app/diagramPDFLayout';
import {diagramPDFPaperStepIds,diagramPDFStepSVG,diagramPDFCoverSVG,prepareDiagramPDFProject,exportDiagramPDF} from '../../src/app/diagramPDF';

let fixtureId=0;
function fixture(count=3):DiagramProject {
  const doc=blankDoc(`PDF 未访问步骤 ${++fixtureId}`,100,100);
  doc.segments.push({id:'valley',a:[50,0],b:[50,100],assignment:'V',angle:180});
  const result=computeFlatFold(doc,undefined,{flatCreases:'marks'});
  assert.equal(result.layers.status,'solved');
  result.layers={status:'unknown',message:'导入后的快照尚未分析层序。'};
  return {format:'zhezhi-diagram',version:1,name:doc.name,activeStepId:'s1',
    states:Array.from({length:count+1},(_,i)=>({id:`c${i}`,revision:1,doc:structuredClone(doc)})),
    steps:Array.from({length:count},(_,i)=>({id:`s${i}`,beforeId:`c${i}`,afterId:`c${i+1}`,title:`纸面 ${i+1}`,description:'',
      pose:{sourceStateId:`c${i}`,sourceRevision:1,sourceDoc:structuredClone(doc),result:structuredClone(result)}}))};
}

test('PDF preparation follows actual panels and includes a visible cover outside the selected range',()=>{
  const project=fixture(),base=defaultDiagramPDFOptions(project);
  assert.deepEqual(diagramPDFPaperStepIds(project,{...base,cover:'none',scope:'current'}),['s1']);
  assert.deepEqual(diagramPDFPaperStepIds(project,{...base,cover:'standard',scope:'range',rangeStart:1,rangeEnd:1,coverImage:'last'}),['s0','s2']);
  assert.deepEqual(diagramPDFPaperStepIds(project,{...base,cover:'diagram',scope:'range',rangeStart:1,rangeEnd:1,coverImage:'current'}),['s0','s1']);
  assert.deepEqual(diagramPDFPaperStepIds(project,{...base,cover:'minimal',scope:'range',rangeStart:1,rangeEnd:1,coverImage:'none'}),['s0']);
});

test('image-only and source-CP placeholder panels do not request unrelated paper analysis',()=>{
  const project=fixture(),options=defaultDiagramPDFOptions(project);
  project.steps[1].paperVisible=false;project.steps[2].pose=null;
  assert.deepEqual(diagramPDFPaperStepIds(project,options),['s0']);
  project.steps[0].description='步骤说明。'.repeat(4000);
  assert.deepEqual(diagramPDFPaperStepIds(project,options),['s0'],'notes pages do not analyse the same panel twice');
});

class WorkerDouble {
  static instances:WorkerDouble[]=[];
  static reply:(request:FlatWorkerRequest,worker:WorkerDouble)=>void=()=>{};
  onmessage?: (event:{data:{type:'result';result:FlatFoldResult}})=>void;
  onerror?: (event:{message:string})=>void;
  request?:FlatWorkerRequest;
  stops=0;
  constructor(){WorkerDouble.instances.push(this);}
  postMessage(request:FlatWorkerRequest){this.request=structuredClone(request);WorkerDouble.reply(request,this);}
  terminate(){this.stops++;}
  finish(result:FlatFoldResult){this.onmessage?.({data:{type:'result',result}});}
}
async function withWorker(run:()=>Promise<void>){
  const prior=globalThis.Worker;WorkerDouble.instances=[];globalThis.Worker=WorkerDouble as unknown as typeof Worker;
  WorkerDouble.reply=(request,worker)=>{assert.equal(request.kind,'layers');if(request.kind==='layers')queueMicrotask(()=>worker.finish(recomputeFlatLayers(request.result,request.options)));};
  try{await run();}finally{globalThis.Worker=prior;}
}

test('unvisited panels and the completion cover await real layer certificates on a private snapshot',async()=>withWorker(async()=>{
  const project=fixture(),before=structuredClone(project),options={...defaultDiagramPDFOptions(project),scope:'range' as const,rangeStart:1,rangeEnd:1,cover:'standard' as const},progress:number[]=[];
  const prepared=await prepareDiagramPDFProject(project,options,{onProgress:({completed})=>progress.push(completed)});
  assert.equal(WorkerDouble.instances.length,2);
  for(const index of [0,2]){
    assert.equal(prepared.steps[index].pose!.result.layers.status,'solved');
    assert.deepEqual(prepared.steps[index].pose!.result.geometry,before.steps[index].pose!.result.geometry);
    assert.doesNotMatch(diagramPDFStepSVG(prepared,prepared.steps[index]),/fill-opacity="0?\.09"/);
  }
  assert.equal(prepared.steps[1].pose!.result.layers.status,'unknown','a non-exported, non-cover panel is untouched');
  assert.doesNotMatch(diagramPDFCoverSVG(prepared,prepared.steps[2]),/fill-opacity="0?\.09"/);
  assert.ok(progress.includes(2));assert.deepEqual(prepared.states,before.states);assert.deepEqual(project,before);
}));

test('an unresolved panel identifies its original step and blocks actual PDF output before runtime loading',async()=>withWorker(async()=>{
  const project=fixture(),before=structuredClone(project),options={...defaultDiagramPDFOptions(project),scope:'current' as const,cover:'none' as const};
  WorkerDouble.reply=(request,worker)=>{assert.equal(request.kind,'layers');if(request.kind==='layers')queueMicrotask(()=>worker.finish({...request.result,layers:{status:'timeout',message:'该纸面层序分析超时。'}}));};
  await assert.rejects(prepareDiagramPDFProject(project,options),/第 2 步（纸面 2）.*超时.*重试/);
  await assert.rejects(exportDiagramPDF(project,options),/第 2 步（纸面 2）.*超时/);
  assert.deepEqual(project,before);
}));

test('cancelling preparation terminates its worker and rejects without producing a stale snapshot',async()=>withWorker(async()=>{
  const project=fixture(),before=structuredClone(project),options={...defaultDiagramPDFOptions(project),cover:'none' as const},controller=new AbortController();
  WorkerDouble.reply=()=>{};
  const pending=prepareDiagramPDFProject(project,options,{signal:controller.signal});
  assert.equal(WorkerDouble.instances.length,1);controller.abort();
  await assert.rejects(pending,{name:'AbortError'});
  assert.equal(WorkerDouble.instances[0].stops,1);assert.equal(WorkerDouble.instances.length,1);
  assert.deepEqual(project,before);
  await assert.rejects(prepareDiagramPDFProject(project,options,{signal:controller.signal}),{name:'AbortError'});
  assert.equal(WorkerDouble.instances.length,1,'an already-cancelled request does not start another worker');
}));
