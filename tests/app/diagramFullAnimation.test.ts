import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {createDiagramProject,appendDiagramStep,updateDiagramCP,updateDiagramFoldLink} from '../../src/app/diagramProject';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {DiagramFullAnimationSession,alignDiagramAnimationStart,diagramAnimationBoundary} from '../../src/app/diagramFullAnimation';
import {startDiagramFullAnimation} from '../../src/app/diagramFullAnimationTask';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import type {Segment} from '../../src/core/types';

const crease=(angle:number):Segment=>({id:'center-fold',a:[50,0],b:[50,100],assignment:angle===0?'F':'V',angle});
function series(angles:number[]){
  let project=createDiagramProject(blankDoc('连续折叠',100,100));
  for(let i=0;i<angles.length;i++){
    if(i)project=appendDiagramStep(project);
    const doc=blankDoc('连续折叠',100,100);doc.segments.push(crease(angles[i]));
    project=updateDiagramCP(project,project.steps[i].afterId,doc);
  }
  return project;
}

test('partial folds continue from their actual endpoint and seeking is deterministic',()=>{
  const project=series([90,167.4,180]),saved=JSON.stringify(project),session=new DiagramFullAnimationSession(project);
  const entries=[0,1,2].map(i=>session.prepare(i,0));
  assert.ok(entries.every(e=>e.cameraFrame.radius>1&&e.cameraFrame.radius<3),'camera uses solver units rather than millimetres');
  for(let i=1;i<entries.length;i++){
    const previous=diagramAnimationBoundary(entries[i-1]);
    const current=entries[i].plan.animation.initialPositions;
    assert.equal(previous.positions.length,current.length);
    assert.ok(current.every((n,v)=>Math.abs(n-previous.positions[v])<2e-6),'no pose reset at step boundaries');
  }
  assert.ok(entries[2].clip.animation.ranges.some(r=>r.fromAngle===167.4&&r.toAngle===180));
  assert.deepEqual(session.prepare(0,0),entries[0]);assert.deepEqual(session.prepare(2,0),entries[2]);
  assert.equal(JSON.stringify(project),saved,'preview never edits source');
});

test('precrease returns to the unfolded endpoint before the next fold',()=>{
  let project=series([0,180]);
  project=updateDiagramFoldLink(project,project.steps[0].id,{enabled:true,layers:'all',selectedFaces:[],precreases:[crease(180)]});
  const session=new DiagramFullAnimationSession(project),first=session.prepare(0,0),next=session.prepare(1,0);
  assert.equal(first.still,false);assert.ok(first.clip.animation.ranges.some(r=>r.viaAngle===180&&r.toAngle===0));
  assert.ok(next.clip.animation.ranges.every(r=>r.fromAngle===0));
  const end=diagramAnimationBoundary(first);assert.ok(next.plan.animation.initialPositions.every((n,i)=>Math.abs(n-end.positions[i])<2e-6));
});

test('seeking back rebuilds evicted trajectories with the same endpoint',()=>{
  const session=new DiagramFullAnimationSession(series([45,90,135,167.4,180]));
  const first=session.prepare(0,0),endpoint=diagramAnimationBoundary(first);
  session.prepare(4,0);
  let rebuilt=false;const restored=session.prepare(0,0,()=>{rebuilt=true;});
  assert.equal(rebuilt,true);assert.deepEqual(diagramAnimationBoundary(restored),endpoint);
});

test('annotation-only steps hold real geometry; the standalone no-motion error remains',()=>{
  const project=appendDiagramStep(createDiagramProject(blankDoc('静止说明',100,100))),session=new DiagramFullAnimationSession(project);
  assert.throws(()=>buildDiagramStepAnimation(project,project.steps[0].id),/没有实际折叠变化/);
  const entry=session.prepare(1,0);assert.equal(entry.still,true);
  assert.ok(diagramAnimationBoundary(entry).positions.every((n,i)=>Math.abs(n-entry.plan.animation.initialPositions[i])<1e-6));
});

test('material or folding discontinuity stops instead of morphing; a new start is explicit',()=>{
  const project=series([90,180]),session=new DiagramFullAnimationSession(project),first=session.prepare(0,0);
  const clip=buildDiagramStepAnimation(project,project.steps[1].id),{prepared}=prepareSimulationDocument(clip.fold),boundary=diagramAnimationBoundary(first);
  boundary.positions[0]+=.1;
  assert.throws(()=>alignDiagramAnimationStart(prepared,clip,boundary),/无法连续衔接/);
  const missing={...boundary,cp:boundary.cp.map(p=>[p[0]+100,p[1]+100])};
  assert.throws(()=>alignDiagramAnimationStart(prepared,clip,missing),/材料范围/);
  assert.equal(session.prepare(1,1).index,1);
});

test('worker posts the project once, routes queued replies, and cancels all outstanding work',async()=>{
  const previous=globalThis.Worker;
  class FakeWorker{
    static last:FakeWorker;messages:any[]=[];stopped=false;
    onmessage:((event:{data:any})=>void)|null=null;onerror:(()=>void)|null=null;onmessageerror:(()=>void)|null=null;
    constructor(){FakeWorker.last=this;}postMessage(message:any){this.messages.push(message);}terminate(){this.stopped=true;}
  }
  globalThis.Worker=FakeWorker as unknown as typeof Worker;
  try{
    const project=series([90,180]),task=startDiagramFullAnimation(project),worker=FakeWorker.last;
    const messages:string[]=[],first=task.prepare(0,0,(_,m)=>messages.push(m)),second=task.prepare(1,0);
    assert.equal(worker.messages.filter(m=>m.type==='init').length,1);
    assert.ok(worker.messages.slice(1).every(m=>!('project' in m)));
    worker.onmessage?.({data:{type:'progress',id:1,index:0,message:'准备纸面'}});
    worker.onmessage?.({data:{type:'result',id:1,entry:{index:0}}});assert.equal((await first).index,0);assert.deepEqual(messages,['准备纸面']);
    task.cancel();worker.onmessage?.({data:{type:'result',id:2,entry:{index:1}}});
    await assert.rejects(second,{name:'AbortError'});assert.equal(worker.stopped,true);
    await assert.rejects(task.prepare(1,0),/已停止/);
  }finally{globalThis.Worker=previous;}
});
