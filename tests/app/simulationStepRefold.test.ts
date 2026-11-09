import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {buildFold,pointOnSegment} from '../../src/core/geometry';
import type {Point,Segment} from '../../src/core/types';
import {exportDiagramProject} from '../../src/app/diagramProject';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {simulationSourceSignature} from '../../src/engine/simLayerOrder';
import {validateSimulationStepAnimation,type SimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {createSimulationStepPathEvaluator} from '../../src/engine/simStepPath';
import {planVerifiedSimulationStepAnimation} from '../../src/engine/simStepPlanning';
import {adjacentSimulationStepFoldedCandidates,adjacentSimulationStepFoldedEdges,reopenSimulationStepFoldedComponents} from '../../src/engine/simStepRefold';
import {screenshotTransitionFixture1015} from '../fixtures/screenshotStepAnimation1015';

test('the screenshot before/after refold reopens old hinges on a certified path while retaining the exact fixed side and CPs',()=>{
  const fixture=screenshotTransitionFixture1015(),savedProject=exportDiagramProject(fixture.project),clip=buildDiagramStepAnimation(fixture.project,fixture.stepId);
  const savedFold=structuredClone(clip.fold),savedAnimation=structuredClone(clip.animation),prepared=prepareSimulationDocument(clip.fold).prepared;
  const result=planVerifiedSimulationStepAnimation(clip.fold,clip.animation,undefined,{initialGeometry:clip.initialGeometry});
  assert.ok(result.checkedIntervals>0,'playback requires the production continuous collision certificate');
  assert.equal(exportDiagramProject(fixture.project),savedProject,'temporary reopening never changes either user CP');
  assert.deepEqual(clip.fold,savedFold);assert.deepEqual(clip.animation,savedAnimation);
  assert.deepEqual(result.animation.fixedVertices,clip.animation.fixedVertices,'all original fixed-side pins remain authoritative');
  assert.deepEqual(result.animation.initialPositions,clip.animation.initialPositions);
  const animation=validateSimulationStepAnimation(result.animation,prepared,clip.animation.sourceSignature);
  const original=new Map(clip.animation.ranges.map(r=>[r.edge,r]));
  for(const r of animation.ranges){const old=original.get(r.edge)!;assert.equal(r.fromAngle,old.fromAngle);assert.equal(r.toAngle,old.toAngle);}
  const released=animation.ranges.filter(r=>r.fromAngle!==0&&r.fromAngle===r.toAngle&&r.viaAngle===0);
  assert.equal(released.length,15,'the two coupled old folded components must reopen, including retained endpoint folds');
  const creaseOf=new Map(prepared.creaseParams.map((c,i)=>[c.edge,i])),indices=released.map(r=>creaseOf.get(r.edge)!);
  const path=createSimulationStepPathEvaluator(prepared,animation,animation.motion!);
  const opened=animation.motion!.phases.find(phase=>indices.every(i=>phase.toAngles[i]===0));
  assert.ok(opened,'the actual motion must reach the inferred unfolding state');
  released.forEach((range,index)=>{const i=indices[index];assert.equal(path.angles(0)[i],range.fromAngle);assert.equal(path.angles(opened.end)[i],0);assert.equal(path.angles(1)[i],range.toAngle);});
  for(const progress of [0,.013,.17,.29,opened.end,.63,.81,.997,1]){
    const positions=path.evaluate(progress);
    for(const v of clip.animation.fixedVertices)for(let axis=0;axis<3;axis++)assert.ok(positions[v*3+axis]===Math.fround(clip.animation.initialPositions[v*3+axis]),'fixed coordinates retain their exact numeric value (0 and -0 are the same position)');
  }
});

/** A topology-only incidence fixture: the old diagonal on the left is split
 * at an interior vertex by a newly active ray. The diagonal on the right
 * touches it only at the top paper-boundary corner. Its endpoint angle must
 * remain unchanged when the left folded component is reopened.
 */
function boundaryTouchingFlaps(){
  const doc=blankDoc('仅在纸边点相接的独立折瓣',100,100);
  const line=(id:string,a:Point,b:Point):Segment=>({id,a,b,assignment:'F',angle:0});
  const left=line('left',[0,50],[50,0]),right=line('right',[50,0],[100,50]),added=line('added',[0,0],[25,25]);
  doc.segments.push(left,right,added);
  const fold=buildFold(doc).graph,prepared=prepareSimulationDocument(fold).prepared;
  const coordinates=prepared.fold.vertices_coords.map(p=>[p[0],-p[2]] as Point);
  const covers=(edge:number,s:Segment)=>prepared.edgesVertices[edge].every(v=>pointOnSegment(coordinates[v],s,1e-6));
  const leftCommon:number[]=[],rightCommon:number[]=[];
  const ranges=prepared.creaseParams.map(c=>{
    if(covers(c.edge,left)){
      const retained=prepared.edgesVertices[c.edge].every(v=>coordinates[v][0]>=25-1e-6);
      if(retained)leftCommon.push(c.edge);
      return {edge:c.edge,fromAngle:180,toAngle:retained?180:0};
    }
    if(covers(c.edge,right)){rightCommon.push(c.edge);return {edge:c.edge,fromAngle:180,toAngle:180};}
    return {edge:c.edge,fromAngle:0,toAngle:covers(c.edge,added)?180:0};
  });
  const animation:SimulationStepAnimation={version:1,sourceSignature:simulationSourceSignature(fold),initialPositions:Array.from(prepared.originalPositions),fixedVertices:[...prepared.facesVertices[0]],ranges};
  return {prepared,animation,leftCommon,rightCommon};
}

test('reopening follows interior material vertices and does not release another flap touching only at the paper boundary',()=>{
  const {prepared,animation,leftCommon,rightCommon}=boundaryTouchingFlaps(),saved=structuredClone(animation);
  assert.ok(leftCommon.length&&rightCommon.length);
  const reopened=reopenSimulationStepFoldedComponents(prepared,animation);assert.ok(reopened);
  assert.deepEqual(animation,saved);assert.deepEqual(reopened.fixedVertices,animation.fixedVertices);
  for(const edge of leftCommon)assert.equal(reopened.ranges.find(r=>r.edge===edge)!.viaAngle,0);
  for(const edge of rightCommon)assert.equal(reopened.ranges.find(r=>r.edge===edge)!.viaAngle,undefined,'a shared paper corner does not couple independent folded flaps');
});

test('an explicit directed precrease is not replaced by inferred reopening',()=>{
  const {prepared,animation}=boundaryTouchingFlaps(),explicit=structuredClone(animation);
  const row=explicit.ranges.find(r=>r.fromAngle===0&&r.toAngle!==0)!;row.viaAngle=-180;
  const saved=structuredClone(explicit);
  assert.equal(reopenSimulationStepFoldedComponents(prepared,explicit),null);assert.deepEqual(explicit,saved);
});

/** Four material strips contain F triangulation seams. The precrease at x=40
 * borders the old V fold at x=20 and M fold at x=60, but not the fold at x=80.
 * Initial geometry is deliberately irrelevant to this topology-only policy. */
function neighbouringStripFolds(){
  const doc=blankDoc('相邻旧折痕的受限开合',100,100);
  for(const [x,assignment] of [[20,'V'],[40,'F'],[60,'M'],[80,'V']] as const)doc.segments.push({id:`strip-${x}`,a:[x,0],b:[x,100],assignment,angle:assignment==='V'?180:assignment==='M'?-180:0});
  const fold=buildFold(doc).graph,prepared=prepareSimulationDocument(fold).prepared;
  const coordinates=prepared.fold.vertices_coords.map(p=>[p[0],-p[2]] as Point);
  const at=(edge:number,x:number)=>prepared.edgesVertices[edge].every(v=>Math.abs(coordinates[v][0]-x)<1e-6);
  const near=prepared.creaseParams.filter(c=>at(c.edge,20)||at(c.edge,60)).map(c=>c.edge),far=prepared.creaseParams.filter(c=>at(c.edge,80)).map(c=>c.edge);
  const ranges=prepared.creaseParams.map(c=>{
    if(at(c.edge,40))return {edge:c.edge,fromAngle:0,toAngle:0,viaAngle:180};
    const angle=at(c.edge,20)||at(c.edge,80)?180:at(c.edge,60)?-180:0;
    return {edge:c.edge,fromAngle:angle,toAngle:angle};
  });
  const animation:SimulationStepAnimation={version:1,sourceSignature:simulationSourceSignature(fold),initialPositions:Array.from(prepared.originalPositions),fixedVertices:[...prepared.facesVertices[0]],ranges};
  return {prepared,animation,near,far};
}

test('adjacent release joins F triangulation seams and uses one ring of material faces, never projected contact',()=>{
  const {prepared,animation,near,far}=neighbouringStripFolds();
  assert.equal(near.length,2);assert.equal(far.length,1);
  assert.deepEqual(adjacentSimulationStepFoldedEdges(prepared,animation).sort((a,b)=>a-b),near.slice().sort((a,b)=>a-b));
  // All simulated coordinates can coincide without making the distant fold a
  // neighbour. Only indexed material-edge incidence controls this selection.
  prepared.positions.fill(0);prepared.originalPositions.fill(0);
  assert.deepEqual(adjacentSimulationStepFoldedEdges(prepared,animation).sort((a,b)=>a-b),near.slice().sort((a,b)=>a-b));
  assert.ok(far.every(edge=>!adjacentSimulationStepFoldedEdges(prepared,animation).includes(edge)));
});

test('local candidates preserve directed precreases, every pin and endpoints while opening each MV only towards zero',()=>{
  const {prepared,animation,near,far}=neighbouringStripFolds(),saved=structuredClone(animation);
  const candidates=[...adjacentSimulationStepFoldedCandidates(prepared,animation)];
  assert.ok(candidates.length>0&&candidates.length<=12);
  assert.deepEqual(candidates.slice(0,4).map(candidate=>180-Math.abs(candidate.ranges.find(r=>r.edge===near[0])!.viaAngle!)),[15,45,90,180]);
  const original=new Map(animation.ranges.map(r=>[r.edge,r]));
  for(const candidate of candidates){
    assert.deepEqual(candidate.fixedVertices,saved.fixedVertices);assert.deepEqual(candidate.initialPositions,saved.initialPositions);
    for(const range of candidate.ranges){
      const old=original.get(range.edge)!;
      assert.equal(range.fromAngle,old.fromAngle);assert.equal(range.toAngle,old.toAngle);
      if(old.viaAngle!==undefined)assert.equal(range.viaAngle,old.viaAngle,'explicit precrease direction and excursion remain authoritative');
      if(range.viaAngle!==undefined&&old.viaAngle===undefined){
        assert.ok(near.includes(range.edge));
        assert.ok(range.fromAngle>0?range.viaAngle>=0&&range.viaAngle<=180:range.viaAngle>=-180&&range.viaAngle<=0);
      }
    }
    for(const edge of far)assert.equal(candidate.ranges.find(r=>r.edge===edge)!.viaAngle,undefined);
  }
  assert.deepEqual(animation,saved);
  assert.equal([...adjacentSimulationStepFoldedCandidates(prepared,animation,{maxCandidates:3})].length,3);
  assert.equal([...adjacentSimulationStepFoldedCandidates(prepared,animation,{maxCandidates:0})].length,0);
});

test('an idle step, an explicit old-hinge excursion and a partially folded neighbour are not inferred release targets',()=>{
  const {prepared,animation,near}=neighbouringStripFolds();
  const idle={ranges:animation.ranges.map(r=>({edge:r.edge,fromAngle:r.fromAngle,toAngle:r.toAngle}))};
  assert.deepEqual(adjacentSimulationStepFoldedEdges(prepared,idle),[]);
  const constrained={ranges:animation.ranges.map(r=>r.edge===near[0]?{...r,viaAngle:r.fromAngle}:r.edge===near[1]?{...r,fromAngle:-90,toAngle:-90}:r)};
  assert.deepEqual(adjacentSimulationStepFoldedEdges(prepared,constrained),[]);
});
