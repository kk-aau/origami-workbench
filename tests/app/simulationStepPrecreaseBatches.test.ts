import test from 'node:test';
import assert from 'node:assert/strict';
import {diagramPrecreaseBatchesFixture,diagramTwoStepPrecreaseBatchesFixture} from '../fixtures/simulationStepPrecreaseBatches';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {compileSimulationStepRigidMechanism} from '../../src/engine/simStepRigid';
import {createSimulationStepPathEvaluator,validateSimulationStepMotion,type SimulationStepMotion} from '../../src/engine/simStepPath';
import {planVerifiedSimulationStepAnimation} from '../../src/engine/simStepPlanning';
import {seedSimulationStepAnimation,simulationStepFoldProfile,validateSimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {inspectSimulationStepCollisions} from '../../src/engine/simStepCollision';
import {pointOnSegment} from '../../src/core/geometry';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import type {Point} from '../../src/core/types';
import {simulationStepDisplayAssignments} from '../../src/engine/simStepEdges';
import {cameraUniforms,centroid,boundingRadius} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';

function preparedFixture(kind:'diagonals'|'corner-bisectors'|'corner-after-diagonals',fixedPoint?:Point|null){
  const fixture=kind==='corner-after-diagonals'?diagramTwoStepPrecreaseBatchesFixture():diagramPrecreaseBatchesFixture(kind,fixedPoint),saved=exportDiagramProject(fixture.project),project=importDiagramProject(saved),clip=buildDiagramStepAnimation(project,fixture.stepId),{prepared}=prepareSimulationDocument(clip.fold);
  const groups=fixture.strokes.map(([a,b])=>prepared.creaseParams.flatMap((crease,index)=>{
    const line={id:'source-stroke',a,b,assignment:'F' as const,angle:0};
    return prepared.edgesVertices[crease.edge].every(v=>pointOnSegment([prepared.fold.vertices_coords[v][0],-prepared.fold.vertices_coords[v][2]],line,1e-5))?[index]:[];
  }));
  assert.ok(groups.every(group=>group.length>=2),'a complete drawn crease is split into several actual material hinges');
  assert.equal(new Set(groups.flat()).size,groups.flat().length,'one source stroke owns each driven material hinge');
  assert.equal(groups.flat().length,clip.animation.ranges.filter(r=>r.viaAngle!==undefined).length);
  return {fixture,saved,project,clip,prepared,groups};
}

function verifiedPlayback(data:ReturnType<typeof preparedFixture>,selected?:number[]){
  const selectedHinges=selected?new Set(selected.flatMap(i=>data.groups[i])):undefined;
  const input={...data.clip.animation,ranges:data.clip.animation.ranges.map((range,i)=>{const copy={...range};if(selectedHinges&&!selectedHinges.has(i))delete copy.viaAngle;return copy;})};
  const inputCopy=structuredClone(input),foldCopy=structuredClone(data.clip.fold),preparedCopy=structuredClone(data.prepared);
  const result=planVerifiedSimulationStepAnimation(data.clip.fold,input,undefined,{initialGeometry:data.clip.initialGeometry});
  assert.ok(result.checkedIntervals>0,'the production continuous collision checker must certify the complete candidate');
  const validated=validateSimulationStepAnimation(result.animation,data.prepared,input.sourceSignature),motion=validated.motion!,path=createSimulationStepPathEvaluator(data.prepared,validated,motion);
  const selectedGroups=selected??data.groups.map((_,i)=>i),peaks=new Map(selectedGroups.map(i=>[i,0]));let mostParallel=0;
  const distance=(pose:ArrayLike<number>,a:number,b:number)=>Math.hypot(...[0,1,2].map(k=>pose[a*3+k]-pose[b*3+k]));
  const seed=path.evaluate(0),seen=new Map<number,Float32Array>(),model=new OrigamiModel(data.prepared),solver=new ReferenceSolver(model);seedSimulationStepAnimation(solver,validated);
  for(const phase of motion.phases){
    const live=data.groups.flatMap((group,i)=>group.some(c=>Math.abs(phase.toAngles[c]-phase.fromAngles[c])>1e-7)?[i]:[]);mostParallel=Math.max(mostParallel,live.length);
    for(const group of data.groups)for(const c of group){
      assert.equal(phase.fromAngles[c],phase.fromAngles[group[0]],'subsegments on a single straight material crease move together');
      assert.equal(phase.toAngles[c],phase.toAngles[group[0]]);
    }
    for(const group of selectedGroups){
      if(Math.abs(phase.toAngles[data.groups[group][0]])===180&&Math.abs(phase.fromAngles[data.groups[group][0]])<180)peaks.set(group,peaks.get(group)!+1);
    }
    for(const t of [0,.03125,.25,.5,.75,.96875,1]){
      const progress=phase.start+(phase.end-phase.start)*t,pose=path.evaluate(progress);
      solver.setFoldProfile(simulationStepFoldProfile(validated,progress));solver.setFoldPercent(progress*100);solver.step(2);assert.deepEqual(model.positions,pose,'runtime uses this batch angle schedule instead of the old global precrease midpoint');
      for(const [a,b] of data.prepared.edgesVertices)assert.ok(Math.abs(distance(pose,a,b)-distance(seed,a,b))<2e-6,'batching retains every original material edge');
      for(const v of input.fixedVertices)for(let k=0;k<3;k++)assert.ok(Math.abs(pose[v*3+k]-seed[v*3+k])<2e-7,'the same fixed paper region stays still throughout all batches');
      assert.equal(inspectSimulationStepCollisions({indices:data.prepared.indices,triangleBodies:path.mechanism.triangleBodies,triangleSourceFaces:data.prepared.triangleSourceFaces},pose).status,'clear','no sampled interior may contradict the continuous certificate');
      seen.set(progress,pose.slice());
    }
  }
  for(const [group,count] of peaks)assert.equal(count,1,`source stroke ${group} reaches its real 180 degree precrease exactly once`);
  assert.deepEqual(path.angles(0),input.ranges.map(r=>r.fromAngle));assert.deepEqual(path.angles(1),input.ranges.map(r=>r.toAngle));
  assert.deepEqual(path.evaluate(1),seed,'each batch returns the paper to the original flat state before the step ends');
  for(const [progress,pose] of [...seen].reverse()){
    assert.deepEqual(path.evaluate(progress),pose,'backward and repeated seeks retain the same material pose');
    solver.setFoldProfile(simulationStepFoldProfile(validated,progress));solver.setFoldPercent(progress*100);solver.step(2);assert.deepEqual(model.positions,pose);
  }
  seedSimulationStepAnimation(solver,validated);solver.setFoldProfile(simulationStepFoldProfile(validated,1));solver.setFoldPercent(100);solver.step(2);assert.deepEqual(model.positions,seed);solver.dispose();
  assert.deepEqual(input,inputCopy);assert.deepEqual(data.clip.fold,foldCopy);assert.deepEqual(data.prepared,preparedCopy);
  assert.equal(exportDiagramProject(data.project),data.saved,'animation substeps must not split or mutate the saved drawing step');
  assert.equal(data.project.steps.length,data.fixture.project.steps.length);assert.ok(data.project.states.at(-1)!.doc.segments.every(s=>s.assignment==='B'||s.assignment==='F'),'precreases remain existing flat CP lines after playback');
  return {result,motion,path,mostParallel};
}

const side=(a:Point,b:Point,p:Point)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
function centralSideVertices(data:ReturnType<typeof preparedFixture>,strokes:number[]){
  return data.prepared.fold.vertices_coords.flatMap((p,v)=>strokes.every(i=>{
    const [a,b]=data.fixture.strokes[i];return side(a,b,[p[0],-p[2]])*side(a,b,[50,50])>=-1e-5;
  })?[v]:[]);
}
function assertCentralSideStationary(data:ReturnType<typeof preparedFixture>,playback:ReturnType<typeof verifiedPlayback>){
  const seed=playback.path.evaluate(0);
  for(const phase of playback.motion.phases){
    const live=data.groups.flatMap((group,i)=>group.some(c=>Math.abs(phase.toAngles[c]-phase.fromAngles[c])>1e-7)?[i]:[]),stationary=centralSideVertices(data,live);
    assert.ok(stationary.length>=4,'the physical central-side region contains real material vertices');
    for(const fraction of [.25,.5,.75]){
      const pose=playback.path.evaluate(phase.start+(phase.end-phase.start)*fraction);
      for(const v of stationary)for(let k=0;k<3;k++)assert.ok(Math.abs(pose[v*3+k]-seed[v*3+k])<2e-7,'the entire central side of the active axes stays put; only the two exterior flaps move');
      assert.ok(Array.from({length:data.prepared.vertexCount},(_,v)=>Math.hypot(...[0,1,2].map(k=>pose[v*3+k]-seed[v*3+k]))).some(distance=>distance>.01),'the test observes real flap movement instead of a frozen model');
    }
  }
}

test('real crossing precreases have individually valid axes but no simultaneous rigid sweep',()=>{
  const data=preparedFixture('diagonals'),mechanism=compileSimulationStepRigidMechanism(data.prepared,data.clip.animation),angles=data.clip.animation.ranges.map(r=>r.viaAngle??0);
  assert.equal(data.prepared.vertexCount,5);assert.equal(data.prepared.faceCount,4);assert.deepEqual(data.groups.map(g=>g.length),[2,2]);
  assert.throws(()=>mechanism.validatePose(angles.map(a=>a/2)),/材料|固定|折角|连接|闭环/,'two intersecting straight folds cannot be driven to 90 degrees together');
  for(const group of data.groups)for(const angle of [0,1,30,90,150,179,180]){
    const active=new Set(group),poseAngles=angles.map((a,i)=>active.has(i)?a*angle/180:0),evaluation=mechanism.evaluateAngles(poseAngles);
    assert.ok(evaluation.maxResidual<1e-12);mechanism.validatePose(poseAngles,evaluation);
  }
});

test('production animation automatically folds and unfolds the two complete crossing axes in separate safe batches',()=>{
  const playback=verifiedPlayback(preparedFixture('diagonals'));
  assert.equal(playback.mostParallel,1);assert.equal(playback.motion.phases.length,4,'two straight folds each require a fold and return, rather than four unrelated half-creases');
});

test('four corners with two angle-bisector precreases each retain useful parallel batches and real continuous safety',()=>{
  const data=preparedFixture('corner-bisectors');assert.equal(data.prepared.vertexCount,28);assert.equal(data.prepared.faceCount,42);assert.deepEqual(data.groups.map(g=>g.length),Array(8).fill(5));
  const playback=verifiedPlayback(data);assert.ok(playback.mostParallel>=2,'independent whole crease axes should share a batch when their full route is safe');
  assert.ok(playback.motion.phases.length<16,'eight source strokes must not degrade to eight completely serial fold-return operations');
  assert.deepEqual(data.fixture.fixedPoint,[50,50]);assertCentralSideStationary(data,playback);
});

test('geometrically valid adjacent precreases that collide are placed into different fold-return batches',()=>{
  const data=preparedFixture('corner-bisectors'),active=new Set([1,2].flatMap(i=>data.groups[i])),mechanism=compileSimulationStepRigidMechanism(data.prepared,data.clip.animation);
  let collided=false;
  for(let angle=9;angle<180;angle+=9){
    const angles=data.clip.animation.ranges.map((r,i)=>active.has(i)?r.viaAngle!*angle/180:0),pose=mechanism.validatePose(angles);
    if(inspectSimulationStepCollisions({indices:data.prepared.indices,triangleBodies:mechanism.triangleBodies,triangleSourceFaces:data.prepared.triangleSourceFaces},pose).status==='collision')collided=true;
  }
  assert.ok(collided,'this is a real material collision rather than a mocked candidate rejection');
  const playback=verifiedPlayback(data,[1,2]);assert.equal(playback.mostParallel,1);assert.equal(playback.motion.phases.length,4);
});

test('serialized batches cannot omit a requested precrease, reduce its full peak, or reverse direction before reaching that peak',()=>{
  const data=preparedFixture('diagonals'),result=planVerifiedSimulationStepAnimation(data.clip.fold,data.clip.animation,undefined,{initialGeometry:data.clip.initialGeometry}),original=result.animation.motion!;
  const knots=(motion:SimulationStepMotion)=>{motion.knots=[{progress:0,angles:[...motion.phases[0].fromAngles]},...motion.phases.map(p=>({progress:p.end,angles:[...p.toAngles]}))];return motion;};
  for(const factor of [0,179/180]){
    const corrupt=structuredClone(original),group=new Set(data.groups[0]);
    for(const phase of corrupt.phases){phase.fromAngles=phase.fromAngles.map((a,i)=>group.has(i)?a*factor:a);phase.toAngles=phase.toAngles.map((a,i)=>group.has(i)?a*factor:a);}
    assert.throws(()=>validateSimulationStepMotion(data.prepared,data.clip.animation,knots(corrupt)),/预折|折角|路径|本步/,'descriptive batch metadata cannot certify an omitted or incomplete actual fold');
  }
  const corrupt=structuredClone(original),phase=corrupt.phases[0],interpolate=(fraction:number)=>phase.fromAngles.map((a,i)=>a+(phase.toAngles[i]-a)*fraction),third=(phase.end-phase.start)/3;
  corrupt.phases.splice(0,1,
    {...phase,end:phase.start+third,toAngles:interpolate(.5)},
    {...phase,start:phase.start+third,end:phase.start+2*third,fromAngles:interpolate(.5),toAngles:interpolate(.25)},
    {...phase,start:phase.start+2*third,fromAngles:interpolate(.25)},
  );
  assert.throws(()=>validateSimulationStepMotion(data.prepared,data.clip.animation,knots(corrupt)),/预折|单调|回程|折角|路径|本步/,'each precrease has one monotone folding leg and one monotone return');
});

test('automatic fixed-side selection holds the same central region as an explicit central anchor',()=>{
  const automatic=preparedFixture('corner-bisectors',null),central=preparedFixture('corner-bisectors');
  assert.equal(automatic.project.steps[0].foldLink!.fixed,undefined);
  assert.deepEqual(automatic.clip.animation.fixedVertices,central.clip.animation.fixedVertices,'the largest union material face is the centre, even when the initial CP was a single square');
  const playback=verifiedPlayback(automatic);assertCentralSideStationary(automatic,playback);
});

test('an explicitly chosen noncentral fixed side is preserved rather than silently replaced by the centre',()=>{
  const data=preparedFixture('corner-bisectors',[50,5]),playback=verifiedPlayback(data),seed=playback.path.evaluate(0),central=centralSideVertices(data,data.groups.map((_,i)=>i));
  assert.deepEqual(data.project.steps[0].foldLink!.fixed!.point,[50,5]);
  assert.ok(playback.motion.phases.some(phase=>{
    const pose=playback.path.evaluate((phase.start+phase.end)/2);return central.some(v=>Math.hypot(...[0,1,2].map(k=>pose[v*3+k]-seed[v*3+k]))>.01);
  }),'holding an exterior flap is a real different user choice, not an alias for the automatic central anchor');
});

test('a real second step retains old X creases, fixes the central material and introduces each corner batch only when it starts',()=>{
  const data=preparedFixture('corner-after-diagonals'),started=performance.now(),playback=verifiedPlayback(data);
  assert.ok(performance.now()-started<30_000,'the complete subdivided production plan and material playback finish within thirty seconds');
  assert.equal(data.project.steps.length,2);assert.equal(data.project.activeStepId,data.project.steps[1].id);assert.equal(data.clip.beforeLabel,'CP1');assert.equal(data.clip.afterLabel,'CP2');
  assert.deepEqual(data.fixture.fixedPoint,[50,45]);assert.equal(playback.motion.batches!.length,4);assert.equal(playback.mostParallel,2);assertCentralSideStationary(data,playback);
  const positions=playback.path.evaluate(0),center=centroid(positions),camera=cameraUniforms({yaw:0,pitch:0,zoom:1},center,boundingRadius(positions,center),500,500);
  const oldStrokes:[Point,Point][]=[[[0,0],[100,100]],[[100,0],[0,100]]],ranges=new Map(playback.result.animation.ranges.map(r=>[r.edge,r]));
  const oldEdges=data.prepared.edgesVertices.flatMap(([u,v],edge)=>{
    if(data.prepared.edgesAssignment[edge]!=='F'||ranges.get(edge)?.viaAngle!==undefined)return [];
    return oldStrokes.some(([a,b])=>[u,v].every(vertex=>pointOnSegment([data.prepared.fold.vertices_coords[vertex][0],-data.prepared.fold.vertices_coords[vertex][2]],{id:'old-x',a,b,assignment:'F',angle:0},1e-5)))?[edge]:[];
  });
  assert.ok(oldEdges.length>=4,'both real old diagonals survive material subdivision');
  const initial=simulationStepDisplayAssignments(data.prepared,playback.result.animation,positions,camera,0);
  for(const edge of oldEdges)assert.notEqual(initial[edge],'F','existing F crease strokes are already visible before the new step starts');
  for(const group of data.groups)for(const crease of group)assert.equal(initial[data.prepared.creaseParams[crease].edge],'F','all eight newly requested creases are initially hidden');
  for(const batch of playback.motion.batches!){
    const progress=batch.start+(batch.end-batch.start)*.01,before=simulationStepDisplayAssignments(data.prepared,playback.result.animation,playback.path.evaluate(batch.start),camera,batch.start),after=simulationStepDisplayAssignments(data.prepared,playback.result.animation,playback.path.evaluate(progress),camera,progress);
    for(const crease of batch.creases){const edge=data.prepared.creaseParams[crease].edge;assert.equal(before[edge],'F','a future batch stays hidden at its exact start');assert.notEqual(after[edge],'F','its genuine crease stroke appears immediately after its own movement starts');}
    for(const future of playback.motion.batches!.filter(next=>next.start>batch.start))for(const crease of future.creases)assert.equal(after[data.prepared.creaseParams[crease].edge],'F','a later corner never appears prematurely');
  }
  assert.deepEqual(simulationStepDisplayAssignments(data.prepared,playback.result.animation,positions,camera,0),initial,'rewinding restores old-only initial crease visibility');
});
