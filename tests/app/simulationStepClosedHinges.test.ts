import test from 'node:test';
import assert from 'node:assert/strict';
import {closedHingesDuring,createClosedHingeTracker} from '../../src/engine/simStepClosedHinges';
import {compileSimulationStepRigidMechanism} from '../../src/engine/simStepRigid';
import {constrainSimulationStepClosedHinges,validateSimulationStepDynamicMotion} from '../../src/engine/simStepDynamic';
import {simulationTwoHingeFixture} from '../fixtures/simulationStepComplex';

const seed=[0,0,0, 1,0,0, 0,1,0, .2,.7,0, 0,.5,0];
const mesh={vertexCount:5,edgesVertices:[[0,1],[1,3]] as [number,number][],triangleSourceFaces:[0,1,2],
  creaseParams:[{edge:0,face1:0,face2:1,vertex1:2,vertex2:3},{edge:1,face1:1,face2:2,vertex1:0,vertex2:4}]};
const near=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-10);

test('folded-back tips sharing a node leave their own seed invariant while independent constraints still project',()=>{
  const rest=[0,0,0, 1,0,0, 0,1,0, 2e-14,1-2e-14,0, 0,.5,0];
  const m={vertexCount:5,edgesVertices:[[0,1],[0,1]] as [number,number][],creaseParams:[
    {edge:0,face1:0,face2:1,vertex1:2,vertex2:3},
    {edge:1,face1:0,face2:2,vertex1:2,vertex2:4},
  ]};
  const project=createClosedHingeTracker(m,new Set([0]),true,[[2,3]])(new Set([0,1]),rest)!;
  const seed=[...rest];project(seed);
  assert.ok(Math.max(...seed.map((n,i)=>Math.abs(n-rest[i])))<=2e-14);
  const perturbed=[...rest];perturbed[14]=1;project(perturbed);
  near(perturbed[14],.5*perturbed[8]);
  assert.deepEqual(perturbed.slice(6,9),perturbed.slice(9,12));
});

test('connected closed hinges move together, hold the actual pins and release an opening flap',()=>{
  const stack=createClosedHingeTracker(mesh,new Set([0,1]),true),pose=[...seed];
  pose[8]=1;pose[11]=-.3;pose[14]=.7;
  stack(new Set([0,1]),seed)!(pose);
  assert.deepEqual(pose.slice(0,6),seed.slice(0,6));
  assert.ok(pose[8]>.1);
  near(pose[11],.7*pose[8]);near(pose[14],.5*pose[8]);
  const opened=[...pose];opened[14]+=1;
  stack(new Set([0]),pose)!(opened);
  near(opened[11],.7*opened[8]);near(opened[14],pose[14]+1);
  assert.equal(stack(new Set(),opened),undefined);
});

test('a closed target waits for physical closure and keeps existing contact when another finally arrives',()=>{
  const stack=createClosedHingeTracker(mesh,new Set(),true),pending=[...seed];pending[14]=.2;
  const first=stack(new Set([0,1]),pending)!;
  const displaced=[...pending];displaced[14]=.6;first(displaced);near(displaced[14],.6);
  const together=stack(new Set([0,1]),seed)!;assert.notEqual(together,first);
  const flap=[...seed];flap[8]=1;flap[14]=1;together(flap);
  near(flap[11],.1*flap[2]+.2*flap[5]+.7*flap[8]);near(flap[14],.5*flap[2]+.5*flap[8]);
  const reversed=[...seed];reversed[10]=-.7;
  assert.equal(createClosedHingeTracker(mesh,new Set(),true)(new Set([0]),reversed),undefined);
});

test('an open-and-return action is released during both moving halves and held during authored waits',()=>{
  const action={ranges:[{edge:5,fromAngle:180,viaAngle:0,toAngle:180},{edge:6,fromAngle:-180,toAngle:-180}],
    timings:[{edge:5,start:.25,end:.75}]};
  assert.deepEqual([...closedHingesDuring(action,0,.25)],[0,1]);
  assert.deepEqual([...closedHingesDuring(action,.24,.26)],[1]);
  assert.deepEqual([...closedHingesDuring(action,.5,.74)],[1]);
  assert.deepEqual([...closedHingesDuring(action,.75,1)],[0,1]);
});

test('preserve the previously validated guide when enforcing a closed fold would stretch the adjacent panel',()=>{
  const {prepared,animation}=simulationTwoHingeFixture();
  animation.fixedVertices=prepared.fold.vertices_coords.flatMap((p,i)=>p[0]<=1?[i]:[]);
  const body=compileSimulationStepRigidMechanism(prepared,animation),moving=animation.ranges.findIndex(r=>r.toAngle===180);
  const keyframes=Array.from({length:13},(_,i)=>({progress:i/12,positions:Array.from(body.validatePose(
    animation.ranges.map((_,j)=>j===moving?180-i*10:0)))}));
  animation.initialPositions=keyframes[0].positions;
  animation.ranges=animation.ranges.map((r,i)=>({...r,fromAngle:i===moving?180:0,toAngle:i===moving?180:0}));
  const guide=validateSimulationStepDynamicMotion(prepared,animation,{version:1,method:'dynamic',keyframes});
  assert.equal(constrainSimulationStepClosedHinges(prepared,animation,guide),guide);
});
