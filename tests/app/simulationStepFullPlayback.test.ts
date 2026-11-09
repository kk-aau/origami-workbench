import test from 'node:test';
import assert from 'node:assert/strict';
import {seedSimulationStepAnimation,simulationStepFoldProfile,validateSimulationStepAnimation,type SimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {planVerifiedSimulationStepAnimation} from '../../src/engine/simStepPlanning';
import {createSimulationStepPathEvaluator,planSimulationStepPath} from '../../src/engine/simStepPath';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {exportDiagramProject} from '../../src/app/diagramProject';
import {diagramOverlappingTriangleColorFixture} from '../fixtures/simulationStepColors';
import {diagramSingleLayerCornerFixture} from '../fixtures/diagramStepAnimationScope';
import {simulationDegreeFourFixture,simulationTwoHingeFixture} from '../fixtures/simulationStepComplex';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {FoldGraph} from '../../src/core/types';

type Vector=[number,number,number];
const point=(p:ArrayLike<number>,v:number):Vector=>[p[v*3],p[v*3+1],p[v*3+2]];
const sub=(a:Vector,b:Vector):Vector=>a.map((n,k)=>n-b[k]) as Vector;
const cross=(a:Vector,b:Vector):Vector=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:Vector,b:Vector)=>a.reduce((sum,n,k)=>sum+n*b[k],0);
const unit=(v:Vector):Vector=>{const length=Math.hypot(...v);return v.map(n=>n/length) as Vector;};
const distance=(p:ArrayLike<number>,a:number,b:number)=>Math.hypot(...sub(point(p,a),point(p,b)));
const near=(a:number,b:number,tolerance=5e-7)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} versus ${b}`);
const sameAngle=(actual:number,expected:number)=>near(Math.atan2(Math.sin((actual-expected)*Math.PI/180),Math.cos((actual-expected)*Math.PI/180))*180/Math.PI,0,2e-4);
// Rigid matrix arithmetic may canonicalize -0 to +0. Every nonzero Float32
// coordinate must still agree exactly with the immutable original seed.
const exactSeed=(actual:Float32Array,original:readonly number[])=>assert.deepEqual(Float32Array.from(actual,n=>n===0?0:n),Float32Array.from(original,n=>n===0?0:n));
function actualAngles(prepared:PreparedOrigamiModel,positions:ArrayLike<number>){
  const normals=prepared.facesVertices.map(([a,b,c])=>unit(cross(sub(point(positions,b),point(positions,a)),sub(point(positions,c),point(positions,a)))));
  return prepared.creaseParams.map(crease=>{
    const [a,b]=prepared.edgesVertices[crease.edge],axis=unit(sub(point(positions,b),point(positions,a))),first=normals[crease.face1],second=normals[crease.face2];
    return Math.atan2(dot(cross(first,axis),second),Math.max(-1,Math.min(1,dot(first,second))))*180/Math.PI;
  });
}

/** Exercise the production exact seed/profile API, deliberately without any
 * near-flat preview helper, third seed argument, or slider remapping. */
function fullPlayback(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation){
  assert.ok(animation.motion,'full playback uses the original independently planned motion');
  const savedAnimation=structuredClone(animation),savedPrepared=structuredClone(prepared),model=new OrigamiModel(prepared),rest=model.originalPositions.slice(),solver=new ReferenceSolver(model),path=createSimulationStepPathEvaluator(prepared,animation,animation.motion!),seen=new Map<number,Float32Array>();
  seedSimulationStepAnimation(solver,animation);
  assert.equal(solver.stepCount,0);exactSeed(model.positions,animation.initialPositions);
  const seek=(progress:number)=>{
    const profile=simulationStepFoldProfile(animation,progress),angles=path.angles(progress);
    assert.deepEqual(profile.ranges.map(r=>r.fromAngle),angles,'the original motion angles reach the real solver unchanged');
    assert.deepEqual(profile.ranges.map(r=>r.toAngle),angles);
    solver.setFoldProfile(profile);solver.setFoldPercent(progress*100);solver.step(8);
    const positions=model.positions.slice();assert.deepEqual(positions,path.evaluate(progress),'no 99% approximation replaces the exact planned material path');
    actualAngles(prepared,positions).forEach((angle,i)=>sameAngle(angle,angles[i]));
    for(const [a,b] of prepared.edgesVertices)near(distance(positions,a,b),distance(animation.initialPositions,a,b));
    for(const v of animation.fixedVertices)for(let axis=0;axis<3;axis++)near(positions[v*3+axis],Math.fround(animation.initialPositions[v*3+axis]),2e-7);
    assert.ok((solver.readDiagnostics().maxEdgeStrain??Infinity)<1e-6);
    if(seen.has(progress))assert.deepEqual(positions,seen.get(progress),'repeated nonmonotonic seeks produce the same complete pose');else seen.set(progress,positions);
    return {positions,angles,measured:actualAngles(prepared,positions),profile};
  };
  const replay=()=>{seedSimulationStepAnimation(solver,animation);exactSeed(model.positions,animation.initialPositions);assert.equal(solver.maxVelocity(),0);};
  const dispose=()=>{
    assert.deepEqual(animation,savedAnimation,'playing the full plan does not edit its source ranges, motion or layer metadata');
    assert.deepEqual(prepared,savedPrepared);assert.deepEqual(model.originalPositions,rest);solver.dispose();
  };
  return {solver,model,path,seek,replay,dispose};
}

function foldedStrip(oldSide:'left'|'right'){
  const fixture=simulationTwoHingeFixture(),{prepared,animation,model}=fixture,hingeX=oldSide==='left'?1:2,hinge=prepared.fold.vertices_coords.findIndex(p=>p[0]===hingeX),x=model.originalPositions[hinge*3],initial=Array.from(model.originalPositions);
  for(let v=0;v<prepared.vertexCount;v++)if(oldSide==='left'?prepared.fold.vertices_coords[v][0]<hingeX:prepared.fold.vertices_coords[v][0]>hingeX)initial[v*3]=2*x-initial[v*3];
  const old=prepared.creaseParams.findIndex(c=>prepared.edgesVertices[c.edge].every(v=>prepared.fold.vertices_coords[v][0]===hingeX)),active=prepared.creaseParams.findIndex(c=>prepared.edgesVertices[c.edge].every(v=>prepared.fold.vertices_coords[v][0]===(oldSide==='left'?2:1)));
  animation.initialPositions=initial;animation.ranges.forEach((r,i)=>r.fromAngle=i===old?prepared.creaseParams[i].targetAngle:0);animation.fixedVertices=prepared.fold.vertices_coords.flatMap((p,v)=>p[0]>=1&&p[0]<=2?[v]:[]);
  // Minimal tree data has no editor layer-boundary incidence. Its exact
  // mechanical motion is independently validated; the drawn fixtures below
  // additionally run the complete production layer/collision planner.
  const motion=planSimulationStepPath(prepared,animation),valid=validateSimulationStepAnimation({...animation,motion},prepared,animation.sourceSignature);
  return {...fixture,animation:valid,old,active};
}

test('full playback retains positive and negative old 180-degree hinges and drives the new hinge all the way to its exact target',()=>{
  for(const side of ['left','right'] as const){
    const {prepared,animation,old,active}=foldedStrip(side),playback=fullPlayback(prepared,animation);
    try{
      for(const progress of [0,.26,.99,1,.5,0,1]){
        const state=playback.seek(progress);assert.equal(state.angles[old],animation.ranges[old].fromAngle);sameAngle(state.measured[old],animation.ranges[old].fromAngle);
        if(progress===1){assert.equal(state.angles[active],animation.ranges[active].toAngle);near(Math.abs(state.measured[active]),180,2e-4);}
      }
      playback.replay();playback.seek(.5);playback.solver.reset();assert.deepEqual(playback.model.positions,playback.model.originalPositions,'ordinary reset clears the articulated state');playback.replay();playback.seek(1);playback.replay();
    }finally{playback.dispose();}
  }
});

test('the actual second triangle fold uses its complete certified path and preserves the old folded layers under seek and replay',()=>{
  const fixture=diagramOverlappingTriangleColorFixture(),savedProject=exportDiagramProject(fixture.project),clip=buildDiagramStepAnimation(fixture.project,fixture.stepId),{prepared}=prepareSimulationDocument(clip.fold),planned=planVerifiedSimulationStepAnimation(clip.fold,clip.animation,undefined,{initialGeometry:clip.initialGeometry}),playback=fullPlayback(prepared,planned.animation);
  const old=planned.animation.ranges.flatMap((r,i)=>Math.abs(r.fromAngle)===180&&r.fromAngle===r.toAngle?[i]:[]),active=planned.animation.ranges.flatMap((r,i)=>r.fromAngle===0&&Math.abs(r.toAngle)===180?[i]:[]);assert.ok(old.length&&active.length);
  try{
    for(const progress of [0,.26,.99,1,.5,0,.26,1]){
      const state=playback.seek(progress);old.forEach(i=>assert.equal(state.angles[i],planned.animation.ranges[i].fromAngle));
      if(progress===1)active.forEach(i=>{assert.equal(state.angles[i],planned.animation.ranges[i].toAngle);near(Math.abs(state.measured[i]),180,2e-4);});
    }
    playback.replay();playback.seek(1);assert.equal(exportDiagramProject(fixture.project),savedProject);
  }finally{playback.dispose();}
});

test('full nonlinear playback reuses unequal coupled angles without breaking closure and reaches every exact 180-degree endpoint',()=>{
  const {fold,prepared,animation}=simulationDegreeFourFixture(),planned=planVerifiedSimulationStepAnimation(fold as FoldGraph,animation),playback=fullPlayback(prepared,planned.animation);
  assert.equal(planned.method,'coupled');
  try{
    for(const progress of [0,.17,.5,.999,1,.26,.5,0]){
      const state=playback.seek(progress),residual=playback.path.mechanism.evaluateAngles(state.angles);assert.ok(residual.maxPositionResidual<2e-5&&residual.maxAngleResidual<1e-4);
      if(progress===.5)assert.ok(Math.max(...state.angles.map(Math.abs))-Math.min(...state.angles.map(Math.abs))>20);
      if(progress===1)state.angles.forEach((angle,i)=>{assert.equal(angle,animation.ranges[i].toAngle);near(Math.abs(state.measured[i]),180,2e-4);});
    }
    playback.replay();
  }finally{playback.dispose();}
});

test('full precrease playback reaches the actual 180-degree apex and returns along the same branch to zero',()=>{
  const {fold,prepared,animation}=simulationDegreeFourFixture(0,true),planned=planVerifiedSimulationStepAnimation(fold as FoldGraph,animation),playback=fullPlayback(prepared,planned.animation);
  try{
    const apex=playback.seek(.5);apex.angles.forEach((angle,i)=>{assert.equal(angle,animation.ranges[i].viaAngle);near(Math.abs(apex.measured[i]),180,2e-4);});
    for(const progress of [0,.03,.15,.25,.49]){
      const first=playback.seek(progress).positions,returning=playback.seek(1-progress).positions;for(let i=0;i<first.length;i++)near(first[i],returning[i],3e-7);
    }
    playback.seek(1).angles.forEach(angle=>assert.equal(angle,0));playback.replay();
  }finally{playback.dispose();}
});

test('full single-layer corner playback leaves every other paper region at its original position and finishes the entire active fold',()=>{
  const fixture=diagramSingleLayerCornerFixture(),savedProject=exportDiagramProject(fixture.project),clip=buildDiagramStepAnimation(fixture.project,fixture.stepId),{prepared}=prepareSimulationDocument(clip.fold),planned=planVerifiedSimulationStepAnimation(clip.fold,clip.animation,undefined,{initialGeometry:clip.initialGeometry}),playback=fullPlayback(prepared,planned.animation),active=planned.animation.ranges.findIndex(r=>r.fromAngle===0&&Math.abs(r.toAngle)===180);
  const stationary=prepared.fold.vertices_coords.flatMap((p,v)=>Math.abs(p[0]-100)<1e-6&&Math.abs(p[2])<1e-6?[]:[v]);
  assert.equal(stationary.length,prepared.vertexCount-1);assert.ok(planned.animation.fixedVertices.length>=3);
  try{
    for(const progress of [0,.26,.99,1,.5,0,1]){
      const state=playback.seek(progress);for(const v of stationary)for(let k=0;k<3;k++)near(state.positions[v*3+k],Math.fround(planned.animation.initialPositions[v*3+k]),2e-7);
      if(progress===1){assert.equal(state.angles[active],planned.animation.ranges[active].toAngle);near(Math.abs(state.measured[active]),180,2e-4);}
    }
    playback.replay();assert.equal(exportDiagramProject(fixture.project),savedProject);
  }finally{playback.dispose();}
});

test('full unfolding playback starts at the original 180-degree nonlinear state and reaches the exact zero-angle after-CP',()=>{
  const {prepared,animation}=simulationDegreeFourFixture(0,true),motion=planSimulationStepPath(prepared,animation),precrease=createSimulationStepPathEvaluator(prepared,animation,motion);
  const unfolding={...structuredClone(animation),initialPositions:Array.from(precrease.evaluate(.5)),ranges:animation.ranges.map(r=>({edge:r.edge,fromAngle:r.viaAngle!,toAngle:0}))},unfoldingMotion=planSimulationStepPath(prepared,unfolding),valid=validateSimulationStepAnimation({...unfolding,motion:unfoldingMotion},prepared,unfolding.sourceSignature),playback=fullPlayback(prepared,valid);
  try{
    for(const progress of [0,.1,.5,.99,1,.5,0]){
      const state=playback.seek(progress);if(progress===0)state.angles.forEach((angle,i)=>{assert.equal(angle,valid.ranges[i].fromAngle);near(Math.abs(state.measured[i]),180,2e-4);});
      if(progress===1)state.angles.forEach((angle,i)=>{assert.equal(angle,0);sameAngle(state.measured[i],0);});
    }
    playback.replay();
  }finally{playback.dispose();}
});
