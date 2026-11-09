import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {simulationSourceSignature} from '../../src/engine/simLayerOrder';
import {planSimulationStepPath,createSimulationStepPathEvaluator} from '../../src/engine/simStepPath';
import type {SimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {createSimulationStepTangentProjector} from '../../src/engine/simStepCollision';
import {inspectSimulationStepInitialContactOrder} from '../../src/engine/simStepContactOrder';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {simulationObstructingFlapsFixture} from '../fixtures/simulationStepComplex';

function foldedOpeningFixture(angle=180,stationary=false){
  const fold={vertices_coords:[[0,0],[1,0],[1,1],[0,1]],edges_vertices:[[0,1],[1,2],[2,3],[3,0],[0,2]] as [number,number][],edges_assignment:['B','B','B','B',stationary?'V':'F'],edges_foldAngle:[0,0,0,0,stationary?angle:0],faces_vertices:[[0,1,2],[0,2,3]]};
  const {prepared}=prepareSimulationDocument(fold),model=new OrigamiModel(prepared),initialPositions=Array.from(model.originalPositions);
  for(let axis=0;axis<3;axis++)initialPositions[1*3+axis]=initialPositions[3*3+axis];
  const animation:SimulationStepAnimation={version:1,sourceSignature:simulationSourceSignature(fold),initialPositions,ranges:prepared.creaseParams.map(c=>({edge:c.edge,fromAngle:angle,toAngle:stationary?angle:0})),fixedVertices:[...prepared.facesVertices[1]]};
  const motion=planSimulationStepPath(prepared,animation),path=createSimulationStepPathEvaluator(prepared,animation,motion),m=path.mechanism;
  const projector=createSimulationStepTangentProjector({initialPositions:m.seedPositions,vertexBodies:m.vertexBodies,fromAngles:m.fromAngles,bodies:m.components.map(b=>({parent:b.parent,crease:b.parentCrease,sign:b.rotationSign,...(b.parentCrease===null?{}:{axisVertices:prepared.edgesVertices[prepared.creaseParams[b.parentCrease].edge]})}))},motion.phases);
  return {prepared,animation,path,projector};
}

test('initial layer order rejects the zero-thickness wrong-side departure that collision distance cannot distinguish',()=>{
  const {prepared,path,projector}=foldedOpeningFixture(),options={initialSide:projector.initialContactSide};
  const positive=inspectSimulationStepInitialContactOrder(prepared,path,{sourceFaceCount:2,faceOrders:[[0,1,1]]},options);
  const negative=inspectSimulationStepInitialContactOrder(prepared,path,{sourceFaceCount:2,faceOrders:[[0,1,-1]]},options);
  assert.ok(positive.overlapPairs>0);assert.ok(negative.overlapPairs>0);
  assert.equal(positive.status,'clear','a valley-folded top flap may unfold back through its original upper side');
  assert.equal(negative.status,'collision','the identical zero-thickness motion violates the opposite material stack order');
  assert.ok(negative.violations.length>0);assert.equal(negative.violations[0].expectedSign,-1);assert.equal(negative.violations[0].actualSign,1);
});

test('reversing FOLD relation orientation accounts for opposite material normals',()=>{
  const {prepared,path,projector}=foldedOpeningFixture(),options={initialSide:projector.initialContactSide};
  assert.equal(inspectSimulationStepInitialContactOrder(prepared,path,{sourceFaceCount:2,faceOrders:[[1,0,1]]},options).status,'clear');
  assert.equal(inspectSimulationStepInitialContactOrder(prepared,path,{sourceFaceCount:2,faceOrders:[[1,0,-1]]},options).status,'collision');
});

test('unknown or stale initial layer order is inconclusive only when real cross-body area overlaps exist',()=>{
  const {prepared,path,projector}=foldedOpeningFixture();
  for(const order of [null,{sourceFaceCount:3,faceOrders:[[0,1,1]] as [number,number,number][]},{sourceFaceCount:2,faceOrders:[]}])assert.equal(inspectSimulationStepInitialContactOrder(prepared,path,order,{initialSide:projector.initialContactSide}).status,'inconclusive');
  assert.equal(inspectSimulationStepInitialContactOrder(prepared,path,{sourceFaceCount:2,faceOrders:[[0,1,1]]}).status,'inconclusive','finite pose samples do not certify which side leaves first');
  const f=simulationObstructingFlapsFixture(),plan=planSimulationStepPath(f.prepared,f.animation),p=createSimulationStepPathEvaluator(f.prepared,f.animation,plan);
  const result=inspectSimulationStepInitialContactOrder(f.prepared,p,null);
  assert.equal(result.status,'clear');assert.equal(result.overlapPairs,0,'shared material edges and vertices are not overlapping sheet area');
});

test('unchanged superimposed layers moving as one rigid assembly need no independent departure certificate',()=>{
  const {prepared,path}=foldedOpeningFixture(180,true),result=inspectSimulationStepInitialContactOrder(prepared,path,null);
  assert.equal(result.status,'clear');assert.equal(result.overlapPairs,0);
});

test('opposite MV unfolding really leaves the opposite side and preserves the corresponding initial stack',()=>{
  const {prepared,path,projector}=foldedOpeningFixture(-180),options={initialSide:projector.initialContactSide};
  assert.equal(inspectSimulationStepInitialContactOrder(prepared,path,{sourceFaceCount:2,faceOrders:[[0,1,-1]]},options).status,'clear');
  assert.equal(inspectSimulationStepInitialContactOrder(prepared,path,{sourceFaceCount:2,faceOrders:[[0,1,1]]},options).status,'collision');
});
