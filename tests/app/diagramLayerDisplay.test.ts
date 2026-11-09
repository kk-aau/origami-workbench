import test from 'node:test';
import assert from 'node:assert/strict';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import type {FlatFoldResult,FlatWorkerRequest} from '../../src/core/types';
import {blankDoc} from '../../src/app/state';
import {adoptDiagramPose,appendDiagramStep,createDiagramProject,exportDiagramProject,importDiagramProject,type DiagramProject} from '../../src/app/diagramProject';
import {applyDiagramLayerAnalysis,applyDiagramStepLayerAnalysis,diagramLayerAnalysisKey,diagramStepLayerAnalysisKey} from '../../src/app/diagramLayerAnalysis';
import {diagramLayerDisplaySignature,diagramLayerDisplayState,reuseDiagramLayerDisplay,startDiagramLayerDisplayPreparation} from '../../src/app/diagramLayerDisplay';
import {diagramModelMarkup} from '../../src/app/diagramDrawing';

function fixture(steps=2,multiple=false):DiagramProject {
  const doc=blankDoc('快照纸面显示',100,100);
  for(const x of multiple?[20,40,60,80]:[50])doc.segments.push({id:`v-${x}`,a:[x,0],b:[x,100],assignment:'V',angle:180});
  const solved=computeFlatFold(doc,undefined,{flatCreases:'marks'});
  assert.equal(solved.layers.status,'solved',solved.layers.message);
  let project=createDiagramProject(doc);
  for(let index=0;index<steps;index++){
    if(index)project=appendDiagramStep(project);
    project=adoptDiagramPose(project,project.activeStepId,project.steps.at(-1)!.beforeId,solved);
    delete project.steps.at(-1)!.pose!.displayOrder;
  }
  return importDiagramProject(exportDiagramProject(project));
}

class SolverWorker {
  static requests:FlatWorkerRequest[]=[];
  static response:((result:FlatFoldResult)=>FlatFoldResult)|undefined;
  static delay=false;
  static live=0;
  static maximum=0;
  onmessage:((event:{data:{type:'result';result:FlatFoldResult}})=>void)|undefined;
  onerror:unknown;
  stopped=false;
  constructor(..._args:unknown[]){SolverWorker.live++;SolverWorker.maximum=Math.max(SolverWorker.maximum,SolverWorker.live);}
  postMessage(request:FlatWorkerRequest){
    SolverWorker.requests.push(structuredClone(request));
    if(SolverWorker.delay)return;
    queueMicrotask(()=>{
      if(this.stopped)return;
      assert.ok('kind' in request&&request.kind==='layers','display preparation analyses the saved geometry, never refolds its CP');
      const solved=recomputeFlatLayers(request.result,request.options);
      this.onmessage?.({data:{type:'result',result:SolverWorker.response?.(solved)??solved}});
    });
  }
  terminate(){if(!this.stopped){SolverWorker.live--;this.stopped=true;}}
}
async function withSolver(run:()=>Promise<void>){
  const before=globalThis.Worker;SolverWorker.requests=[];SolverWorker.response=undefined;SolverWorker.delay=false;SolverWorker.live=0;SolverWorker.maximum=0;
  globalThis.Worker=SolverWorker as unknown as typeof Worker;
  try{await run();}finally{globalThis.Worker=before;}
}

test('inactive display analysis has an independent safe merge without weakening the active request guard',()=>{
  const project=fixture(),step=project.steps[0],key=diagramStepLayerAnalysisKey(project,step.id)!;
  assert.ok(key);assert.equal(diagramLayerAnalysisKey(project,step.id),null);
  const answer=recomputeFlatLayers(step.pose!.result),before=structuredClone(project);
  assert.equal(applyDiagramLayerAnalysis(project,step.id,key,answer),project);
  const next=applyDiagramStepLayerAnalysis(project,step.id,key,answer);
  assert.notEqual(next,project);assert.equal(next.activeStepId,project.activeStepId);
  assert.equal(next.states,project.states);assert.equal(next.steps[0].pose!.result.geometry,step.pose!.result.geometry);
  assert.equal(next.steps[1],project.steps[1]);assert.deepEqual(project,before);
  answer.layers.faceOrders![0][2]*=-1;
  assert.notDeepEqual(next.steps[0].pose!.result.layers,answer.layers,'worker-owned arrays do not alias the live project');
});

test('legacy implicit candidate zero has the same export identity before and after a fresh layer certificate',()=>{
  const project=fixture(2),step=project.steps[0];
  for(const item of project.steps)delete item.pose!.layerSolutionIndex;
  step.paperStates={active:'flat',flat:structuredClone(step.pose!),pulled:structuredClone(step.pose!)};
  const before=structuredClone(project),signature=diagramLayerDisplaySignature(project);
  const answer=recomputeFlatLayers(step.pose!.result),key=diagramStepLayerAnalysisKey(project,step.id)!;
  const analysed=applyDiagramStepLayerAnalysis(project,step.id,key,answer);
  assert.equal(analysed.steps[0].pose!.result.layers.status,'solved');
  assert.equal(diagramLayerDisplaySignature(analysed),signature);
  assert.deepEqual(project,before,'identity generation never changes the live project');
  const explicit=structuredClone(project);
  for(const item of explicit.steps)if(item.pose)item.pose.layerSolutionIndex=0;
  explicit.steps[0].paperStates!.flat.layerSolutionIndex=0;explicit.steps[0].paperStates!.pulled.layerSolutionIndex=0;
  assert.equal(diagramLayerDisplaySignature(explicit),signature,'saved explicit zero and legacy default zero identify the same choice');
});

test('display identity tracks selected candidates, saved geometry, CP, camera and drawing edits',()=>{
  const project=fixture(1,true),signature=diagramLayerDisplaySignature(project);
  const mutations:Array<(next:DiagramProject)=>void>=[
    next=>{next.steps[0].pose!.layerSolutionIndex=1;},
    next=>{const pose=next.steps[0].pose!;pose.result.geometry.vertices[0][0]+=.1;pose.result.geometry.graph!.vertices_coords[0][0]+=.1;},
    next=>{next.states.at(-1)!.doc.name='操作后 CP 已修改';next.states.at(-1)!.revision++;},
    next=>{next.steps[0].pose!.view!.rotation=45;},
    next=>{next.steps[0].annotations=[{id:'added-line',kind:'line',a:[0,0],b:[10,10],style:'auxiliary',color:'#293d35',width:.7}];},
    next=>{next.steps[0].annotations=[{id:'added-symbol',kind:'symbol',symbol:'referencePoint',position:[10,10],size:10,rotation:0,color:'#293d35',width:.7}];},
  ];
  for(const mutate of mutations){const edited=structuredClone(project);mutate(edited);assert.notEqual(diagramLayerDisplaySignature(edited),signature);}
  const paper=structuredClone(project),pose=paper.steps[0].pose!;paper.steps[0].paperStates={active:'flat',flat:structuredClone(pose),pulled:structuredClone(pose)};
  const previous=diagramLayerDisplaySignature(paper);paper.steps[0].paperStates!.pulled.layerSolutionIndex=1;
  assert.notEqual(diagramLayerDisplaySignature(paper),previous,'the inactive paper-state candidate is part of the saved drawing identity');
  const invalid=structuredClone(project);invalid.steps[0].pose!.layerSolutionIndex=-1;
  assert.throws(()=>diagramLayerDisplaySignature(invalid),/方案编号/,'signature normalization preserves the saving boundary validation');
});

test('inactive results reject changed CP, material pose, candidate, constraints and active paper-state caches',()=>{
  const project=fixture(),step=project.steps[0],key=diagramStepLayerAnalysisKey(project,step.id)!,answer=recomputeFlatLayers(step.pose!.result);
  const mutations:Array<(next:DiagramProject)=>void>=[
    next=>next.states[0].revision++,
    next=>{next.states[0].doc.segments[0].assignment='M';},
    next=>{next.steps[0].pose!.result.geometry.vertices[0][0]+=.1;},
    next=>{next.steps[0].pose!.layerSolutionIndex=1;},
    next=>{next.steps[0].pose!.result.layers.constraints=[{face:0,side:'white'}];},
    next=>{const pose=next.steps[0].pose!;next.steps[0].paperStates={active:'flat',flat:structuredClone(pose),pulled:structuredClone(pose)};next.steps[0].paperStates!.flat.result.geometry.modified=true;},
    next=>{const pose=next.steps[0].pose!;next.steps[0].paperStates={active:'flat',flat:structuredClone(pose),pulled:structuredClone(pose)};next.steps[0].paperStates!.flat.layerSolutionIndex=1;},
  ];
  for(const mutate of mutations){const changed=structuredClone(project);mutate(changed);assert.equal(applyDiagramStepLayerAnalysis(changed,step.id,key,answer),changed);}
  const camera=structuredClone(project);camera.steps[0].pose!.view!.rotation=90;camera.steps[0].pose!.hiddenFaces=[0];
  assert.equal(diagramStepLayerAnalysisKey(camera,step.id),key);assert.notEqual(applyDiagramStepLayerAnalysis(camera,step.id,key,answer),camera);
});

test('opening a multi-step snapshot prepares inactive and current paper before display without changing CP or geometry',async()=>withSolver(async()=>{
  const project=fixture(3),before=structuredClone(project),progress:number[]=[];
  for(const step of project.steps)assert.equal(diagramLayerDisplayState(project,step.id).status,'pending');
  const prepared=await startDiagramLayerDisplayPreparation(project,{onProgress:value=>progress.push(value.completed)}).promise;
  assert.equal(prepared.cancelled,false);assert.deepEqual(prepared.issues,[]);assert.deepEqual(progress,[1,2,3]);
  assert.equal(SolverWorker.requests.length,3);assert.equal(SolverWorker.maximum,1,'one sequential worker bounds the batch');
  assert.deepEqual(project,before);assert.deepEqual(prepared.project.states,project.states);assert.equal(prepared.project.activeStepId,project.activeStepId);
  for(let index=0;index<3;index++){
    const pose=prepared.project.steps[index].pose!;
    assert.deepEqual(pose.result.geometry,project.steps[index].pose!.result.geometry);
    assert.deepEqual(pose.sourceDoc,project.steps[index].pose!.sourceDoc);
    assert.equal(pose.result.layers.status,'solved');assert.doesNotMatch(diagramModelMarkup(pose),/fill-opacity="0\.09"/);
    assert.equal(diagramLayerDisplayState(prepared.project,prepared.project.steps[index].id).status,'ready');
  }
}));

test('the exact nonzero saved candidate is solved again instead of replacing it with candidate zero',async()=>withSolver(async()=>{
  const project=fixture(1,true),step=project.steps[0];step.pose!.layerSolutionIndex=1;
  const original=structuredClone(project),expected=recomputeFlatLayers(step.pose!.result,{solutionIndex:1});
  assert.equal(expected.layers.solutionCountExact,'4');assert.equal(expected.layers.status,'solved');
  const prepared=await startDiagramLayerDisplayPreparation(project).promise;
  assert.deepEqual(prepared.issues,[]);assert.deepEqual(project,original);
  assert.equal(prepared.project.steps[0].pose!.result.layers.solutionIndex,1);
  assert.deepEqual(prepared.project.steps[0].pose!.result.layers.faceOrders,expected.layers.faceOrders);
  const request=SolverWorker.requests[0];assert.ok('kind' in request);assert.equal(request.options?.solutionIndex,1);
}));

test('fresh runtime certificates can be reused synchronously with no mutable arrays shared across projects',async()=>withSolver(async()=>{
  const project=fixture(1),step=project.steps[0],prepared=await startDiagramLayerDisplayPreparation(project).promise;
  assert.deepEqual(prepared.issues,[]);
  const reused=reuseDiagramLayerDisplay(project);
  assert.equal(reused.steps[0].pose!.result.layers.status,'solved');assert.equal(reused.steps[0].pose!.result.geometry,step.pose!.result.geometry);
  reused.steps[0].pose!.result.layers.faceOrders![0][2]*=-1;
  const again=await startDiagramLayerDisplayPreparation(project).promise;
  assert.deepEqual(again.issues,[]);assert.equal(SolverWorker.requests.length,1);
  assert.deepEqual(again.project.steps[0].pose!.result.layers,prepared.project.steps[0].pose!.result.layers);
  const changed=structuredClone(project);changed.steps[0].pose!.layerSolutionIndex=1;
  assert.equal(reuseDiagramLayerDisplay(changed),changed,'another saved candidate cannot use the old cached certificate');
}));

test('the runtime certificate cache evicts old entries and remains bounded across many projects',async()=>withSolver(async()=>{
  const first=fixture(1);await startDiagramLayerDisplayPreparation(first).promise;
  let last=first;
  for(let index=0;index<17;index++){last=fixture(1);const prepared=await startDiagramLayerDisplayPreparation(last).promise;assert.deepEqual(prepared.issues,[]);}
  assert.equal(SolverWorker.requests.length,18);
  assert.equal(reuseDiagramLayerDisplay(first),first,'the oldest project no longer occupies the bounded runtime cache');
  assert.notEqual(reuseDiagramLayerDisplay(last),last,'the newest certificate is reusable');
}));

test('a selected preparation range leaves excluded steps pending and updates only the active paper-state cache',async()=>withSolver(async()=>{
  const project=fixture(3),step=project.steps[1],pose=step.pose!,flat=structuredClone(pose),pulled=structuredClone(pose);
  pulled.result.geometry.modified=true;step.paperStates={active:'flat',flat,pulled};
  const before=structuredClone(project),prepared=await startDiagramLayerDisplayPreparation(project,{stepIds:[step.id,step.id]}).promise;
  assert.deepEqual(prepared.issues,[]);assert.equal(SolverWorker.requests.length,1);assert.deepEqual(project,before);
  assert.equal(prepared.project.steps[0].pose!.result.layers.status,'unknown');assert.equal(prepared.project.steps[2].pose!.result.layers.status,'unknown');
  const updated=prepared.project.steps[1];assert.deepEqual(updated.paperStates!.pulled,pulled);
  assert.deepEqual(updated.paperStates!.flat.result.layers,updated.pose!.result.layers);
  assert.equal(updated.pose!.result.layers.status,'solved');
}));

test('cancellation terminates the worker and discards the batch without caching a late answer',async()=>withSolver(async()=>{
  const project=fixture(1);SolverWorker.delay=true;
  const task=startDiagramLayerDisplayPreparation(project);assert.equal(SolverWorker.live,1);task.cancel();
  const stopped=await task.promise;
  assert.equal(stopped.cancelled,true);assert.equal(stopped.project,project);assert.deepEqual(stopped.issues,[]);assert.equal(SolverWorker.live,0);
  assert.equal(reuseDiagramLayerDisplay(project),project);
  SolverWorker.delay=false;const retried=await startDiagramLayerDisplayPreparation(project).promise;
  assert.deepEqual(retried.issues,[]);assert.equal(SolverWorker.requests.length,2);
}));

test('timeout remains an explicit issue and retry starts a real new analysis',async()=>withSolver(async()=>{
  const project=fixture(1);SolverWorker.response=result=>({...result,layers:{status:'timeout',message:'层序计算超时，请重试。'}});
  const failed=await startDiagramLayerDisplayPreparation(project).promise;
  assert.match(failed.issues[0].message,/超时/);assert.equal(failed.project.steps[0].pose!.result.layers.status,'unknown');assert.equal(reuseDiagramLayerDisplay(project),project);
  SolverWorker.response=undefined;const retried=await startDiagramLayerDisplayPreparation(project).promise;
  assert.deepEqual(retried.issues,[]);assert.equal(SolverWorker.requests.length,2);
}));

test('malformed or wrong-candidate solver output never becomes a display certificate',async()=>withSolver(async()=>{
  for(const mutate of [
    (result:FlatFoldResult)=>{result.layers.solutionIndex=1;},
    (result:FlatFoldResult)=>{result.layers.faceOrders=[[0,999,1]];},
    (result:FlatFoldResult)=>{result.geometry.vertices[0][0]+=.1;result.geometry.graph!.vertices_coords[0][0]+=.1;},
  ]){
    const project=fixture(1);SolverWorker.response=result=>{mutate(result);return result;};
    const failed=await startDiagramLayerDisplayPreparation(project).promise;
    assert.match(failed.issues[0].message,/不一致/);assert.equal(failed.project.steps[0].pose!.result.layers.status,'unknown');assert.equal(reuseDiagramLayerDisplay(project),project);
  }
}));

test('an underdetermined local surface is reported instead of silently exported as apparently valid paper',async()=>withSolver(async()=>{
  const project=fixture(1);SolverWorker.response=result=>{delete result.layers.faceOrder;result.layers.faceOrders=[];return result;};
  const prepared=await startDiagramLayerDisplayPreparation(project).promise;
  assert.match(prepared.issues[0].message,/未确认.*局部层序/);assert.equal(reuseDiagramLayerDisplay(project),project);
}));

test('explicit manual order, X-ray, torn inspection and hidden-paper choices retain their existing display contract',async()=>withSolver(async()=>{
  const project=fixture(4);
  project.steps[0].pose!.displayOrder=[1,0];project.steps[1].pose!.view!.xray=true;
  project.steps[2].annotations=[{id:'window',kind:'symbol',symbol:'tearWindow',position:[25,25],size:20,rotation:0,color:'#222222',width:1,cutawayFaces:[0]}];
  project.steps[3].paperVisible=false;
  const prepared=await startDiagramLayerDisplayPreparation(project).promise;
  assert.deepEqual(prepared.issues,[]);assert.equal(SolverWorker.requests.length,0);assert.deepEqual(prepared.project,project);
  assert.doesNotMatch(diagramModelMarkup(prepared.project.steps[0].pose!),/fill-opacity="0\.09"/);
  assert.match(diagramModelMarkup(prepared.project.steps[1].pose!),/fill-opacity="0\.09"/,'intentional transparency remains intentional');
}));

test('unknown source identity and out-of-range candidate report a step issue rather than refolding or choosing another solution',async()=>withSolver(async()=>{
  const stale=fixture(1);stale.states[0].revision++;
  assert.equal(diagramLayerDisplayState(stale,stale.steps[0].id).status,'unsupported');
  const failed=await startDiagramLayerDisplayPreparation(stale).promise;assert.match(failed.issues[0].message,/来源 CP/);assert.equal(SolverWorker.requests.length,0);
  const invalid=fixture(1);invalid.steps[0].pose!.layerSolutionIndex=99;
  const rejected=await startDiagramLayerDisplayPreparation(invalid).promise;
  assert.match(rejected.issues[0].message,/编号超出/);assert.equal(rejected.project.steps[0].pose!.layerSolutionIndex,99);assert.equal(rejected.project.steps[0].pose!.result.layers.status,'unknown');
}));
