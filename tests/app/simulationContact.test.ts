import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateSimulationContactStep,SimulationContactGuard} from '../../src/engine/simContact';
import {certifySimulationStepFlexPath} from '../../src/engine/simStepFlexCollision';
import {inspectSimulationStepCollisions} from '../../src/engine/simStepCollision';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import {projectSimulationContactMotion} from '../../src/engine/simContactResponse';

const mesh={indices:[0,1,2,3,4,5],triangleSourceFaces:[7,7]},horizontal=[-2,-2,0,2,-2,0,0,2,0],vertical=(z:number,height=.8)=>[0,-.5,z-height,0,.5,z-height,0,0,z+height];
const shifted=(z:number)=>[...horizontal,...horizontal.map((v,i)=>i%3===2?z:v)];

test('physical contact blocks a crossing between clear endpoints and certifies the exact limited motion',()=>{
  const first=[...horizontal,...vertical(.13,.001)],last=[...horizontal,...vertical(-.87,.001)];
  for(let i=0;i<=8;i++)assert.equal(inspectSimulationStepCollisions(mesh,first.map((v,k)=>v+(last[k]-v)*i/8)).status,'clear');
  const result=evaluateSimulationContactStep(mesh,first,last,{maxTimeMs:1000});
  assert.equal(result.status,'limited');assert(result.fraction>0&&result.fraction<.13);assert.equal(result.certificate.status,'clear');
  const verification=certifySimulationStepFlexPath(mesh,[{progress:0,positions:first},{progress:1,positions:result.positions}],{contactMode:'nonpenetration'});
  assert.equal(verification.status,'clear');assert.deepEqual(mesh.triangleSourceFaces,[7,7],'same source material cannot exempt its own self contact');
});

test('parallel sheets stop at contact and cannot exchange their material sides',()=>{
  const result=evaluateSimulationContactStep(mesh,shifted(1),shifted(-1),{maxTimeMs:1000});
  assert.equal(result.status,'limited');assert(result.fraction<=.5);assert(result.positions[11]>=0);assert.equal(result.certificate.status,'clear');
  assert.equal(evaluateSimulationContactStep(mesh,shifted(1),shifted(0)).status,'clear','arrival at a proven-side contact is allowed');
});

test('legal coplanar stationary contact is accepted without guessing an initially overlapping stack departure',()=>{
  assert.equal(evaluateSimulationContactStep(mesh,shifted(0),shifted(0)).status,'clear');
  const translated=shifted(0).map((v,i)=>i%3===0?v+.5:v);
  assert.equal(evaluateSimulationContactStep(mesh,shifted(0),translated).status,'clear');
  const departure=evaluateSimulationContactStep(mesh,shifted(0),shifted(1),{maxTimeMs:1000});
  assert.equal(departure.status,'blocked');assert.equal(departure.failure,'direction');assert.equal(departure.fraction,0);assert.match(departure.reason!,/离层方向/);
  assert.equal(certifySimulationStepFlexPath(mesh,[{progress:0,positions:shifted(0)},{progress:1,positions:shifted(0)}],{maxDepth:3}).status,'inconclusive','strict animation certification keeps its previous meaning');
});

test('shared material vertices do not conceal remote edge-face or edge-edge penetration',()=>{
  const positions=[0,0,0,2,0,0,0,2,0,1,1,1,1,1,-1],result=evaluateSimulationContactStep({indices:[0,1,2,0,3,4]},positions,positions);
  assert.equal(result.status,'blocked');assert.equal(result.failure,'collision');assert.equal(result.certificate.progress,0);
});

test('budgets and invalid candidate geometry keep the original pose instead of accepting an unchecked move',()=>{
  const before=shifted(1),budget=evaluateSimulationContactStep(mesh,before,shifted(-1),{maxTimeMs:0});
  assert.equal(budget.status,'blocked');assert.equal(budget.failure,'budget');assert.deepEqual([...budget.positions],before);
  const invalid=[...before];invalid[3]=NaN;const bad=evaluateSimulationContactStep(mesh,before,invalid);
  assert.equal(bad.status,'blocked');assert.equal(bad.failure,'invalid');assert.deepEqual([...bad.positions],before);
});

function fixture(){
  const source={vertices_coords:[[-2,-2,0],[2,-2,0],[0,2,0],[-1,-1,1],[1,-1,1],[0,1,1]],edges_vertices:[[0,1],[1,2],[2,0],[3,4],[4,5],[5,3]],edges_assignment:['B','B','B','B','B','B'],edges_foldAngle:[0,0,0,0,0,0],faces_vertices:[[0,1,2],[3,4,5]]};
  const prepared=prepareSimulationDocument(source).prepared,model=new OrigamiModel(prepared),solver=new ReferenceSolver(model);return {prepared,model,solver};
}

test('runtime guard checks each actual solver substep and commits only a safe quantized snapshot with fixed pins',()=>{
  const {prepared,model,solver}=fixture();solver.setVertexConstraint(0,[...model.positions.slice(0,3)] as [number,number,number]);
  const prior=solver.capturePose(),calls:number[]=[];
  solver.step=count=>{calls.push(count!);const candidate=solver.capturePose();for(let v=3;v<6;v++){const i=v*3+1;candidate.displacements[i]=-1;candidate.positions[i]=Math.fround(model.originalPositions[i]-1);}solver.restorePose(candidate);};
  const guard=new SimulationContactGuard(prepared,solver,{maxTimeMs:1000});assert.equal(guard.initialize().status,'clear');
  const result=guard.step(20);assert.equal(result.status,'limited');assert.deepEqual(calls,[1]);assert.equal(result.advancedSteps,1);assert.equal(solver.maxVelocity(),0);
  const after=solver.capturePose();assert.deepEqual(after.pins,prior.pins);assert.deepEqual(after.positions.slice(0,9),prior.positions.slice(0,9));
  assert.equal(certifySimulationStepFlexPath({indices:prepared.indices},[{progress:0,positions:prior.positions},{progress:1,positions:after.positions}],{contactMode:'nonpenetration'}).status,'clear');
  after.positions.forEach((v,i)=>assert.equal(Math.fround(model.originalPositions[i]+after.displacements[i]),v));solver.dispose();
});

test('unsafe initialization never performs a solver advance and reports the protection pause',()=>{
  const {prepared,solver}=fixture(),guard=new SimulationContactGuard(prepared,solver,{maxTimeMs:0});let count=0;solver.step=()=>{count++;};
  const result=guard.initialize();assert.equal(result.status,'blocked');assert.equal(result.failure,'budget');assert.match(result.reason!,/已暂停，未推进/);assert.equal(count,0);solver.dispose();
});

test('a real spring-driven flap stops on a separate pinned sheet before the unprotected trajectory crosses it',()=>{
  const source={vertices_coords:[[-1,-1,0],[0,-1,0],[1,-1,0],[1,1,0],[0,1,0],[-1,1,0],[.2,-1,.5],[1.2,-1,.5],[1.2,1,.5],[.2,1,.5]],edges_vertices:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,4],[6,7],[7,8],[8,9],[9,6]],edges_assignment:['B','B','B','B','B','B','V','B','B','B','B'],edges_foldAngle:[0,0,0,0,0,0,180,0,0,0,0],faces_vertices:[[0,1,4,5],[1,2,3,4],[6,7,8,9]]};
  const prepared=prepareSimulationDocument(source).prepared,model=new OrigamiModel(prepared),solver=new ReferenceSolver(model,{foldPercent:100,timeStepScale:.35,damping:.5});
  for(const v of [0,1,4,5,6,7,8,9])solver.setVertexConstraint(v,[...model.positions.slice(v*3,v*3+3)] as [number,number,number]);
  const initial=solver.capturePose(),guard=new SimulationContactGuard(prepared,solver,{maxTimeMs:1000});assert.equal(guard.initialize().status,'clear');
  let contacts=0,firstContact=0;for(let steps=0;steps<300;steps++){const result=guard.step(1);assert.equal(result.status,'clear','a resolvable contact must constrain local normal motion without pausing all paper');if(result.constrainedSteps){contacts+=result.constrainedSteps;if(!firstContact)firstContact=steps;}}
  assert(contacts>0,'the real force-driven flap must reach contact');
  const protectedPose=solver.capturePose();assert.deepEqual(protectedPose.pins,initial.pins);assert.equal(inspectSimulationStepCollisions({indices:prepared.indices},protectedPose.positions).status,'clear');
  const ordinary=new ReferenceSolver(new OrigamiModel(prepared),{foldPercent:100,timeStepScale:.35,damping:.5});ordinary.restorePose(initial);ordinary.step(firstContact+3);
  assert.equal(inspectSimulationStepCollisions({indices:prepared.indices},ordinary.capturePose().positions).status,'collision','the switch must constrain actual motion rather than display an unchanged warning');
  solver.dispose();ordinary.dispose();
});

test('local contact removes only approaching normal movement and preserves tangent, fixed and unrelated material motion',()=>{
  const first=new Float32Array([-2,-2,0,2,-2,0,0,2,0,-.5,-.5,.001,.5,-.5,.001,0,.5,.001,4,0,0,5,0,0,4,1,0]),candidate=first.slice();
  for(let v=3;v<6;v++){candidate[v*3]+=.01;candidate[v*3+2]-=.002;}for(let v=6;v<9;v++)candidate[v*3+1]+=.03;
  const material={indices:[0,1,2,3,4,5,6,7,8],edgesVertices:[[0,1],[1,2],[2,0],[3,4],[4,5],[5,3],[6,7],[7,8],[8,6]],restPositions:first};
  const result=projectSimulationContactMotion(material,first,candidate,[{triangles:[0,1],faces:[0,1],sharedVertices:[],kind:'penetration'}],new Set([0,1,2]));assert(result);
  assert.deepEqual(result.slice(0,9),first.slice(0,9));assert.deepEqual(result.slice(18),candidate.slice(18));
  for(let v=3;v<6;v++){assert.equal(result[v*3],candidate[v*3]);assert.equal(result[v*3+1],candidate[v*3+1]);assert(result[v*3+2]>0);}
  const verified=evaluateSimulationContactStep(material,first,result);assert.equal(verified.status,'clear');
});
