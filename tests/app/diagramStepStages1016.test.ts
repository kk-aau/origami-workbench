import test from 'node:test';
import assert from 'node:assert/strict';
import {screenshotStepStageDocuments1016,screenshotStepStagesFixture1016,screenshotStagedPrecreaseFixture1016} from '../fixtures/screenshotStepStages1016';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {exportDiagramProject,importDiagramProject,updateDiagramFoldLink,updateDiagramPoseView} from '../../src/app/diagramProject';
import {defaultModelView} from '../../src/app/modelViewState';
import {pointOnSegment} from '../../src/core/geometry';
import type {Doc,Point,Segment} from '../../src/core/types';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {simulationSourceSignature} from '../../src/engine/simLayerOrder';
import {validateSimulationStepAnimation,seedSimulationStepAnimation,simulationStepFoldProfile} from '../../src/engine/simStepAnimation';
import {createSimulationStepPathEvaluator} from '../../src/engine/simStepPath';
import {planVerifiedSimulationStepAnimation} from '../../src/engine/simStepPlanning';
import {inspectSimulationStepCollisions} from '../../src/engine/simStepCollision';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';

type Prepared=ReturnType<typeof prepareSimulationDocument>['prepared'];
const colors={front:'#24A26E',back:'#F5D677',line:'#244239'};
const materialPoint=(prepared:Prepared,v:number):Point=>[prepared.fold.vertices_coords[v][0],-prepared.fold.vertices_coords[v][2]];
const onStroke=(prepared:Prepared,edge:number,stroke:Pick<Segment,'a'|'b'>)=>prepared.edgesVertices[edge].every(v=>pointOnSegment(materialPoint(prepared,v),{id:'stroke',assignment:'F',angle:0,...stroke},1e-5));
function angleOnMaterialEdge(prepared:Prepared,edge:number,doc:Doc){
  const values=[...new Set(doc.segments.filter(stroke=>stroke.assignment!=='A'&&onStroke(prepared,edge,stroke)).map(stroke=>stroke.assignment==='M'?-180:stroke.assignment==='V'?180:0))];
  assert.ok(values.length<=1,'one original material hinge has an unambiguous CP angle');return values[0]??0;
}

for(const intentMode of ['explicit','inferred','recorded'] as const)test(`the actual screenshot horizontal–vertical–horizontal action survives native round-trip with ${intentMode==='recorded'?'recorded old-crease cycle':`${intentMode} new-crease intent`}`,()=>{
  const fixture=screenshotStepStagesFixture1016(1,4),stepId=fixture.stepId;
  let project=updateDiagramPoseView(fixture.project,stepId,{...defaultModelView(),colors});
  const recordedHorizontal=fixture.before.coloured.find(s=>s.id==='ur-horizontal')!;
  if(intentMode!=='inferred')project=updateDiagramFoldLink(project,stepId,{enabled:true,layers:'all',selectedFaces:[],precreases:[{...fixture.after.vertical,assignment:'M',angle:-180},...intentMode==='recorded'?[recordedHorizontal]:[]]});
  const saved=exportDiagramProject(project);project=importDiagramProject(saved);
  const beforeSaved=structuredClone(project.states[0]),afterSaved=structuredClone(project.states[1]),poseSaved=structuredClone(project.steps[0].pose);
  const clip=buildDiagramStepAnimation(project,stepId),clipSaved=structuredClone(clip),{prepared}=prepareSimulationDocument(clip.fold);
  const vertical=screenshotStepStageDocuments1016(3).vertical,horizontal=fixture.before.coloured.find(s=>s.id==='ur-horizontal')!;
  const verticalIndices=prepared.creaseParams.flatMap((crease,i)=>onStroke(prepared,crease.edge,vertical)?[i]:[]);
  const horizontalIndices=prepared.creaseParams.flatMap((crease,i)=>onStroke(prepared,crease.edge,horizontal)?[i]:[]);
  assert.equal(verticalIndices.length,2,'the real screenshot vertical stroke crosses an existing F line, so both material subsegments must be driven');
  assert.equal(horizontalIndices.length,2,'both original horizontal mountain subsegments must temporarily open');
  const requested=clip.animation.ranges.flatMap((r,i)=>r.fromAngle===0&&r.toAngle===0&&r.viaAngle===-180?[i]:[]);
  assert.deepEqual(requested,verticalIndices,'only the newly added vertical F stroke is interpreted as the requested mountain precrease');
  if(intentMode==='recorded'){
    assert.ok(project.steps[0].foldLink!.precreases!.some(s=>s.assignment==='M'&&pointOnSegment(horizontal.a,s,1e-5)&&pointOnSegment(horizontal.b,s,1e-5)),'native round-trip preserves the recorded old horizontal mountain cycle');
    const explicitlyOpened=clip.animation.ranges.flatMap((r,i)=>r.fromAngle===-180&&r.toAngle===-180&&r.viaAngle===0?[i]:[]);
    assert.deepEqual(explicitlyOpened,horizontalIndices,'both old horizontal material hinges already carry an explicit open-and-restore instruction before planning, without fallback inference');
  }
  const result=planVerifiedSimulationStepAnimation(clip.fold,clip.animation,undefined,{initialGeometry:clip.initialGeometry});
  assert.ok(result.checkedIntervals>0,'the full production continuous collision checker certifies the action');
  const validated=validateSimulationStepAnimation(result.animation,prepared,clip.animation.sourceSignature),path=createSimulationStepPathEvaluator(prepared,validated,validated.motion!);
  const opened=validated.ranges.flatMap((r,i)=>r.fromAngle===-180&&r.toAngle===-180&&r.viaAngle===0?[i]:[]);
  assert.deepEqual(opened,horizontalIndices,'the local switch opens precisely the old horizontal mountain, without flattening the old valley ring');
  const oldValleys=clip.animation.ranges.flatMap((r,i)=>r.fromAngle===180&&r.toAngle===180?[i]:[]);assert.ok(oldValleys.length>=16,'the complete screenshot ring is present');
  const middle=screenshotStepStageDocuments1016(3).doc,final=fixture.after.doc;
  for(let i=0;i<prepared.creaseParams.length;i++){
    const edge=prepared.creaseParams[i].edge;
    assert.equal(path.angles(.5)[i],angleOnMaterialEdge(prepared,edge,middle),'the global halfway pose has exactly screenshot 3’s material hinge assignments');
    assert.equal(path.angles(1)[i],angleOnMaterialEdge(prepared,edge,final),'the final pose restores screenshot 4 and leaves only the new vertical F crease');
  }
  const initial=path.evaluate(0),distance=(positions:ArrayLike<number>,a:number,b:number)=>Math.hypot(...[0,1,2].map(k=>positions[a*3+k]-positions[b*3+k]));
  assert.deepEqual(path.evaluate(1),initial,'the same indexed material returns exactly to its initial folded geometry');
  assert.ok(path.evaluate(.5).some((n,i)=>Math.abs(n-initial[i])>.01),'the middle state contains real paper movement');
  assert.deepEqual(validated.initialPositions,clip.animation.initialPositions);assert.deepEqual(validated.fixedVertices,clip.animation.fixedVertices);
  for(const progress of [0,.03125,.125,.25,.375,.5,.625,.75,.875,.96875,1]){
    const angles=path.angles(progress),positions=path.evaluate(progress);
    for(const i of oldValleys)assert.equal(angles[i],180,'every unrelated old valley remains fully folded throughout');
    for(const i of horizontalIndices)assert.ok(angles[i]>=-180&&angles[i]<=0,'the old mountain never reverses or overfolds');
    for(const v of clip.animation.fixedVertices)for(let k=0;k<3;k++)assert.ok(positions[v*3+k]===initial[v*3+k],'all original fixed-side pins remain stationary');
    for(const [a,b] of prepared.edgesVertices)assert.ok(Math.abs(distance(positions,a,b)-distance(initial,a,b))<2e-6,'no original material edge stretches');
    assert.equal(inspectSimulationStepCollisions({indices:prepared.indices,triangleBodies:path.mechanism.triangleBodies,triangleSourceFaces:prepared.triangleSourceFaces},positions).status,'clear');
  }
  assert.deepEqual(clip.colors,colors,'paper front, back and line colours retain the actual drawing palette');
  assert.ok(validated.layerTimeline?.length,'production prepares real layer orders for rendering');
  const orderedRelations=(rows:[number,number,number][])=>rows.map(row=>[...row]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
  assert.deepEqual(orderedRelations(validated.layerTimeline![0].faceOrders),orderedRelations(validated.layerTimeline!.at(-1)!.faceOrders),'the closed return retains every original contact-layer pair and its normal-relative sign; serialization order is immaterial');
  const model=new OrigamiModel(prepared),solver=new ReferenceSolver(model);seedSimulationStepAnimation(solver,validated);
  for(const progress of [.5,1,.17,.83,0]){
    solver.setFoldProfile(simulationStepFoldProfile(validated,progress));solver.setFoldPercent(progress*100);solver.step(2);
    assert.deepEqual(model.positions,path.evaluate(progress),'the actual runtime solver executes the same certified local switch on forward and backward seeks');
  }
  solver.dispose();
  assert.deepEqual(clip,clipSaved,'planning never rewrites the material mesh, colours or endpoint layer geometry');
  assert.deepEqual(project.states[0],beforeSaved);assert.deepEqual(project.states[1],afterSaved);assert.deepEqual(project.steps[0].pose,poseSaved);
  assert.equal(exportDiagramProject(project),saved,'the source CPs stay unchanged, including inferred animation intent');
  assert.equal(simulationSourceSignature(clip.fold),clip.animation.sourceSignature);
});

test('the user’s explicit two-step screenshot route remains a valid shared CP chain',()=>{
  const fixture=screenshotStagedPrecreaseFixture1016(),saved=exportDiagramProject(fixture.project),project=importDiagramProject(saved);
  assert.equal(project.steps[0].afterId,project.steps[1].beforeId,'both drawing steps share the actual vertical-mountain intermediate CP');
  for(const stepId of fixture.stepIds){
    const clip=buildDiagramStepAnimation(project,stepId),{prepared}=prepareSimulationDocument(clip.fold);
    const result=planVerifiedSimulationStepAnimation(clip.fold,clip.animation,undefined,{initialGeometry:clip.initialGeometry});
    assert.ok(result.checkedIntervals>0);
    const animation=validateSimulationStepAnimation(result.animation,prepared,clip.animation.sourceSignature),path=createSimulationStepPathEvaluator(prepared,animation,animation.motion!);
    assert.ok(path.evaluate(.5).some((n,i)=>Math.abs(n-path.evaluate(0)[i])>.01));
    assert.deepEqual(path.angles(0),clip.animation.ranges.map(r=>r.fromAngle));assert.deepEqual(path.angles(1),clip.animation.ranges.map(r=>r.toAngle));
  }
  assert.equal(exportDiagramProject(project),saved,'automatic animation never changes either shared CP or the two saved steps');
});
