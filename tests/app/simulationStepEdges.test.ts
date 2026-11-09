import test from 'node:test';
import assert from 'node:assert/strict';
import {simulationStepDisplayAssignments} from '../../src/engine/simStepEdges';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import type {CameraUniforms} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import type {FoldAssignment} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {SimulationStepMotion} from '../../src/engine/simStepPath';

const camera:CameraUniforms={center:[0,0,0],rotation:[1,0,0,0,1,0,0,0,1],camDist:3.2,depthRange:2,scale:30,width:100,height:100};
const model=(assignment:FoldAssignment='V',sameSource=false)=>({edgesAssignment:['B','B','B','B',assignment] as FoldAssignment[],edgesFaces:[[0],[0],[1],[1],[0,1]],facesVertices:[[0,1,2],[1,0,3]],triangleSourceFaces:sameSource?[0,0]:[0,1]});
const positions=(degrees=0)=>new Float32Array([-1,0,0,1,0,0,0,1,0,0,-Math.cos(degrees*Math.PI/180),Math.sin(degrees*Math.PI/180)]);
const clip=(fromAngle=0,toAngle=180,viaAngle?:number)=>({ranges:[{edge:4,fromAngle,toAngle,...(viaAngle===undefined?{}:{viaAngle})}]});

test('new MV creases are hidden initially and appear as soon as playback starts',()=>{
  for(const assignment of ['M','V'] as const){
    const prepared=model(assignment),animation=clip(0,assignment==='M'?-180:180);
    assert.deepEqual(simulationStepDisplayAssignments(prepared,animation,positions(),camera,0),['B','B','B','B','F']);
    assert.equal(simulationStepDisplayAssignments(prepared,animation,positions(20),camera,.001)[4],assignment);
    assert.equal(simulationStepDisplayAssignments(prepared,animation,positions(),camera,0)[4],'F','seeking back to the exact start hides this step’s new crease again');
  }
});

test('old folded creases and flat existing creases remain visible at the beginning',()=>{
  assert.equal(simulationStepDisplayAssignments(model('M'),clip(-180,-180),positions(),camera,0)[4],'M');
  assert.equal(simulationStepDisplayAssignments(model('V'),clip(0,0),positions(),camera,0)[4],'V');
  assert.equal(simulationStepDisplayAssignments(model('F'),clip(0,0),positions(),camera,0)[4],'V','a source CP F edge is a genuine existing crease');
});

test('recorded numerical playback keeps delayed new creases hidden until their requested start',()=>{
  const animation={...clip(),timings:[{edge:4,start:.8,end:1}]};
  for(const progress of [.25,.8,.99,.25])assert.equal(simulationStepDisplayAssignments(model(),animation,positions(20),camera,progress)[4],progress<=.8?'F':'V');
});

test('precrease strokes remain after returning flat and disappear only when rewound to the initial frame',()=>{
  for(const sign of [1,-1]){
    const prepared=model('F'),animation=clip(0,0,sign*180);
    assert.equal(simulationStepDisplayAssignments(prepared,animation,positions(),camera,0)[4],'F');
    assert.equal(simulationStepDisplayAssignments(prepared,animation,positions(40),camera,.25)[4],sign>0?'V':'M');
    assert.equal(simulationStepDisplayAssignments(prepared,animation,positions(),camera,1)[4],sign>0?'V':'M');
    assert.equal(simulationStepDisplayAssignments(prepared,animation,positions(),camera,0)[4],'F');
  }
});

test('a folded hinge uses the boundary role only from views where adjacent faces oppose',()=>{
  const prepared=model(),animation=clip(0,180),folded=positions(120);
  assert.equal(simulationStepDisplayAssignments(prepared,animation,folded,camera,.8)[4],'B');
  const side={...camera,rotation:[1,0,0,0,0,1,0,1,0] as const};
  assert.equal(simulationStepDisplayAssignments(prepared,animation,folded,side,.8)[4],'V');
  assert.equal(simulationStepDisplayAssignments(prepared,animation,folded,camera,0)[4],'F','initial hiding overrides silhouette classification');
});

test('silhouette classification uses the perspective viewpoint rather than an orthographic direction',()=>{
  const folded=positions(45),animation=clip(0,180),prepared=model();
  assert.equal(simulationStepDisplayAssignments(prepared,animation,folded,camera,.25)[4],'V');
  const shifted={...camera,center:[0,-10,0] as [number,number,number]};
  assert.equal(simulationStepDisplayAssignments(prepared,animation,folded,shifted,.25)[4],'B');
});

test('generated F diagonals are suppressed even when they look like folded silhouettes',()=>{
  const prepared=model('F',true),animation=clip(0,0);
  assert.equal(simulationStepDisplayAssignments(prepared,animation,positions(120),camera,1)[4],'F');
  const square={vertices_coords:[[0,0],[1,0],[1,1],[0,1]],edges_vertices:[[0,1],[1,2],[2,3],[3,0]],edges_assignment:['B','B','B','B'],faces_vertices:[[0,1,2,3]]};
  const {prepared:actual}=prepareSimulationDocument(square),assignments=simulationStepDisplayAssignments(actual,{ranges:actual.creaseParams.map(c=>({edge:c.edge,fromAngle:0,toAngle:0}))},actual.positions,camera,1);
  assert.ok(actual.edgesAssignment.includes('F'),'the actual preparer inserted a triangulation edge');
  assert.deepEqual(assignments,actual.edgesAssignment);
});

test('edge-role calculation never changes material positions, source assignments, animation or topology',()=>{
  const prepared=model('V'),animation=clip(0,180),folded=positions(120),source=structuredClone({prepared,animation,folded});
  const visible=simulationStepDisplayAssignments(prepared,animation,folded,camera,.8);
  assert.notEqual(visible,prepared.edgesAssignment);assert.equal(visible[4],'B');
  assert.deepEqual({prepared,animation,folded},source);
  visible[0]='F';assert.equal(prepared.edgesAssignment[0],'B');
});

test('edge-on and degenerate triangles do not manufacture a silhouette',()=>{
  const prepared=model(),animation=clip(0,180),edgeOn={...camera,rotation:[1,0,0,0,0,1,0,1,0] as const};
  assert.equal(simulationStepDisplayAssignments(prepared,animation,positions(),edgeOn,.5)[4],'V');
  const collapsed=positions();collapsed.set(collapsed.slice(0,3),2*3);
  assert.equal(simulationStepDisplayAssignments(prepared,animation,collapsed,camera,.5)[4],'V');
});

test('batched precreases stay hidden until their own action and retain strokes after their own unfold',()=>{
  const prepared={...model('F'),edgesAssignment:['B','B','B','B','F','F'] as FoldAssignment[],edgesFaces:[[0],[0],[1],[1],[0,1],[0,1]],creaseParams:[{edge:4},{edge:5}]};
  const phases:SimulationStepMotion['phases']=[
    {start:0,end:.25,kind:'linear',fromAngles:[0,0],toAngles:[180,0]},
    {start:.25,end:.5,kind:'linear',fromAngles:[180,0],toAngles:[0,0]},
    {start:.5,end:.75,kind:'linear',fromAngles:[0,0],toAngles:[0,-180]},
    {start:.75,end:1,kind:'linear',fromAngles:[0,-180],toAngles:[0,0]},
  ];
  const motion:SimulationStepMotion={version:1,method:'sequential',phases,knots:[{progress:0,angles:[0,0]},{progress:1,angles:[0,0]}],maxClosureResidual:0};
  // Serialized range order is intentionally different. Phases always follow
  // the real prepared crease list, never the drawing or object-list order.
  const animation={ranges:[{edge:5,fromAngle:0,toAngle:0,viaAngle:-180},{edge:4,fromAngle:0,toAngle:0,viaAngle:180}],motion};
  const ink=(progress:number)=>simulationStepDisplayAssignments(prepared,animation,positions(),camera,progress).slice(4);
  assert.deepEqual(ink(0),['F','F']);assert.deepEqual(ink(.1),['V','F']);assert.deepEqual(ink(.25),['V','F']);
  assert.deepEqual(ink(.5),['V','F'],'the second crease does not appear merely because a different batch has completed');
  assert.deepEqual(ink(.50001),['V','M']);assert.deepEqual(ink(.75),['V','M']);assert.deepEqual(ink(1),['V','M']);
  assert.deepEqual(ink(.1),['V','F'],'reverse seeking hides later batches deterministically');assert.deepEqual(ink(0),['F','F']);
});

test('a deferred ordinary fold stays hidden through a wait while original and finished creases remain visible',()=>{
  const prepared={...model('V'),creaseParams:[{edge:4}]},motion:SimulationStepMotion={version:1,method:'sequential',maxClosureResidual:0,
    phases:[{start:0,end:.6,kind:'linear',fromAngles:[0],toAngles:[0]},{start:.6,end:1,kind:'linear',fromAngles:[0],toAngles:[180]}],
    knots:[{progress:0,angles:[0]},{progress:.6,angles:[0]},{progress:1,angles:[180]}]};
  const animation={...clip(),motion};
  for(const p of [0,.1,.59,.6])assert.equal(simulationStepDisplayAssignments(prepared,animation,positions(),camera,p)[4],'F');
  for(const p of [.60001,.8,1])assert.equal(simulationStepDisplayAssignments(prepared,animation,positions(),camera,p)[4],'V');
  const old={ranges:[{edge:4,fromAngle:180,toAngle:180}],motion:{...motion,phases:motion.phases.map(phase=>({...phase,fromAngles:[180],toAngles:[180]}))}};
  assert.equal(simulationStepDisplayAssignments(prepared,old,positions(),camera,0)[4],'V','an old crease requires no new action to stay visible');
});
