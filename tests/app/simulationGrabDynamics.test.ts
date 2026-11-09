import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';

const source={
  vertices_coords:[[0,0],[1,0],[2,0],[2,1],[1,1],[0,1]],
  edges_vertices:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,4]],
  edges_assignment:['B','B','B','B','B','B','M'],
  edges_foldAngle:[null,null,null,null,null,null,-180],
  faces_vertices:[[0,1,4,5],[1,2,3,4]],
};
type Point=readonly [number,number,number];
function fixture(integrationType:'euler'|'verlet'='euler',foldPercent=35){
  const {prepared}=prepareSimulationDocument(source),model=new OrigamiModel(prepared);
  return {model,solver:new ReferenceSolver(model,{foldPercent,timeStepScale:.35,damping:.5,integrationType})};
}
function centroid(positions:Float32Array):[number,number,number]{
  const center:[number,number,number]=[0,0,0],count=positions.length/3;
  for(let i=0;i<positions.length;i++)center[i%3]+=positions[i]!/count;
  return center;
}
function near(actual:ArrayLike<number>,expected:ArrayLike<number>,epsilon=2e-6){
  assert.equal(actual.length,expected.length);
  for(let i=0;i<actual.length;i++)assert.ok(Math.abs(actual[i]!-expected[i]!)<=epsilon,`${i}: ${actual[i]} != ${expected[i]}`);
}
const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

test('recentering a folded sheet changes only its translation and clears all kinetic energy',()=>{
  const {model,solver}=fixture();
  solver.step(160);
  const before=model.positions.slice(),center=centroid(before),rest=model.originalPositions.slice(),steps=solver.stepCount;
  const targets=model.prepared.creaseParams.map(c=>c.targetAngle),options=structuredClone(solver.options),target:Point=[.3,-.2,.1];
  assert.ok(solver.maxVelocity()>1e-4,'fixture must have kinetic energy before release');
  solver.recenter(target);
  near(centroid(model.positions),target);
  near(model.positions,Float32Array.from(before,(value,i)=>value+target[i%3]!-center[i%3]!));
  assert.equal(solver.maxVelocity(),0);
  assert.equal(solver.stepCount,steps);
  assert.deepEqual(solver.options,options);
  assert.deepEqual(model.prepared.creaseParams.map(c=>c.targetAngle),targets);
  assert.deepEqual(model.originalPositions,rest);
  assert.ok(model.positions.some((value,i)=>i%3===1&&Math.abs(value-target[1])>.01),'folded shape survives');
});

test('released grab no longer carries the whole sheet away over subsequent solver steps',()=>{
  const corrected=fixture('euler',0),legacy=fixture('euler',0),origin=centroid(corrected.model.positions);
  for(const {model,solver}of [corrected,legacy]){
    const target:Point=[model.positions[0]!+.25,model.positions[1]!,model.positions[2]!+.1];
    solver.setVertexConstraint(0,target);
    solver.step(500);
    solver.setVertexConstraint(0,null);
  }
  const oldCenter=centroid(legacy.model.positions);
  corrected.solver.recenter(origin);
  assert.equal(corrected.solver.maxVelocity(),0);
  corrected.solver.step(4000);legacy.solver.step(4000);
  assert.ok(distance(centroid(legacy.model.positions),oldCenter)>.02,'fixture reproduces the prior free-translation drift');
  assert.ok(distance(centroid(corrected.model.positions),origin)<2e-5,'internal relaxation must not recreate whole-sheet momentum');
  assert.ok(corrected.model.positions.every(Number.isFinite));
});

test('recentering retains the accumulated fold branch when simulation continues',()=>{
  const baseline=fixture('euler',95),translated=fixture('euler',95),target:Point=[.4,-.3,.2];
  baseline.solver.step(2500);translated.solver.step(2500);
  baseline.solver.recenter([0,0,0]);translated.solver.recenter(target);
  baseline.solver.setFoldPercent(65);translated.solver.setFoldPercent(65);
  baseline.solver.step(800);translated.solver.step(800);
  near(translated.model.positions,Float32Array.from(baseline.model.positions,(value,i)=>value+target[i%3]!),3e-5);
  assert.equal(translated.solver.stepCount,3300);
});

for(const integrationType of ['euler','verlet']as const){
  test(`${integrationType} recenter seeds positional history and reset still restores the flat rest pose`,()=>{
    const {model,solver}=fixture(integrationType);
    solver.step(100);
    const rest=model.originalPositions.slice();
    assert.ok(solver.maxVelocity()>1e-4);
    solver.setMaterial({axialStiffness:0,creaseStiffness:0,panelStiffness:0,faceStiffness:0,damping:0});
    solver.recenter([.2,.1,-.1]);
    const released=model.positions.slice();
    solver.step(25);
    near(model.positions,released,2e-6);
    assert.equal(solver.maxVelocity(),0,'without forces no hidden history can restart motion');
    solver.reset();
    assert.deepEqual(model.positions,rest);
    assert.deepEqual(model.originalPositions,rest);
    assert.equal(solver.stepCount,0);
  });
}

test('arrestDynamics clears Verlet positional momentum as well as its reported velocity',()=>{
  const {model,solver}=fixture('verlet');
  solver.step(100);
  assert.ok(solver.maxVelocity()>1e-4);
  solver.setMaterial({axialStiffness:0,creaseStiffness:0,panelStiffness:0,faceStiffness:0,damping:0});
  const before=model.positions.slice(),steps=solver.stepCount;
  solver.arrestDynamics();
  assert.equal(solver.maxVelocity(),0);
  assert.deepEqual(model.positions,before);
  assert.equal(solver.stepCount,steps);
  solver.step(25);
  near(model.positions,before,2e-6);
  assert.equal(solver.maxVelocity(),0);
});

test('invalid or still-constrained recenter requests reject atomically',()=>{
  const {model,solver}=fixture();
  solver.step(100);
  const before=model.positions.slice(),velocity=model.velocities.slice(),steps=solver.stepCount;
  for(const target of [[NaN,0,0],[0,Infinity,0],[0,0,-Infinity],[Number.MAX_VALUE,0,0],[0,0]]as Point[]){
    assert.throws(()=>solver.recenter(target),/坐标|范围/);
    assert.deepEqual(model.positions,before);
    assert.deepEqual(model.velocities,velocity);
    assert.equal(solver.stepCount,steps);
  }
  const pin:Point=[before[0]!+.1,before[1]!,before[2]!];
  solver.setVertexConstraint(0,pin);
  const pinned=model.positions.slice(),pinnedVelocity=model.velocities.slice();
  assert.throws(()=>solver.recenter([0,0,0]),/释放顶点约束/);
  assert.deepEqual(model.positions,pinned);
  assert.deepEqual(model.velocities,pinnedVelocity);
  solver.step(10);near(model.positions.subarray(0,3),pin);
  solver.setVertexConstraint(0,null);solver.recenter([0,0,0]);
  near(centroid(model.positions),[0,0,0]);
});
