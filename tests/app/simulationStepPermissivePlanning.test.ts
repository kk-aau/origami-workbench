import test from 'node:test';
import assert from 'node:assert/strict';
import {planVerifiedSimulationStepAnimation} from '../../src/engine/simStepPlanning';
import {createSimulationStepPathEvaluator} from '../../src/engine/simStepPath';
import {validateSimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {simulationObstructingFlapsFixture,simulationTwoHingeFixture} from '../fixtures/simulationStepComplex';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {simulationSourceSignature} from '../../src/engine/simLayerOrder';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import type {FlatFoldResult,FoldGraph} from '../../src/core/types';
import type {SimulationStepAnimation} from '../../src/engine/simStepAnimation';

test('permissive preview keeps the first valid intersecting motion while strict planning still avoids it',()=>{
  const {fold,prepared,animation}=simulationObstructingFlapsFixture(),saved=structuredClone(animation);
  const strict=planVerifiedSimulationStepAnimation(fold as FoldGraph,animation);
  assert.equal(strict.method,'sequential');assert.ok(strict.checkedIntervals>0);
  const messages:string[]=[],permissive=planVerifiedSimulationStepAnimation(fold as FoldGraph,{...animation,collisionPolicy:'allow'},message=>messages.push(message));
  assert.equal(permissive.method,'simultaneous','a known intersection no longer triggers avoidance timing or rejects playback');
  assert.ok(permissive.warnings?.some(message=>/穿插|穿模/.test(message)));
  assert.ok(messages.every(message=>!message.includes('调整折叠先后')));
  const validated=validateSimulationStepAnimation(permissive.animation,prepared,animation.sourceSignature),path=createSimulationStepPathEvaluator(prepared,validated,validated.motion!);
  for(const p of [0,.2,.5,.8,1]){
    const positions=path.evaluate(p);assert.ok(Array.from(positions).every(Number.isFinite));
    for(const v of animation.fixedVertices)for(let axis=0;axis<3;axis++)assert.ok(positions[v*3+axis]===Math.fround(animation.initialPositions[v*3+axis]));
  }
  assert.deepEqual(path.angles(1),animation.ranges.map(r=>r.toAngle));assert.deepEqual(animation,saved);
});

test('a wrong-side departure from an existing stack warns instead of suppressing permitted playback',()=>{
  const fold:FoldGraph={vertices_coords:[[0,0],[1,0],[1,1],[0,1]],edges_vertices:[[0,1],[1,2],[2,3],[3,0],[0,2]],edges_assignment:['B','B','B','B','F'],edges_foldAngle:[0,0,0,0,0],faces_vertices:[[0,1,2],[0,2,3]]};
  const {prepared}=prepareSimulationDocument(fold),model=new OrigamiModel(prepared),initialPositions=Array.from(model.originalPositions);
  for(let axis=0;axis<3;axis++)initialPositions[3+axis]=initialPositions[9+axis];
  const animation:SimulationStepAnimation={version:1,sourceSignature:simulationSourceSignature(fold),initialPositions,ranges:prepared.creaseParams.map(c=>({edge:c.edge,fromAngle:180,toAngle:0})),fixedVertices:[...prepared.facesVertices[1]]};
  const vertices:[[number,number],[number,number],[number,number],[number,number]]=[[0,0],[0,1],[1,1],[0,1]];
  const initialGeometry:FlatFoldResult={geometry:{status:'ready',message:'已折叠的材料初态',vertices,faces:fold.faces_vertices!,graph:{...fold,vertices_coords:vertices}},layers:{status:'solved',message:'已指定初态层序',faceOrders:[[0,1,-1]]},warnings:[]};
  assert.throws(()=>planVerifiedSimulationStepAnimation(fold,animation,undefined,{initialGeometry}),/错误一侧|碰撞|先后|接触/);
  const result=planVerifiedSimulationStepAnimation(fold,{...animation,collisionPolicy:'allow'},undefined,{initialGeometry});
  assert.ok(result.animation.motion);assert.ok(result.warnings?.length);
  assert.doesNotThrow(()=>validateSimulationStepAnimation(result.animation,prepared,animation.sourceSignature));
});

test('allowing intersections does not permit invalid coordinates, stretched paper or an impossible fixed side',()=>{
  const {fold,prepared,animation}=simulationTwoHingeFixture();
  const invalid=structuredClone(animation);invalid.initialPositions[0]=NaN;
  assert.throws(()=>planVerifiedSimulationStepAnimation(fold as FoldGraph,{...invalid,collisionPolicy:'allow'}),/坐标无效/);
  const stretched=structuredClone(animation);stretched.initialPositions[0]+=.1;
  assert.throws(()=>planVerifiedSimulationStepAnimation(fold as FoldGraph,{...stretched,collisionPolicy:'allow'}),/拉伸/);
  assert.throws(()=>planVerifiedSimulationStepAnimation(fold as FoldGraph,{...animation,collisionPolicy:'allow',fixedVertices:Array.from({length:prepared.vertexCount},(_,i)=>i)}),/固定点|固定侧|固定.*纸面/);
});
