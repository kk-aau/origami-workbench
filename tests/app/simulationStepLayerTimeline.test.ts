import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {simulationSourceSignature} from '../../src/engine/simLayerOrder';
import {createSimulationStepPathEvaluator,planSimulationStepPath} from '../../src/engine/simStepPath';
import {buildSimulationStepLayerTimeline,simulationStepLayerOrderAt} from '../../src/engine/simStepLayerTimeline';
import type {SimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {simulationDegreeFourFixture,simulationObstructingFlapsFixture,simulationTwoHingeFixture} from '../fixtures/simulationStepComplex';
import {certifySimulationStepPath,createSimulationStepTangentProjector} from '../../src/engine/simStepCollision';
import {inspectSimulationStepInitialContactOrder} from '../../src/engine/simStepContactOrder';

function diagonalFixture(sign=1,precrease=false){
  const fold={vertices_coords:[[0,0],[1,0],[1,1],[0,1]],edges_vertices:[[0,1],[1,2],[2,3],[3,0],[0,2]] as [number,number][],edges_assignment:['B','B','B','B',precrease?'F':sign>0?'V':'M'],edges_foldAngle:[0,0,0,0,precrease?0:sign*180],faces_vertices:[[0,1,2],[0,2,3]]};
  const {prepared}=prepareSimulationDocument(fold),model=new OrigamiModel(prepared);
  const animation:SimulationStepAnimation={version:1,sourceSignature:simulationSourceSignature(fold),initialPositions:Array.from(model.originalPositions),ranges:prepared.creaseParams.map(c=>({edge:c.edge,fromAngle:0,toAngle:precrease?0:sign*180,...(precrease?{viaAngle:sign*180}:{})})),fixedVertices:[...prepared.facesVertices[1]]};
  animation.motion=planSimulationStepPath(prepared,animation);return {prepared,animation};
}
const pair=(rows:readonly (readonly number[])[],a:number,b:number)=>rows.find(r=>r[0]===a&&r[1]===b||r[0]===b&&r[1]===a);

test('numerical playback retains old contact through a common 3D rotation but rejects relative movement and stretching',()=>{
 const {prepared,animation}=diagonalFixture(),path=createSimulationStepPathEvaluator(prepared,animation,animation.motion!),seed=path.evaluate(1);
 const numeric={...animation,initialPositions:Array.from(seed)};delete numeric.motion;
 const rows:[number,number,number][]=[[0,1,1]],timeline=[{progress:0,faceOrders:rows},{progress:1,faceOrders:[]}];
 const rotated=Float32Array.from(seed,(_,i)=>{const v=i-i%3,x=seed[v],y=seed[v+1],z=seed[v+2],c=Math.cos(.7),s=Math.sin(.7);return i%3===0?c*x-s*y+3:i%3===1?s*x+c*y-2:z+1;});
 for(const progress of [.1,.5,.99,1])assert.deepEqual(simulationStepLayerOrderAt(prepared,numeric,timeline,progress,rotated),rows);
 const moved=rotated.slice(),v=prepared.facesVertices[1].find(v=>!prepared.facesVertices[0].includes(v))!;moved[v*3]+=.01;
 assert.deepEqual(simulationStepLayerOrderAt(prepared,numeric,timeline,.5,moved),[]);
 assert.deepEqual(seed,path.evaluate(1),'display proof cannot change solver geometry');
});

test('new fold contact uses the actual approach side, with opposite MV producing opposite material order',()=>{
  for(const sign of [1,-1]){
    const {prepared,animation}=diagonalFixture(sign),timeline=buildSimulationStepLayerTimeline(prepared,animation,{sourceFaceCount:2,faceOrders:[]});
    assert.deepEqual(timeline.map(f=>f.progress),[0,1]);assert.deepEqual(timeline[0].faceOrders,[]);
    assert.deepEqual(timeline[1].faceOrders,[[0,1,sign]]);
    assert.deepEqual(simulationStepLayerOrderAt(prepared,animation,timeline,.99),[],'separated flaps must not inherit their future contact order');
    assert.deepEqual(simulationStepLayerOrderAt(prepared,animation,timeline,1),[[0,1,sign]]);
  }
});

test('precrease establishes the folded contact then returns to the genuine unoverlapped initial sheet',()=>{
  const {prepared,animation}=diagonalFixture(1,true),timeline=buildSimulationStepLayerTimeline(prepared,animation,{sourceFaceCount:2,faceOrders:[]});
  assert.deepEqual(timeline.map(f=>f.progress),[0,.5,1]);assert.deepEqual(timeline[1].faceOrders,[[0,1,1]]);assert.deepEqual(timeline[2].faceOrders,[]);
  for(const progress of [.25,.75,1])assert.deepEqual(simulationStepLayerOrderAt(prepared,animation,timeline,progress),[]);
});

test('old coincident sheets retain the supplied initial orientation while a different flap folds',()=>{
  const {prepared,animation}=simulationTwoHingeFixture(),oldIndex=prepared.creaseParams.findIndex(c=>c.targetAngle===180),newIndex=prepared.creaseParams.findIndex(c=>c.targetAngle===-180);
  const first:SimulationStepAnimation={...animation,ranges:prepared.creaseParams.map((c,i)=>({edge:c.edge,fromAngle:0,toAngle:i===oldIndex?180:0}))};
  const firstMotion=planSimulationStepPath(prepared,first),seed=createSimulationStepPathEvaluator(prepared,first,firstMotion).evaluate(1);
  const next:SimulationStepAnimation={...animation,initialPositions:Array.from(seed),ranges:prepared.creaseParams.map((c,i)=>({edge:c.edge,fromAngle:i===oldIndex?180:0,toAngle:i===oldIndex?180:i===newIndex?-180:0}))};
  next.motion=planSimulationStepPath(prepared,next);
  // The UI's selected flat solution is authoritative even if an unconstrained
  // endpoint solver would happen to choose the other stacking order.
  const initial={sourceFaceCount:3,faceOrders:[[1,0,-1]] as [number,number,number][]},timeline=buildSimulationStepLayerTimeline(prepared,next,initial);
  assert.deepEqual(timeline[0].faceOrders,initial.faceOrders);
  assert.deepEqual(simulationStepLayerOrderAt(prepared,next,timeline,.1),initial.faceOrders);
  assert.deepEqual(simulationStepLayerOrderAt(prepared,next,timeline,.75),initial.faceOrders);
  assert.deepEqual(pair(timeline.at(-1)!.faceOrders,0,1),[1,0,-1]);
  assert.ok(pair(timeline.at(-1)!.faceOrders,1,2),'the arriving third panel needs its own approach-derived row');
});

test('an old folded stack keeps its material order while the whole stack rotates about another hinge',()=>{
  const {prepared,animation}=simulationTwoHingeFixture(),oldIndex=prepared.creaseParams.findIndex(c=>c.targetAngle===180),newIndex=prepared.creaseParams.findIndex(c=>c.targetAngle===-180);
  const first:SimulationStepAnimation={...animation,ranges:prepared.creaseParams.map((c,i)=>({edge:c.edge,fromAngle:0,toAngle:i===oldIndex?180:0}))},firstMotion=planSimulationStepPath(prepared,first);
  const seed=createSimulationStepPathEvaluator(prepared,first,firstMotion).mechanism.evaluateAngles(firstMotion.phases.at(-1)!.toAngles).positions;
  const source=prepared.triangleSourceFaces!,pins=new Set(prepared.facesVertices.flatMap((face,i)=>source[i]===2?face:[]));
  const next:SimulationStepAnimation={...animation,initialPositions:Array.from(seed),fixedVertices:[...pins],ranges:prepared.creaseParams.map((c,i)=>({edge:c.edge,fromAngle:i===oldIndex?180:0,toAngle:i===oldIndex?180:i===newIndex?-180:0}))};
  next.motion=planSimulationStepPath(prepared,next);const timeline=buildSimulationStepLayerTimeline(prepared,next,{sourceFaceCount:3,faceOrders:[[0,1,1]]});
  const middle=createSimulationStepPathEvaluator(prepared,next,next.motion).evaluate(.5);
  assert.ok(Array.from(middle).some((v,i)=>Math.abs(v-seed[i])>.1),'the old two-sheet stack actually moves in three dimensions');
  assert.deepEqual(simulationStepLayerOrderAt(prepared,next,timeline,.5),[[0,1,1]],'moving stacks need the same layer preservation as fixed stacks');
});

test('coupled four-crease contact derives material order without independent linear-angle guesses',()=>{
  const {prepared,animation}=simulationDegreeFourFixture();animation.motion=planSimulationStepPath(prepared,animation);
  assert.equal(animation.motion.method,'coupled');const timeline=buildSimulationStepLayerTimeline(prepared,animation,{sourceFaceCount:4,faceOrders:[]});
  assert.ok(timeline.at(-1)!.faceOrders.length>=3,'the fully folded vertex has multiple positive-area contacts');
  const p=createSimulationStepPathEvaluator(prepared,animation,animation.motion),phase=animation.motion.phases[0],seed=p.mechanism.evaluateAngles(phase.toAngles).positions;
  const reverse:SimulationStepAnimation={...animation,initialPositions:Array.from(seed),ranges:prepared.creaseParams.map((c,i)=>({edge:c.edge,fromAngle:phase.toAngles[i],toAngle:phase.fromAngles[i]}))};
  reverse.motion={...animation.motion,phases:[{...phase,fromAngles:[...phase.toAngles],toAngles:[...phase.fromAngles]}],knots:animation.motion.knots.map(k=>({progress:1-k.progress,angles:[...k.angles]})).reverse()};
  const reversePath=createSimulationStepPathEvaluator(prepared,reverse,reverse.motion),m=reversePath.mechanism,projector=createSimulationStepTangentProjector({initialPositions:m.seedPositions,vertexBodies:m.vertexBodies,fromAngles:m.fromAngles,bodies:m.components.map(b=>({parent:b.parent,crease:b.parentCrease,sign:b.rotationSign,...(b.parentCrease===null?{}:{axisVertices:prepared.edgesVertices[prepared.creaseParams[b.parentCrease].edge]})}))},reverse.motion.phases);
  const checked=inspectSimulationStepInitialContactOrder(prepared,reversePath,{sourceFaceCount:4,faceOrders:timeline.at(-1)!.faceOrders},{initialSide:projector.initialContactSide});
  assert.equal(checked.status,'clear','every real endpoint overlap must have a row consistent with the actual continuous material approach');
  assert.ok(checked.checkedPairs>=3);
});

test('sequential phases preserve the first folded stack while the second paper flap moves',()=>{
  const {prepared,animation}=simulationObstructingFlapsFixture();
  animation.motion=planSimulationStepPath(prepared,animation,{checkPath:(path,motion)=>{
    const m=path.mechanism,projector=createSimulationStepTangentProjector({initialPositions:m.seedPositions,vertexBodies:m.vertexBodies,fromAngles:m.fromAngles,bodies:m.components.map(b=>({parent:b.parent,crease:b.parentCrease,sign:b.rotationSign,...(b.parentCrease===null?{}:{axisVertices:prepared.edgesVertices[prepared.creaseParams[b.parentCrease].edge]})}))},motion.phases);
    const certificate=certifySimulationStepPath({indices:prepared.indices,triangleBodies:m.triangleBodies},{evaluate:path.evaluate,motionBound:path.motionBound,projectionBounds:(a,b,axis,origin)=>projector(a,b,axis,origin,path.angleBounds(a,b)),contactSeparation:projector.separates,contactTransition:projector.contactTransition});
    return {status:certificate.status};
  }});
  assert.equal(animation.motion.method,'sequential');const timeline=buildSimulationStepLayerTimeline(prepared,animation,{sourceFaceCount:3,faceOrders:[]});
  assert.equal(timeline.length,3);assert.equal(timeline[1].faceOrders.length,1);
  assert.deepEqual(simulationStepLayerOrderAt(prepared,animation,timeline,.75),timeline[1].faceOrders,'the already folded first flap keeps its correct visible side');
  assert.equal(timeline[2].faceOrders.length,3,'both arriving overlaps and the carried first contact are represented');
});

test('budget exhaustion or stale initial face indices cannot manufacture an endpoint order',()=>{
  const {prepared,animation}=simulationTwoHingeFixture();animation.motion=planSimulationStepPath(prepared,animation);
  const timeline=buildSimulationStepLayerTimeline(prepared,animation,{sourceFaceCount:99,faceOrders:[[0,1,1]]},{maxPairsPerPhase:1});
  assert.deepEqual(timeline[0].faceOrders,[]);assert.deepEqual(timeline.at(-1)!.faceOrders,[]);
});
