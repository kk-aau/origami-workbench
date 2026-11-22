import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {simulationSourceSignature} from '../../src/engine/simLayerOrder';
import {simulationStepFoldProfile,type SimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {createSimulationStepRigidDriver} from '../../src/engine/simStepRigid';
import {createSimulationStepStaticLock} from '../../src/engine/simStepStaticLayers';
function fixture(){
  const fold={vertices_coords:[[0,0],[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1]],edges_vertices:[[0,1],[1,2],[2,3],[3,7],[7,6],[6,5],[5,4],[4,0],[1,5],[2,6]],edges_assignment:['B','B','B','B','B','B','B','B','V','V'],edges_foldAngle:[0,0,0,0,0,0,0,0,90,0],faces_vertices:[[0,1,5,4],[1,2,6,5],[2,3,7,6]]};
  const {prepared}=prepareSimulationDocument(fold),model=new OrigamiModel(prepared);
  const animation:SimulationStepAnimation={version:1,sourceSignature:simulationSourceSignature(fold),initialPositions:Array.from(model.originalPositions),ranges:prepared.creaseParams.map(c=>({edge:c.edge,fromAngle:0,toAngle:c.targetAngle})),fixedVertices:prepared.facesVertices.filter(f=>f.every(v=>prepared.fold.vertices_coords[v][0]<=1)).flat()};
  return {prepared,animation};
}
test('stabilizing inactive paper retains panels carried by a moving ancestor',()=>{
  const {prepared,animation}=fixture(),saved=structuredClone(animation),ranges=new Map(simulationStepFoldProfile(animation,.5).ranges.map(r=>[r.edge,r.fromAngle]));
  const pose=createSimulationStepRigidDriver(prepared,animation)(prepared.creaseParams.map(c=>ranges.get(c.edge)!)),noisy=pose.map(p=>p+1e-5),before=noisy.slice();
  const locked=createSimulationStepStaticLock(prepared,animation)(noisy,.5);assert.ok(locked>0);
  const fixed=prepared.fold.vertices_coords.findIndex(p=>p[0]===0),follower=prepared.fold.vertices_coords.findIndex(p=>p[0]===3);
  assert.deepEqual(Array.from(noisy.slice(fixed*3,fixed*3+3)),animation.initialPositions.slice(fixed*3,fixed*3+3).map(Math.fround));
  assert.deepEqual(noisy.slice(follower*3,follower*3+3),before.slice(follower*3,follower*3+3),'the last panel follows the active ancestor although its own crease is unchanged');
  assert.notDeepEqual(Array.from(noisy.slice(follower*3,follower*3+3)),animation.initialPositions.slice(follower*3,follower*3+3));assert.deepEqual(animation,saved);
});
test('rewinding to the start restores the exact seed without changing source geometry or angles',()=>{
  const {prepared,animation}=fixture(),positions=Float32Array.from(animation.initialPositions,p=>p+1e-5);
  assert.equal(createSimulationStepStaticLock(prepared,animation)(positions,0),prepared.vertexCount);
  assert.deepEqual(positions,Float32Array.from(animation.initialPositions));
});
