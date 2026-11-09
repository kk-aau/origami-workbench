import test from 'node:test';
import assert from 'node:assert/strict';
import {refineSimulationStepForBending} from '../../src/engine/simStepBending';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {validateSimulationStepAnimationStructure} from '../../src/engine/simStepAnimation';
import {simulationTwoHingeFixture} from '../fixtures/simulationStepComplex';
import type {FoldGraph} from '../../src/core/types';
import type {SimulationMeshProvenance} from '../../src/engine/simFlexibleMesh';

test('ordinary animation fallback refines material coordinates, timings and pins together',()=>{
  const {fold,animation,prepared}=simulationTwoHingeFixture();
  const original=JSON.stringify([fold,animation]);
  const active=animation.ranges.find(r=>r.toAngle!==0)!;
  const input={...animation,motionPolicy:'allow-dynamic' as const,collisionPolicy:'contact' as const,timings:[{edge:active.edge,start:.2,end:.8}]};
  const refined=refineSimulationStepForBending(fold as FoldGraph,input),next=prepareSimulationDocument(refined.fold).prepared;
  assert.equal(refined.animation.materialMode,'bendable');assert.equal(refined.animation.collisionPolicy,'contact');
  assert.ok(next.vertexCount>prepared.vertexCount);assert.equal(next.faceCount,4*prepared.faceCount);
  assert.equal(refined.animation.timings!.length,2,'both children retain the authored material timing');
  assert.ok(refined.animation.timings!.every(t=>t.start===.2&&t.end===.8));
  const provenance=next.fold.zhezhi_flexible_mesh as SimulationMeshProvenance;
  for(const v of refined.animation.fixedVertices)assert.ok(provenance.vertexWeights[v].every(([parent])=>animation.fixedVertices.includes(parent)));
  assert.ok(refined.animation.ranges.every(r=>provenance.edgeSourceEdges[r.edge]!==null||r.fromAngle===0&&r.toAngle===0));
  assert.doesNotThrow(()=>validateSimulationStepAnimationStructure(refined.animation,next,refined.animation.sourceSignature));
  assert.equal(JSON.stringify([fold,animation]),original);
});

test('arbitrary caller pins are never silently released by bending refinement',()=>{
  const {fold,prepared,animation}=simulationTwoHingeFixture();
  const fixedVertices=Array.from({length:prepared.vertexCount},(_,i)=>i);
  const refined=refineSimulationStepForBending(fold as FoldGraph,{...animation,fixedVertices});
  assert.equal(refined.animation.fixedVertices.length,refined.animation.initialPositions.length/3);
  assert.throws(()=>validateSimulationStepAnimationStructure({...animation,bendingFixedVertices:[0,1,999]},prepared,animation.sourceSignature),/固定纸面/);
});
