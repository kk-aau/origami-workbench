import test from 'node:test';
import assert from 'node:assert/strict';
import type {FoldGraph} from '../../src/core/types';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {simulationSourceSignature} from '../../src/engine/simLayerOrder';
import {type SimulationStepAnimation,validateSimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {planSimulationStepPath,createSimulationStepPathEvaluator,SimulationStepPathError} from '../../src/engine/simStepPath';
import {planVerifiedSimulationStepAnimation} from '../../src/engine/simStepPlanning';
import {inspectSimulationStepCollisions} from '../../src/engine/simStepCollision';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {simulationDegreeFourFixture} from '../fixtures/simulationStepComplex';

/** Two spherical four-bars share the fixed central quadrilateral. A dense
 * closure solve can choose arbitrary relative speeds for their two freedoms. */
function independentVertices(precrease:boolean){
  const t=1-1/Math.sqrt(2),u=1-t;
  const edges:Array<[number,number]>=[[0,1],[1,2],[2,7],[7,3],[3,6],[6,0],[0,4],[4,1],[1,5],[5,2],[5,3],[3,4],[6,4],[5,7]];
  const fold:FoldGraph={vertices_coords:[[0,0],[1,0],[1,1],[0,1],[t,t],[u,u],[0,t],[u,1]],edges_vertices:edges,
    edges_assignment:edges.map((_,i)=>i<6?'B':precrease?'F':i<12?'V':'M'),
    edges_foldAngle:edges.map((_,i)=>i<6||precrease?0:i<12?180:-180),
    faces_vertices:[[4,1,5,3],[0,1,4],[0,4,6],[6,4,3],[1,2,5],[2,7,5],[7,3,5]]};
  const {prepared}=prepareSimulationDocument(fold),model=new OrigamiModel(prepared);
  const animation:SimulationStepAnimation={version:1,sourceSignature:simulationSourceSignature(fold),initialPositions:Array.from(model.originalPositions),
    fixedVertices:[...new Set(prepared.facesVertices.filter((_,i)=>prepared.triangleSourceFaces?.[i]===0).flat())],
    ranges:prepared.creaseParams.map(c=>({edge:c.edge,fromAngle:0,toAngle:c.targetAngle,...precrease&&c.edge>=6&&c.edge<edges.length?{viaAngle:c.edge<12?180:-180}:{}}))};
  return {fold,prepared,animation};
}

for(const precrease of [false,true])test(`independent closed vertices retry their relative speeds after real CCD rejection (${precrease?'precrease':'fold'})`,()=>{
  const {fold,prepared,animation}=independentVertices(precrease),saved=structuredClone(animation),savedFold=structuredClone(fold);
  const first=planSimulationStepPath(prepared,animation),firstPath=createSimulationStepPathEvaluator(prepared,animation,first);
  assert.equal(first.method,'coupled');assert.equal(firstPath.mechanism.joints.filter(j=>!j.tree).length,2);
  assert.equal(inspectSimulationStepCollisions({indices:prepared.indices,triangleBodies:firstPath.mechanism.triangleBodies},firstPath.evaluate((precrease?.5:1)*.9998779296875)).status,'collision','the first closed family really penetrates near final contact');
  const messages:string[]=[],result=planVerifiedSimulationStepAnimation(fold,animation,message=>messages.push(message));
  assert.equal(result.method,'coupled');assert.ok(result.checkedIntervals>0,'the accepted family passes the production continuous certificate');
  assert.ok(messages.some(message=>message.includes('方案 2')),'the first geometric solution must not terminate the family search');
  const valid=validateSimulationStepAnimation(result.animation,prepared,animation.sourceSignature),path=createSimulationStepPathEvaluator(prepared,valid,valid.motion!);
  assert.deepEqual(animation,saved);assert.deepEqual(fold,savedFold);
  assert.deepEqual(valid.fixedVertices,saved.fixedVertices);assert.deepEqual(valid.ranges,saved.ranges);
  for(const progress of [0,.17,.5,.98,.9998779296875,1,.25,.75,.25]){
    const positions=path.evaluate(progress),angles=path.angles(progress);
    for(const v of animation.fixedVertices)for(let axis=0;axis<3;axis++)assert.equal(positions[v*3+axis],Math.fround(animation.initialPositions[v*3+axis]));
    animation.ranges.forEach((range,i)=>{if(range.fromAngle===range.toAngle&&range.viaAngle===undefined)assert.equal(angles[i],range.fromAngle,'unchanged hinges retain their old angle');});
    assert.equal(inspectSimulationStepCollisions({indices:prepared.indices,triangleBodies:path.mechanism.triangleBodies},positions).status,'clear');
  }
  if(precrease){
    assert.deepEqual(Array.from(path.evaluate(0)),Array.from(path.evaluate(1)));
    for(const p of [.1,.3,.49])assert.deepEqual(Array.from(path.evaluate(p)),Array.from(path.evaluate(1-p)),'the return follows the same accepted rigid branch');
  }
});

test('path failures distinguish unavailable geometry from rejected collision certificates',()=>{
  const {prepared,animation}=independentVertices(false);
  for(const status of ['collision','inconclusive'] as const){
    assert.throws(()=>planSimulationStepPath(prepared,animation,{maxCandidates:1,checkPath:()=>({status})}),error=>error instanceof SimulationStepPathError&&error.reason===status);
  }
  const invalid=simulationDegreeFourFixture(2);
  assert.throws(()=>planSimulationStepPath(invalid.prepared,invalid.animation),error=>error instanceof SimulationStepPathError&&error.reason==='geometry');
});
