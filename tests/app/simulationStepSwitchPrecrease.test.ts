import test from 'node:test';
import assert from 'node:assert/strict';
import {screenshotStepStageDocuments1016,screenshotStepStagesFixture1016} from '../fixtures/screenshotStepStages1016';
import {exportDiagramProject,updateDiagramFoldLink} from '../../src/app/diagramProject';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {pointOnSegment} from '../../src/core/geometry';
import type {Point,Segment} from '../../src/core/types';
import {adjacentSimulationStepFoldedEdges,switchSimulationStepPrecreaseCandidates,switchSimulationStepPrecreaseEdges} from '../../src/engine/simStepRefold';
import {planVerifiedSimulationStepAnimation} from '../../src/engine/simStepPlanning';
import {createSimulationStepPathEvaluator} from '../../src/engine/simStepPath';

function explicitSwitchFixture(){
  const fixture=screenshotStepStagesFixture1016(1,4),vertical:Segment={...fixture.after.vertical,assignment:'M',angle:-180};
  const project=updateDiagramFoldLink(fixture.project,fixture.stepId,{enabled:true,layers:'all',selectedFaces:[],precreases:[vertical]});
  return {...fixture,project};
}

test('a local precrease axis switch releases only the connected old mountain axis, including both material segments',()=>{
  const fixture=explicitSwitchFixture(),clip=buildDiagramStepAnimation(fixture.project,fixture.stepId),{prepared}=prepareSimulationDocument(clip.fold);
  const cp=prepared.fold.vertices_coords.map(p=>[p[0],-p[2]] as Point),ur=fixture.after.ring[2];
  const horizontal:Segment={id:'expected-old-horizontal',a:ur,b:[100,ur[1]],assignment:'M',angle:-180};
  const horizontalEdges=prepared.creaseParams.filter(c=>prepared.edgesVertices[c.edge].every(v=>pointOnSegment(cp[v],horizontal,1e-6))).map(c=>c.edge);
  assert.equal(horizontalEdges.length,2,'CP intersections split the old physical mountain into two pieces');
  const selected=switchSimulationStepPrecreaseEdges(prepared,clip.animation);
  assert.deepEqual(selected.slice().sort((a,b)=>a-b),horizontalEdges.slice().sort((a,b)=>a-b));
  assert.ok(selected.some(edge=>!adjacentSimulationStepFoldedEdges(prepared,clip.animation).includes(edge)),'the old axis meets the new ray across folded sectors, beyond immediate panel adjacency');
  const original=structuredClone(clip.animation),candidates=[...switchSimulationStepPrecreaseCandidates(prepared,clip.animation)];
  assert.equal(candidates.length,1);
  const candidate=candidates[0],before=new Map(original.ranges.map(r=>[r.edge,r]));
  for(const range of candidate.ranges){
    const old=before.get(range.edge)!;
    assert.equal(range.fromAngle,old.fromAngle);assert.equal(range.toAngle,old.toAngle);
    assert.equal(range.viaAngle,horizontalEdges.includes(range.edge)?0:old.viaAngle);
  }
  assert.deepEqual(candidate.fixedVertices,original.fixedVertices);assert.deepEqual(candidate.initialPositions,original.initialPositions);
  assert.deepEqual(clip.animation,original);
  assert.equal([...switchSimulationStepPrecreaseCandidates(prepared,clip.animation,{maxCandidates:0})].length,0);
  assert.deepEqual(switchSimulationStepPrecreaseEdges(prepared,{initialPositions:clip.animation.initialPositions,ranges:clip.animation.ranges.map(r=>({edge:r.edge,fromAngle:r.fromAngle,toAngle:r.toAngle}))}),[],'a flat added mark without directed precrease is not a folding instruction');
});

test('the production eight-vertex ring presses the vertical mountain through the real intermediate CP and restores all old layers',()=>{
  const fixture=explicitSwitchFixture(),savedProject=exportDiagramProject(fixture.project),clip=buildDiagramStepAnimation(fixture.project,fixture.stepId);
  const savedAnimation=structuredClone(clip.animation),{prepared}=prepareSimulationDocument(clip.fold),middle=screenshotStepStageDocuments1016(3).doc;
  const planned=planVerifiedSimulationStepAnimation(clip.fold,clip.animation,undefined,{initialGeometry:clip.initialGeometry});
  assert.ok(planned.checkedIntervals>0,'playback requires the production continuous collision certificate');
  const animation=planned.animation,path=createSimulationStepPathEvaluator(prepared,animation,animation.motion!);
  const cp=prepared.fold.vertices_coords.map(p=>[p[0],-p[2]] as Point),middleAngles=prepared.creaseParams.map(crease=>{
    const segment=middle.segments.find(s=>prepared.edgesVertices[crease.edge].every(v=>pointOnSegment(cp[v],s,1e-6)));
    return segment?.assignment==='M'?-180:segment?.assignment==='V'?180:0;
  });
  assert.deepEqual(path.angles(.5),middleAngles,'the midpoint is exactly screenshot 3, rather than opening the surrounding ring');
  const released=animation.ranges.filter(r=>r.fromAngle===-180&&r.toAngle===-180&&r.viaAngle===0);
  assert.equal(released.length,2);
  const oldValleys=prepared.creaseParams.flatMap((c,i)=>savedAnimation.ranges.find(r=>r.edge===c.edge)?.fromAngle===180?[i]:[]);
  assert.ok(oldValleys.length>4,'this fixture has a genuinely folded ring, not two unconstrained flaps');
  for(const progress of [0,.001,.13,.25,.499,.5,.501,.73,.99,1]){
    const angles=path.angles(progress),positions=path.evaluate(progress);
    for(const i of oldValleys)assert.equal(angles[i],180,'all surrounding old valleys remain folded throughout');
    for(const v of savedAnimation.fixedVertices)for(let axis=0;axis<3;axis++)assert.ok(positions[v*3+axis]===Math.fround(savedAnimation.initialPositions[v*3+axis]),'the exact original fixed side stays pinned');
    for(const angle of angles)assert.ok(angle>=-180&&angle<=180);
  }
  assert.deepEqual(path.evaluate(0),path.evaluate(1),'a precrease returns the original material pose');
  assert.deepEqual(animation.fixedVertices,savedAnimation.fixedVertices);assert.deepEqual(animation.initialPositions,savedAnimation.initialPositions);
  assert.deepEqual(clip.animation,savedAnimation);assert.equal(exportDiagramProject(fixture.project),savedProject,'the temporary axis switch never rewrites CPs or the user precrease ledger');
  assert.equal(animation.layerTimeline?.[0].progress,0);assert.equal(animation.layerTimeline?.at(-1)?.progress,1);
});
