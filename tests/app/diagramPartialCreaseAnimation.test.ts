import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../fixtures/diagramPartialCrease';
import {partialCreaseDiagramProjectFixture} from '../fixtures/partialCreaseDiagramProject';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {planVerifiedSimulationStepAnimation} from '../../src/engine/simStepPlanning';
import {validateSimulationStepAnimation,seedSimulationStepAnimation,simulationStepFoldProfile} from '../../src/engine/simStepAnimation';
import {simulationStepDisplayAssignments} from '../../src/engine/simStepEdges';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';

test('finite precrease uses the real verified curve through the production planner and simulator driver',()=>{
  const {project,stepId}=fixture('single'),saved=structuredClone(project),clip=buildDiagramStepAnimation(project,stepId),prepared=prepareSimulationDocument(clip.fold).prepared;
  const result=planVerifiedSimulationStepAnimation(clip.fold,clip.animation,undefined,{initialGeometry:clip.initialGeometry});
  assert.equal(result.method,'local-flex');assert.ok(result.checkedIntervals>0);
  const animation=validateSimulationStepAnimation(result.animation,prepared,clip.animation.sourceSignature),model=new OrigamiModel(prepared),solver=new ReferenceSolver(model);
  seedSimulationStepAnimation(solver,animation);
  const seed=model.positions.slice(),rest=prepared.edgesVertices.map(([a,b])=>Math.hypot(...[0,1,2].map(k=>seed[a*3+k]-seed[b*3+k])));
  for(const progress of [.013,.17,.3,.5,.63,.83,1]){
    solver.setFoldProfile(simulationStepFoldProfile(animation,progress));solver.setFoldPercent(progress*100);solver.step(1);
    const p=model.positions;
    for(const v of animation.fixedVertices)for(let k=0;k<3;k++)assert.ok(p[v*3+k]===seed[v*3+k]);
    prepared.edgesVertices.forEach(([a,b],e)=>assert.ok(Math.abs(Math.hypot(...[0,1,2].map(k=>p[a*3+k]-p[b*3+k]))/rest[e]-1)<=2.01e-4));
    if(progress===.5){
      assert.ok(p.some((v,i)=>i%3===1&&Math.abs(v)>.02),'the temporary mesh really bends out of plane');
      const heights=Array.from(p).filter((_,i)=>i%3===1);assert.ok(Math.max(...heights)-Math.min(...heights)>.04);
    }
  }
  assert.ok(model.positions.every((v,i)=>v===seed[i]),'the full action ends at the exact saved endpoint');
  assert.deepEqual(project,saved,'temporary topology and solved coordinates never enter CP or saved illustrations');
  assert.equal(prepared.sourceFaceCount,1);
  assert.ok(animation.flex!.maxEdgeStrain<2e-4);assert.ok(animation.flex!.maxAreaStrain<8e-4);solver.dispose();
});

test('four local precreases share one material mesh and play certified out-and-return batches',()=>{
  const {project,stepId}=fixture('network'),saved=structuredClone(project),clip=buildDiagramStepAnimation(project,stepId),prepared=prepareSimulationDocument(clip.fold).prepared;
  const result=planVerifiedSimulationStepAnimation(clip.fold,clip.animation,undefined,{initialGeometry:clip.initialGeometry});
  const animation=validateSimulationStepAnimation(result.animation,prepared,clip.animation.sourceSignature),model=new OrigamiModel(prepared),solver=new ReferenceSolver(model);
  seedSimulationStepAnimation(solver,animation);
  const seed=model.positions.slice(),batches=animation.flex!.batches!;
  assert.equal(batches.length,4);assert.equal(prepared.sourceFaceCount,1);assert.equal(animation.flex!.foldLimit,.5);
  assert.ok(result.checkedIntervals>=animation.flex!.keyframes.length-1);
  for(const batch of batches){
    for(const progress of [(batch.start+batch.end)/2,batch.end]){
      solver.setFoldProfile(simulationStepFoldProfile(animation,progress));solver.setFoldPercent(progress*100);solver.step(1);
      for(const v of animation.fixedVertices)for(let k=0;k<3;k++)assert.equal(model.positions[v*3+k],seed[v*3+k]);
      if(progress===batch.end)assert.ok(model.positions.every((v,i)=>v===seed[i]));
      else assert.ok(model.positions.some((v,i)=>i%3===1&&Math.abs(v-seed[i])>.02));
    }
  }
  assert.deepEqual(project,saved);solver.dispose();
});

test('an existing CP network remains visible while helper seams and future finite marks stay hidden',()=>{
  const {project,stepId}=fixture('network'),clip=buildDiagramStepAnimation(project,stepId),prepared=prepareSimulationDocument(clip.fold).prepared;
  const camera={center:[0,0,0],rotation:[1,0,0,0,1,0,0,0,1],camDist:5};
  const assignments=simulationStepDisplayAssignments(prepared,clip.animation,clip.animation.initialPositions,camera,0),pending=new Set(clip.animation.ranges.filter(r=>r.viaAngle!==undefined).map(r=>r.edge)),retained=new Set(clip.animation.retainedCreases);
  const old=assignments.flatMap((_,e)=>retained.has(e)&&!pending.has(e)?[e]:[]);
  assert.ok(old.length>16,'actual retained network segments survive material subdivision');
  assert.ok(old.every(e=>assignments[e]==='M'||assignments[e]==='V'));
  assert.ok([...pending].every(e=>retained.has(e)?assignments[e]==='M'||assignments[e]==='V':assignments[e]==='F'));
  assert.ok(assignments.every((a,e)=>prepared.edgesAssignment[e]==='B'||retained.has(e)||a==='F'),'generated support lines never become visible CP marks');
});

test('fixed points on expanded old F marks still pin a triangle containing the actual material point',()=>{
  const {project,stepId}=partialCreaseDiagramProjectFixture({activeRoutes:[0],fixed:[88,88]}),clip=buildDiagramStepAnimation(project,stepId),prepared=prepareSimulationDocument(clip.fold).prepared;
  assert.ok(clip.animation.flexRequest);assert.equal(clip.animation.fixedVertices.length,3);
  const vertices=clip.animation.fixedVertices.map(v=>[prepared.fold.vertices_coords[v][0],-prepared.fold.vertices_coords[v][2]]),signs=vertices.map((a,i)=>{const b=vertices[(i+1)%3];return (b[0]-a[0])*(88-a[1])-(b[1]-a[1])*(88-a[0]);});
  assert.ok(signs.every(v=>v>=-1e-6)||signs.every(v=>v<=1e-6));
  const fixed=project.steps[0].foldLink!.fixed!;fixed.matrix=[-1,0,0,-1,176,176];
  assert.throws(()=>buildDiagramStepAnimation(project,stepId),/参考方向|参考姿态/,'matching a single point cannot conceal a stale fixed-face orientation');
});
