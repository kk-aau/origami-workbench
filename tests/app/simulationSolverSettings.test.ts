import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SIMULATION_SOLVER_SETTINGS,mergeSimulationSolverSettings,normalizeSimulationSolverSettings,simulationSolverFrameStepCap,simulationFoldProgress} from '../../src/engine/simSettings';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import {SimulationClock} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/simulationClock';
import type {SolverBackend} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/solverBackend';

const crease={
  vertices_coords:[[0,0],[1,0],[2,0],[2,1],[1,1],[0,1]],
  edges_vertices:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,4]],
  edges_assignment:['B','B','B','B','B','B','M'],
  edges_foldAngle:[null,null,null,null,null,null,-180],
  faces_vertices:[[0,1,4,5],[1,2,3,4]],
};

test('solver settings merge atomically and reject non-finite, coerced and out-of-range values',()=>{
  const defaults={...DEFAULT_SIMULATION_SOLVER_SETTINGS};
  const changed=mergeSimulationSolverSettings(defaults,{axialStiffness:100,faceStiffness:0,panelStiffness:3,damping:1,integrationType:'verlet',maxStepsPerFrame:4000});
  assert.ok(changed);
  assert.equal(changed.creaseStiffness,.7);
  assert.deepEqual(defaults,DEFAULT_SIMULATION_SOLVER_SETTINGS,'validation must not mutate a live settings object');
  for(const patch of [null,[],{damping:NaN},{damping:Infinity},{damping:'0.5'},{damping:0},{faceStiffness:-1},{axialStiffness:9},{panelStiffness:3.01},{timeStepScale:.049},{integrationType:'rk4'},{maxStepsPerFrame:7},{maxStepsPerFrame:9},{maxStepsPerFrame:4008},{maxStepsPerFrame:8.5},{unexpected:1},{damping:undefined},{panelStiffness:2,damping:2}]){
    assert.equal(mergeSimulationSolverSettings(defaults,patch),null,JSON.stringify(patch));
  }
  assert.deepEqual(normalizeSimulationSolverSettings(defaults),defaults);
  assert.equal(normalizeSimulationSolverSettings({damping:.5}),null,'snapshots must include all fields');
});

test('automatic frame caps preserve existing backends and explicit caps bound clock work',()=>{
  const defaults={...DEFAULT_SIMULATION_SOLVER_SETTINGS};
  assert.equal(simulationSolverFrameStepCap(defaults,'webgl2'),96);
  assert.equal(simulationSolverFrameStepCap(defaults,'cpu'),240);
  const custom=mergeSimulationSolverSettings(defaults,{maxStepsPerFrame:24})!;
  let steps=0;
  const backend={step:(count:number)=>{steps+=count;},maxVelocity:()=>1,readDiagnostics:()=>({warnings:[],errors:[]})} as unknown as SolverBackend;
  for(const name of ['webgl2','cpu'] as const){
    steps=0;
    const clock=new SimulationClock({budgetMs:6,chunkSteps:name==='webgl2'?8:4,maxStepsPerFrame:simulationSolverFrameStepCap(custom,name),now:()=>0});
    assert.equal(clock.runFrame(backend).steps,24);
    assert.equal(steps,24,'an ample time budget must still obey the user cap');
  }
  assert.equal(simulationSolverFrameStepCap(mergeSimulationSolverSettings(custom,{maxStepsPerFrame:0})!,'webgl2'),96);
});

test('reverse folding keeps its sign while step-animation progress stays on its forward timeline',()=>{
  assert.equal(simulationFoldProgress(-.6),-.6);
  assert.equal(simulationFoldProgress(-2),-1);
  assert.equal(simulationFoldProgress(2),1);
  assert.equal(simulationFoldProgress(-.6,true),0);
  assert.equal(simulationFoldProgress(.6,true),.6);
  const {prepared}=prepareSimulationDocument(crease);
  const positiveModel=new OrigamiModel(prepared),negativeModel=new OrigamiModel(prepared);
  const positive=new ReferenceSolver(positiveModel,{foldPercent:35,timeStepScale:.35,damping:.5});
  const negative=new ReferenceSolver(negativeModel,{foldPercent:-35,timeStepScale:.35,damping:.5});
  try{
    positive.step(160);negative.step(160);
    assert.ok(positiveModel.positions.some((v,i)=>i%3===1&&Math.abs(v)>.01));
    for(let i=0;i<positiveModel.positions.length;i++){
      const expected=positiveModel.positions[i]!* (i%3===1?-1:1);
      assert.ok(Math.abs(negativeModel.positions[i]!-expected)<1e-6,'negative progress must mirror the actual solved fold');
    }
    negative.setFoldPercent(-150);assert.equal(negative.options.foldPercent,-100);
    negative.setMaterial({foldPercent:-50});assert.equal(negative.options.foldPercent,-50);
  }finally{positive.dispose();negative.dispose();}
});

test('Euler to Verlet starts from the current pose at rest without stale flat-history momentum',()=>{
  const {prepared}=prepareSimulationDocument(crease);
  const model=new OrigamiModel(prepared),solver=new ReferenceSolver(model,{foldPercent:40,timeStepScale:.35,damping:.5});
  const seededModel=new OrigamiModel(prepared),seeded=new ReferenceSolver(seededModel,{foldPercent:40,timeStepScale:.35,damping:.5,integrationType:'verlet'});
  try{
    solver.step(120);
    const pose=model.positions.slice();
    assert.ok(pose.some((v,i)=>i%3===1&&Math.abs(v)>.01));
    seeded.setInitialPositions(pose,prepared.creaseParams.map(()=>0));
    solver.setMaterial({integrationType:'verlet'});
    assert.deepEqual(model.positions,pose,'switching cannot reset a folded model');
    assert.equal(solver.maxVelocity(),0,'Euler velocity must not become unexplained Verlet momentum');
    solver.step(10);seeded.step(10);
    for(let i=0;i<pose.length;i++)assert.ok(Math.abs(model.positions[i]!-seededModel.positions[i]!)<2e-6,'switching matches an independent solver seeded at the same pose');
    solver.setMaterial({integrationType:'euler'});
    solver.setVertexConstraint(0,[pose[0]!,pose[1]!,pose[2]!]);
    assert.throws(()=>solver.setMaterial({integrationType:'verlet'}),/释放约束/);
    assert.equal(solver.options.integrationType,'euler');
    solver.setVertexConstraint(0,null);solver.setMaterial({integrationType:'verlet'});
  }finally{solver.dispose();seeded.dispose();}
});
