import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SIMULATION_VIEW,simulationCameraAngles,simulationViewCubeFaces,orbitSimulationView} from '../../src/engine/simViewCube';

test('the direction cube uses the same six front/back/left/right/up/down camera directions as the model',()=>{
  for(const name of ['front','back','left','right','top','bottom'] as const){
    const [yaw,pitch]=simulationCameraAngles[name],faces=simulationViewCubeFaces({yaw,pitch}),visible=faces.filter(f=>f.visible);
    assert.deepEqual(visible.map(f=>f.preset),[name]);
    assert.ok(Math.abs(visible[0].cx-52)<1e-10&&Math.abs(visible[0].cy-51)<1e-10);
  }
});

test('isometric direction cube exposes three coherent faces and repeats after full rotations',()=>{
  const [yaw,pitch]=simulationCameraAngles.isometric,initial=simulationViewCubeFaces({yaw,pitch});
  assert.equal(initial.filter(f=>f.visible).length,3);
  const rotated=simulationViewCubeFaces({yaw:yaw+Math.PI*8,pitch:pitch-Math.PI*14});
  for(const face of initial){const match=rotated.find(f=>f.preset===face.preset)!;assert.equal(match.visible,face.visible);face.points.forEach((p,i)=>p.forEach((n,k)=>assert.ok(Math.abs(n-match.points[i][k])<1e-10)));}
});

test('opening and resetting the 3D view use the requested front-bottom view with a narrow right face',()=>{
  assert.deepEqual([DEFAULT_SIMULATION_VIEW.yaw,DEFAULT_SIMULATION_VIEW.pitch],simulationCameraAngles.isometric);
  const visible=simulationViewCubeFaces(DEFAULT_SIMULATION_VIEW).filter(face=>face.visible);
  assert.deepEqual(new Set(visible.map(face=>face.preset)),new Set(['front','bottom','right']));
  const front=visible.find(face=>face.preset==='front')!,bottom=visible.find(face=>face.preset==='bottom')!,right=visible.find(face=>face.preset==='right')!;
  assert.ok(front.depth>bottom.depth&&bottom.depth>right.depth);
  assert.ok(right.depth<front.depth*.2,'the right side stays a narrow strip rather than a diagonal side view');
  assert.ok(front.cy<bottom.cy&&right.cx>front.cx,'front label stays upright above the bottom, with right on screen-right');
  const topLeft=front.points[3],topRight=front.points[2];
  assert.ok(topRight[0]-topLeft[0]>40&&topRight[1]-topLeft[1]>0&&topRight[1]-topLeft[1]<7,'the broad front edge tilts only slightly clockwise');
});

test('orbiting can continuously pass both former pitch limits and reverse without a clamped dead zone',()=>{
  const start={yaw:0,pitch:0};let view=start;
  for(let i=0;i<20;i++)view=orbitSimulationView(view,150,200);
  assert.ok(view.pitch>8*Math.PI);assert.ok(view.yaw>6*Math.PI);
  for(let i=0;i<40;i++)view=orbitSimulationView(view,-150,-200);
  assert.ok(view.pitch< -8*Math.PI);assert.ok(view.yaw< -6*Math.PI);
  const next=orbitSimulationView(view,0,1);assert.ok(Math.abs(next.pitch-view.pitch-.007)<1e-14);
});
