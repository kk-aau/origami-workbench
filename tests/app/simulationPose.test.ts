import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import {WebglSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/webglSolver';
import {packModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/packing';
import {solverPoseModelSignature,validateSolverPoseSnapshot,type SolverPoseSnapshot} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/solverBackend';

const source=(angle=-180)=>({
  vertices_coords:[[0,0],[1,0],[2,0],[2,1],[1,1],[0,1]],
  edges_vertices:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,4]],
  edges_assignment:['B','B','B','B','B','B','M'],
  edges_foldAngle:[null,null,null,null,null,null,angle],
  faces_vertices:[[0,1,4,5],[1,2,3,4]],
});
function fixture(integrationType:'euler'|'verlet'='euler',angle=-180){
  const {prepared}=prepareSimulationDocument(source(angle)),model=new OrigamiModel(prepared);
  return {model,solver:new ReferenceSolver(model,{foldPercent:85,timeStepScale:.35,damping:.5,integrationType})};
}
const jsonCopy=(snapshot:SolverPoseSnapshot)=>JSON.parse(JSON.stringify(snapshot)) as SolverPoseSnapshot;
const pin=(model:OrigamiModel,index:number)=>[...model.positions.subarray(index*3,index*3+3)] as [number,number,number];

test('pose JSON validation rejects malformed numeric arrays and inconsistent pins, and owns its copies',()=>{
  const {solver}=fixture(),pose=solver.capturePose();
  const invalid:unknown[]=[null,[],{}, {...pose,version:2},{...pose,modelSignature:''},
    {...pose,positions:[]},{...pose,positions:pose.positions.slice(1)},
    {...pose,displacements:pose.displacements.slice(1)},
    {...pose,positions:new Float32Array(pose.positions)},{...pose,positions:Array(pose.positions.length)},
    {...pose,positions:['0',...pose.positions.slice(1)]},{...pose,positions:[NaN,...pose.positions.slice(1)]},
    {...pose,positions:[Infinity,...pose.positions.slice(1)]},{...pose,displacements:[Number.MAX_VALUE,...pose.displacements.slice(1)]},
    {...pose,creaseAngles:[NaN]},{...pose,pins:[{index:-1,position:[0,0,0]}]},
    {...pose,pins:[{index:pose.positions.length/3,position:[0,0,0]}]},
    {...pose,pins:[{index:0,position:[0,0]}]},{...pose,pins:[{index:0,position:[999,0,0]}]},
    {...pose,pins:[{index:0,position:pose.positions.slice(0,3)},{index:0,position:pose.positions.slice(0,3)}]},
  ];
  for(const bad of invalid)assert.equal(validateSolverPoseSnapshot(bad),null);
  pose.pins=[{index:0,position:pose.positions.slice(0,3) as [number,number,number]}];
  const validated=validateSolverPoseSnapshot(pose)!;assert.deepEqual(validated,pose);
  validated.positions[0]+=1;validated.displacements[0]+=1;validated.creaseAngles[0]+=1;validated.pins[0]!.position[0]+=1;
  assert.notDeepEqual(validated,pose);
  assert.equal(pose.positions[0],pose.pins[0]!.position[0]);
  assert.equal(pose.displacements[0],0);
  assert.equal(pose.creaseAngles[0],0);
});

test('JSON pose restore preserves exact displacement, fold branches, strain and rest metric at zero velocity',()=>{
  const {model,solver}=fixture();solver.step(650);
  const rest=model.originalPositions.slice(),angles=model.prepared.creaseParams.map(c=>c.targetAngle),saved=jsonCopy(solver.capturePose()),strain=solver.readDiagnostics();
  assert.ok(saved.creaseAngles.some(value=>Math.abs(value)>.1));
  solver.setFoldPercent(25);solver.step(200);
  const steps=solver.stepCount,options=structuredClone(solver.options);
  solver.restorePose(saved);
  assert.deepEqual(solver.capturePose(),saved);
  assert.deepEqual(Array.from(model.positions),saved.positions);
  assert.equal(solver.maxVelocity(),0);
  assert.equal(solver.stepCount,steps);
  assert.deepEqual(solver.options,options,'restoring a pose must not silently replace the active fold target or material');
  assert.deepEqual(model.originalPositions,rest);
  assert.deepEqual(model.prepared.creaseParams.map(c=>c.targetAngle),angles);
  assert.deepEqual(solver.readDiagnostics(),strain);
  for(let i=0;i<30;i++)solver.restorePose(jsonCopy(solver.capturePose()));
  assert.deepEqual(solver.capturePose(),saved,'repeated JSON save/restore must not accumulate coordinate rounding');
});

for(const integrationType of ['euler','verlet']as const){
  test(`${integrationType} restored pose resumes exactly like an arrested original solver`,()=>{
    const original=fixture(integrationType),restored=fixture(integrationType);
    original.solver.step(500);
    const saved=jsonCopy(original.solver.capturePose());
    restored.solver.step(100);restored.solver.restorePose(saved);
    original.solver.arrestDynamics();
    assert.equal(restored.solver.maxVelocity(),0);
    original.solver.step(350);restored.solver.step(350);
    assert.deepEqual(restored.model.positions,original.model.positions,'no old flat-history recoil or lost theta branch');
    assert.deepEqual(restored.solver.capturePose(),original.solver.capturePose());
  });
  test(`${integrationType} restored pose remains completely still without applied forces`,()=>{
    const {model,solver}=fixture(integrationType);solver.step(180);
    const saved=solver.capturePose();solver.step(30);
    solver.setMaterial({axialStiffness:0,creaseStiffness:0,panelStiffness:0,faceStiffness:0,damping:0});
    solver.restorePose(saved);solver.step(100);
    assert.deepEqual(Array.from(model.positions),saved.positions);
    assert.equal(solver.maxVelocity(),0);
  });
}

test('pose restoration atomically replaces persistent pins and keeps them fixed through solving',()=>{
  const {model,solver}=fixture();solver.step(250);
  const first=pin(model,0);solver.setVertexConstraint(0,first);
  const saved=solver.capturePose();
  solver.setVertexConstraint(0,null);solver.setVertexConstraint(1,pin(model,1));solver.step(20);
  solver.restorePose(jsonCopy(saved));
  assert.deepEqual(solver.capturePose().pins,[{index:0,position:first}]);
  assert.throws(()=>solver.recenter([0,0,0]),/释放顶点约束/);
  solver.step(400);
  assert.deepEqual(Array.from(model.positions.subarray(0,3)),first);
  solver.setVertexConstraint(0,null);
  assert.doesNotThrow(()=>solver.recenter([0,0,0]),'the replaced old pin must not remain as a hidden constraint');
  solver.reset();assert.deepEqual(model.positions,model.originalPositions);
  assert.deepEqual(solver.capturePose().pins,[]);
});

test('same-sized different models, inconsistent coordinates and invalid snapshots reject without altering live state',()=>{
  const {model,solver}=fixture();solver.step(200);solver.setVertexConstraint(0,pin(model,0));
  const before=solver.capturePose(),velocities=model.velocities.slice(),steps=solver.stepCount;
  const other=fixture('euler',-90).solver.capturePose();
  assert.equal(other.positions.length,before.positions.length);
  assert.notEqual(other.modelSignature,before.modelSignature);
  const inconsistent=jsonCopy(before);inconsistent.displacements[3]!+=.1;
  const invalid:unknown[]=[other,inconsistent,{...before,positions:before.positions.slice(0,3),displacements:before.displacements.slice(0,3)},
    {...before,creaseAngles:[...before.creaseAngles,0]},{...before,creaseAngles:[NaN]}];
  for(const value of invalid){
    assert.throws(()=>solver.restorePose(value),/姿态/);
    assert.deepEqual(solver.capturePose(),before);
    assert.deepEqual(model.velocities,velocities);
    assert.equal(solver.stepCount,steps);
  }
});

test('pin-bearing poses reject under Verlet and step animation drivers cannot be overwritten',()=>{
  const fixed=fixture(),free=fixture('verlet');fixed.solver.setVertexConstraint(0,pin(fixed.model,0));
  free.solver.step(100);const before=free.solver.capturePose(),velocity=free.model.velocities.slice();
  assert.throws(()=>free.solver.restorePose(fixed.solver.capturePose()),/Euler/);
  assert.deepEqual(free.solver.capturePose(),before);assert.deepEqual(free.model.velocities,velocity);
  const driven=fixture();driven.solver.setRigidPoseDriver(()=>driven.model.originalPositions.slice());
  assert.throws(()=>driven.solver.restorePose(before),/步骤动画/);
});

/** Exercise actual WebglSolver serialisation/upload code with deterministic
 * texture storage. Shader/integration parity is covered in the browser run. */
function gpuTextureFixture(model:OrigamiModel,integrationType:'euler'|'verlet'='euler'){
  const packed=packModel(model,{axialStiffness:20,creaseStiffness:.7,panelStiffness:.7,faceStiffness:.2,damping:.5,timeStepScale:.35});
  const textures=new Map<string,Float32Array>(),writes:string[]=[];
  const gpu=Object.assign(Object.create(WebglSolver.prototype),{
    packed,nodeCount:model.prepared.vertexCount,originalPositions:model.originalPositions,
    poseModelSignature:solverPoseModelSignature(model),vertexConstraintData:packed.externalForces.slice(),vertexConstraintCount:0,
    positionScratch:new Float32Array(packed.dims.textureDim**2*4),currentStep:77,integrationType,
    diagnostics:{warnings:[],errors:[]},maxStrain:0,meanStrain:0,
    gl:{updateTexture:(name:string,data:Float32Array)=>{writes.push(name);textures.set(name,data.slice());},
      readTexture:(name:string)=>{assert.ok(textures.has(name),name);return textures.get(name)!.slice();}},
  }) as WebglSolver;
  return {gpu,textures,writes,packed};
}

test('GPU pose uploads preserve exact state, crease topology and true paused strain while clearing every velocity',()=>{
  const {model,solver}=fixture();solver.step(260);solver.setVertexConstraint(0,pin(model,0));
  const snapshot=jsonCopy(solver.capturePose()),rest=model.originalPositions.slice(),{gpu,textures,packed}=gpuTextureFixture(model);
  gpu.restorePose(snapshot);
  assert.deepEqual(gpu.capturePose(),snapshot);
  assert.equal(gpu.stepCount,77);assert.equal(gpu.maxVelocity(),0);
  assert.deepEqual(model.originalPositions,rest);
  assert.deepEqual(textures.get('u_position'),textures.get('u_lastPosition'));
  assert.deepEqual(textures.get('u_lastPosition'),textures.get('u_lastLastPosition'));
  assert.deepEqual(textures.get('u_theta'),textures.get('u_lastTheta'));
  assert.deepEqual(textures.get('u_velocity'),textures.get('u_lastVelocity'));
  const expectedStrain=new Float32Array(model.prepared.vertexCount),actualStrain=new Float32Array(expectedStrain.length);
  solver.readStrain(expectedStrain);gpu.readStrain(actualStrain);
  for(let i=0;i<actualStrain.length;i++)assert.ok(Math.abs(actualStrain[i]!-expectedStrain[i]!)<1e-6);
  assert.ok(gpu.readDiagnostics().maxNodalStrain!>0,'restoring a strained pose must not paint it as zero strain');
  const theta=textures.get('u_lastTheta')!;
  for(let i=0;i<packed.dims.creases;i++){
    assert.equal(theta[i*4+1],0);assert.equal(theta[i*4+2],packed.thetaInit[i*4+2]);assert.equal(theta[i*4+3],packed.thetaInit[i*4+3]);
  }
  assert.throws(()=>gpu.recenter([0,0,0]),/释放顶点约束/);
  const returned=gpu.capturePose();returned.positions[0]+=1;returned.displacements[0]+=1;returned.pins[0]!.position[0]+=1;
  assert.deepEqual(gpu.capturePose(),snapshot,'returned arrays cannot mutate GPU state');
});

test('GPU pose validation finishes before any upload or constraint replacement',()=>{
  const {model,solver}=fixture();solver.step(100);
  const snapshot=solver.capturePose(),{gpu,writes}=gpuTextureFixture(model);gpu.restorePose(snapshot);writes.length=0;
  const inconsistent=jsonCopy(snapshot);inconsistent.positions[0]+=1;
  for(const bad of [inconsistent,{...snapshot,modelSignature:'same-size-other-model'},{...snapshot,creaseAngles:[]},{...snapshot,positions:[NaN]}]){
    assert.throws(()=>gpu.restorePose(bad),/姿态/);assert.deepEqual(writes,[]);assert.deepEqual(gpu.capturePose(),snapshot);
  }
  solver.setVertexConstraint(0,pin(model,0));
  const verlet=gpuTextureFixture(model,'verlet');
  assert.throws(()=>verlet.gpu.restorePose(solver.capturePose()),/Euler/);assert.deepEqual(verlet.writes,[]);
});
