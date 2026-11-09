import test from 'node:test';
import assert from 'node:assert/strict';
import {simulationTwoHingeFixture} from '../fixtures/simulationStepComplex';
import {planSimulationStepDynamic} from '../../src/engine/simStepDynamic';
import {planDiagramStepPlayback} from '../../src/engine/simStepPlanning';
import {solveSimulationStepConeAngles} from '../../src/engine/simStepCone';
import {startSimulationStepPlanning} from '../../src/engine/simStepPlanningClient';
import type {FoldGraph} from '../../src/core/types';

test('numerical animation completes under a slow clock and still honours an explicit deadline',t=>{
 const {prepared,animation}=simulationTwoHingeFixture(),input={...animation,motionPolicy:'allow-dynamic' as const,collisionPolicy:'allow' as const};
 let clock=0;t.mock.method(Date,'now',()=>clock+=60_000);
 const motion=planSimulationStepDynamic(prepared,input,{steps:32,iterationsPerStep:640,finalIterations:3000});
 assert.equal(motion.keyframes.at(-1)!.progress,1);assert.ok(motion.maxEdgeStrain<.03);assert.ok(motion.maxFixedDisplacement<1e-7);
 assert.ok(clock>120_000,'test crosses the former default and hard maximum');
 assert.throws(()=>planSimulationStepDynamic(prepared,input,{maxTimeMs:100}),/超时/);
});

test('diagram rigid path is not discarded just because planning took over a minute',t=>{
 const {fold,animation}=simulationTwoHingeFixture();let clock=0;t.mock.method(Date,'now',()=>clock+=60_000);
 const result=planDiagramStepPlayback(fold as FoldGraph,animation);
 assert.equal(result.method,'simultaneous');assert.deepEqual(result.animation.ranges,animation.ranges);
 assert.deepEqual(result.animation.fixedVertices,animation.fixedVertices);
});

test('cone closure retains geometric convergence checks without a default time cutoff',t=>{
 let clock=0;t.mock.method(performance,'now',()=>clock+=30_000);
 const problem={rayAngles:Array.from({length:17},(_,i)=>Math.PI*2*i/17),activeRay:0,fixedSector:5};
 const solved=solveSimulationStepConeAngles(problem,Math.PI/6);
 assert.ok(solved.closureResidual<1e-8);assert.ok(clock>30_000);
 assert.throws(()=>solveSimulationStepConeAngles(problem,Math.PI/6,undefined,{maxTimeMs:100}),/预算/);
});

test('unlimited planning remains cancellable, ignores late results, and reports broken worker messages',async t=>{
 class FakeWorker {
  static latest:FakeWorker;terminated=false;onmessage?:(event:any)=>void;onmessageerror?:()=>void;
  constructor(){FakeWorker.latest=this;}postMessage(){}terminate(){this.terminated=true;}
 }
 const original=globalThis.Worker;globalThis.Worker=FakeWorker as unknown as typeof Worker;
 try{
  t.mock.method(globalThis,'setTimeout',()=>{throw Error('default planning must not install a timer');});
  const {fold,animation}=simulationTwoHingeFixture(),messages:string[]=[];
  const task=startSimulationStepPlanning(fold as FoldGraph,animation,{onProgress:m=>messages.push(m)}),worker=FakeWorker.latest;
  worker.onmessage?.({data:{type:'progress',message:'50%'}});assert.deepEqual(messages,['50%']);
  task.cancel();await assert.rejects(task.promise,{name:'AbortError'});assert.equal(worker.terminated,true);
  worker.onmessage?.({data:{type:'result',result:{}}});worker.onmessage?.({data:{type:'progress',message:'late'}});assert.deepEqual(messages,['50%']);
  const broken=startSimulationStepPlanning(fold as FoldGraph,animation);FakeWorker.latest.onmessageerror?.();
  await assert.rejects(broken.promise,/无法读取/);assert.equal(FakeWorker.latest.terminated,true);
 }finally{globalThis.Worker=original;}
});
