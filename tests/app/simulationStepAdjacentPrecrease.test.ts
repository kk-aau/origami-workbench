import test from 'node:test';
import assert from 'node:assert/strict';
import {diagramAdjacentPrecreaseFixture} from '../fixtures/simulationStepAdjacentPrecrease';
import {diagramSingleLayerCornerFixture} from '../fixtures/diagramStepAnimationScope';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {simulationSourceSignature} from '../../src/engine/simLayerOrder';
import {validateSimulationStepAnimation,seedSimulationStepAnimation,simulationStepFoldProfile} from '../../src/engine/simStepAnimation';
import {createSimulationStepPathEvaluator,planSimulationStepPath} from '../../src/engine/simStepPath';
import {planVerifiedSimulationStepAnimation} from '../../src/engine/simStepPlanning';
import {inspectSimulationStepCollisions} from '../../src/engine/simStepCollision';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';

for(const oldAssignment of ['V','M'] as const)test(`a real two-layer precrease opens adjacent ${oldAssignment} hinges only within their original half-turn and restores them`,()=>{
  const fixture=diagramAdjacentPrecreaseFixture(oldAssignment),saved=exportDiagramProject(fixture.project),project=importDiagramProject(saved);
  const clip=buildDiagramStepAnimation(project,fixture.stepId),savedClip=structuredClone(clip),{prepared}=prepareSimulationDocument(clip.fold);
  assert.throws(()=>planSimulationStepPath(prepared,clip.animation),/连续刚性路径|折角|铰链|连接/,'the original locked old fold really prevents direct playback');
  const result=planVerifiedSimulationStepAnimation(clip.fold,clip.animation,undefined,{initialGeometry:clip.initialGeometry});
  assert.ok(result.checkedIntervals>0,'the production checker certifies the complete continuous path');
  const validated=validateSimulationStepAnimation(result.animation,prepared,clip.animation.sourceSignature),motion=validated.motion!;
  assert.equal(result.method,'sequential');assert.ok(motion.phases.length>=4);
  const path=createSimulationStepPathEvaluator(prepared,validated,motion),oldByEdge=new Map(clip.animation.ranges.map(r=>[r.edge,r]));
  const released=validated.ranges.flatMap((range,i)=>range.fromAngle!==0&&range.fromAngle===range.toAngle&&range.viaAngle===0?[i]:[]);
  const requested=validated.ranges.flatMap((range,i)=>oldByEdge.get(range.edge)!.viaAngle===180?[i]:[]);
  assert.equal(released.length,2,'both actual material subsegments of the old full crease reopen together');
  assert.equal(requested.length,2,'the entire new material stroke survives triangulation');
  for(const range of validated.ranges){
    const original=oldByEdge.get(range.edge)!;
    assert.equal(range.fromAngle,original.fromAngle);assert.equal(range.toAngle,original.toAngle);
    if(original.viaAngle!==undefined)assert.equal(range.viaAngle,original.viaAngle,'the requested precrease peak is never weakened');
  }
  const peak=motion.phases.find(p=>requested.every(i=>p.toAngles[i]===180));assert.ok(peak,'new precrease reaches its genuine full 180-degree peak');
  assert.ok(released.every(i=>path.angles(peak.end)[i]===0),'the old crease remains open while the new crease is pressed');
  const initial=path.evaluate(0),distance=(positions:ArrayLike<number>,a:number,b:number)=>Math.hypot(...[0,1,2].map(k=>positions[a*3+k]-positions[b*3+k]));
  assert.ok(initial.every((v,i)=>v===Math.fround(clip.animation.initialPositions[i])),'initial material coordinates are exact; signed zero denotes the same position');assert.deepEqual(path.evaluate(1),initial,'the exact original folded pose returns after the press');
  const samples=new Set([0,1,...motion.phases.flatMap(p=>[0,.125,.25,.5,.75,.875,1].map(t=>p.start+(p.end-p.start)*t))]);
  const expected=new Map<number,Float32Array>();
  for(const progress of samples){
    const angles=path.angles(progress),positions=path.evaluate(progress);expected.set(progress,positions.slice());
    for(const i of released){assert.ok(angles[i]*Math.sign(clip.animation.ranges[i].fromAngle)>=0,'temporary opening never reverses the existing mountain/valley direction');assert.ok(Math.abs(angles[i])<=180,'an already fully folded hinge never overfolds beyond 180 degrees');}
    for(const v of clip.animation.fixedVertices)for(let k=0;k<3;k++)assert.equal(positions[v*3+k],initial[v*3+k],'every chosen material pin stays fixed');
    for(const [a,b] of prepared.edgesVertices)assert.ok(Math.abs(distance(positions,a,b)-distance(initial,a,b))<2e-6,'all real material edges retain their lengths');
    assert.equal(inspectSimulationStepCollisions({indices:prepared.indices,triangleBodies:path.mechanism.triangleBodies,triangleSourceFaces:prepared.triangleSourceFaces},positions).status,'clear','sampled geometry agrees with the complete collision certificate');
  }
  const model=new OrigamiModel(prepared),solver=new ReferenceSolver(model);seedSimulationStepAnimation(solver,validated);
  for(const progress of [.87,.25,.5,1,.13,0]){
    const positions=path.evaluate(progress);solver.setFoldProfile(simulationStepFoldProfile(validated,progress));solver.setFoldPercent(progress*100);solver.step(2);
    assert.deepEqual(model.positions,positions,'the real runtime seeks the reopened certified path in either direction');
  }
  solver.dispose();
  for(const [progress,positions] of [...expected].reverse())assert.deepEqual(path.evaluate(progress),positions,'seeking does not change any later evaluation');
  assert.deepEqual(clip,savedClip,'neither endpoints, colours nor initial/final layer geometry are rewritten');
  assert.equal(exportDiagramProject(project),saved,'temporary animation motion never changes a saved before/after CP');
  assert.equal(simulationSourceSignature(clip.fold),clip.animation.sourceSignature,'the private animation source retains its original material identity');
});

test('opening adjacent old hinges cannot falsely animate a genuinely locked three-ray single-layer press',()=>{
  const fixture=diagramSingleLayerCornerFixture({a:[0,40],b:[50,40]},'precrease'),saved=exportDiagramProject(fixture.project);
  const clip=buildDiagramStepAnimation(fixture.project,fixture.stepId),original=structuredClone(clip);
  assert.throws(()=>planVerifiedSimulationStepAnimation(clip.fold,clip.animation,undefined,{initialGeometry:clip.initialGeometry}),/连续刚性路径|折角|铰链|连接/,'a complete uncut lower sheet leaves no rigid degree of freedom at the three-ray vertex');
  assert.deepEqual(clip,original);assert.equal(exportDiagramProject(fixture.project),saved);
});
