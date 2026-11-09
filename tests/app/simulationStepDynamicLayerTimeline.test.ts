import test from 'node:test';
import assert from 'node:assert/strict';
import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {SimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {simulationSourceSignature} from '../../src/engine/simLayerOrder';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {createSimulationStepPathEvaluator,planSimulationStepPath} from '../../src/engine/simStepPath';
import {buildSimulationStepDynamicLayerTimeline,simulationStepLayerOrderAt} from '../../src/engine/simStepLayerTimeline';

function hingeFixture(sign:1|-1){
  const fold={vertices_coords:[[0,0],[1,0],[1,1],[0,1]],edges_vertices:[[0,1],[1,2],[2,3],[3,0],[0,2]] as [number,number][],edges_assignment:['B','B','B','B',sign>0?'V':'M'],edges_foldAngle:[0,0,0,0,sign*180],faces_vertices:[[0,1,2],[0,2,3]]};
  const {prepared}=prepareSimulationDocument(fold),model=new OrigamiModel(prepared);
  const base:SimulationStepAnimation={version:1,sourceSignature:simulationSourceSignature(fold),initialPositions:Array.from(model.originalPositions),ranges:prepared.creaseParams.map(c=>({edge:c.edge,fromAngle:0,toAngle:sign*180})),fixedVertices:[...prepared.facesVertices[1]]};
  const motion=planSimulationStepPath(prepared,base),path=createSimulationStepPathEvaluator(prepared,base,motion);
  const animation:SimulationStepAnimation={...base,dynamic:{version:1,method:'dynamic',keyframes:[{progress:0,positions:[...base.initialPositions]},{progress:.95,positions:Array.from(path.evaluate(.95))},{progress:1,positions:Array.from(path.mechanism.evaluateAngles(motion.phases.at(-1)!.toAngles).positions)}],maxEdgeStrain:0,maxAreaStrain:0,maxAngleError:0,endAngleError:0,maxFixedDisplacement:0}};
  return {prepared,animation};
}

test('a pressed numerical endpoint keeps the real material approach side, including zeros on the shared hinge',()=>{
  for(const sign of [1,-1] as const){
    const {prepared,animation}=hingeFixture(sign),before=JSON.stringify(animation),timeline=buildSimulationStepDynamicLayerTimeline(prepared,animation,null);
    assert.deepEqual(timeline,[{progress:0,faceOrders:[]},{progress:1,faceOrders:[[0,1,sign]]}]);
    for(const progress of [1,.5,0,.95,1,0,1])assert.deepEqual(simulationStepLayerOrderAt(prepared,animation,timeline,progress),progress===1?[[0,1,sign]]:[],'seeking cannot change the proved contact order or use it before contact');
    assert.equal(JSON.stringify(animation),before,'display preparation never edits recorded material positions');
  }
});

function overlapFixture(heights:number[],triangleSources=[0,1],sourceFaceCount=2){
  // Separate material triangles coincide at the terminal press. Their vertex
  // heights just before contact supply independent full-overlap side oracles.
  const vertices=heights.length,triangles=Array.from({length:vertices/3},(_,i)=>[i*3,i*3+1,i*3+2]);
  const end=Array.from({length:vertices},(_,i)=>{const p=[[0,0],[1,0],[0,1]][i%3];return [p[0],0,p[1]];}).flat();
  const previous=end.map((n,i)=>i%3===1?heights[(i-1)/3]:n);
  const prepared={vertexCount:vertices,facesVertices:triangles,triangleSourceFaces:triangleSources,sourceFaceCount} as PreparedOrigamiModel;
  const animation={initialPositions:previous,dynamic:{keyframes:[{progress:0,positions:previous},{progress:1,positions:end}]}} as SimulationStepAnimation;
  return {prepared,animation};
}

test('whole-overlap verification rejects a crossing even when its center is clearly on one side',()=>{
  const {prepared,animation}=overlapFixture([.6,.6,-.1,0,0,0]);
  assert.deepEqual(buildSimulationStepDynamicLayerTimeline(prepared,animation,null)[1].faceOrders,[]);
});

test('contradictory triangulation patches cannot assign an order to their shared source-face pair',()=>{
  const {prepared,animation}=overlapFixture([.1,.1,.1,-.1,-.1,-.1,0,0,0],[0,0,1]);
  assert.deepEqual(buildSimulationStepDynamicLayerTimeline(prepared,animation,null)[1].faceOrders,[]);
});

test('a wholly coincident approach, noncoplanar endpoint, or absent recording cannot invent a terminal stack',()=>{
  const {prepared,animation}=overlapFixture([0,0,0,0,0,0]),initial={sourceFaceCount:2,faceOrders:[[1,0,-1]] as [number,number,number][]};
  assert.deepEqual(buildSimulationStepDynamicLayerTimeline(prepared,animation,initial),[{progress:0,faceOrders:initial.faceOrders},{progress:1,faceOrders:[]}]);
  assert.deepEqual(buildSimulationStepDynamicLayerTimeline(prepared,{...animation,dynamic:undefined},initial),[{progress:0,faceOrders:initial.faceOrders},{progress:1,faceOrders:[]}]);
  animation.dynamic!.keyframes[1].positions[1]=.1;
  assert.deepEqual(buildSimulationStepDynamicLayerTimeline(prepared,animation,null)[1].faceOrders,[]);
});

test('source IDs only serialize a relation and cannot decide which sheet is visible',()=>{
  const positive=overlapFixture([.1,.1,.1,0,0,0]),negative=overlapFixture([-.1,-.1,-.1,0,0,0]);
  assert.deepEqual(buildSimulationStepDynamicLayerTimeline(positive.prepared,positive.animation,null)[1].faceOrders,[[0,1,-1]]);
  assert.deepEqual(buildSimulationStepDynamicLayerTimeline(negative.prepared,negative.animation,null)[1].faceOrders,[[0,1,1]]);
});
