import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {joinedTubePreset,joinedTubeSavedEllipsePreset,joinedTubeSavedOffsetCirclePreset,joinedTubeSavedPleatedPentagonPreset,joinedTubeSavedRectanglesPreset,joinedTubeSavedTiltedCirclePreset,pleatReducePolygon,readJoinedTubeParams,rotateTubePoints,type TwistJoinedTubeParams} from '../../src/app/joinedTubeParams';
import {readTessParams} from '../../src/app/tessellation';

function generateSavedTube(params:TwistJoinedTubeParams){
  const python=path.resolve('.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  const run=spawnSync(python,[path.resolve('backend/tessellate.py')],{
    input:JSON.stringify(params),encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:16*1024*1024,
    env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
  });
  assert.equal(run.status,0,run.stderr);
  return JSON.parse(run.stdout);
}

test('original twisted square and pleat-reduced double tube presets round-trip',()=>{
  for(const family of ['twist-joined-tube','double-joined-tube'] as const){
    const preset=joinedTubePreset(family);
    assert.deepEqual(readJoinedTubeParams(preset),preset);
    assert.equal(preset.bottomPoints.length,4);
    assert.equal(preset.topPoints.length,family==='twist-joined-tube'?4:8);
  }
});

test('In[3584]/In[3585] default 30° square tube keeps both original directions',()=>{
  const preset=joinedTubePreset('twist-joined-tube') as TwistJoinedTubeParams;
  assert.deepEqual(preset.bottomPoints,[[1,1],[-1,1],[-1,-1],[1,-1]]);
  assert.deepEqual(preset.topPoints,rotateTubePoints(preset.bottomPoints,30));
  assert.equal(preset.verticalOffset,1);
  assert.equal(preset.panelOverlap,true);
  for(const twistDirection of ['CCW','CW'] as const){
    const params={...preset,twistDirection};
    assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
    const result=generateSavedTube(params);
    assert.equal(result.stats.checks.geometry.status,'passed');
    assert.equal(result.source.staticGlobalIsometryChecked,true);
    assert.ok(result.source.maximumFaceDistanceError<1e-9);
  }
});

test('PleatReducePolygon follows the original first vertex and perimeter',()=>{
  const bottom=joinedTubePreset('double-joined-tube').bottomPoints;
  const top=pleatReducePolygon(bottom,.5);
  assert.deepEqual(top[0],[.75,.25]);
  assert.deepEqual(top[1],[.5,0]);
  const length=(points:[number,number][])=>points.reduce((sum,p,i)=>sum+Math.hypot(p[0]-points[(i+1)%points.length][0],p[1]-points[(i+1)%points.length][1]),0);
  assert.ok(Math.abs(length(top)-length(bottom))<1e-12);
  assert.ok(Math.abs(length(rotateTubePoints(top,45))-length(bottom))<1e-12);
});

test('tube parameter reader refuses paper, topology and perimeter changes',()=>{
  const preset=joinedTubePreset('twist-joined-tube');
  assert.equal(readJoinedTubeParams({...preset,paper:{shape:'square',margin:.1}}),null);
  assert.equal(readJoinedTubeParams({...preset,topPoints:preset.topPoints.slice(1)}),null);
  assert.equal(readJoinedTubeParams({...preset,topPoints:preset.topPoints.map(([x,y])=>[2*x,2*y])}),null);
  assert.equal(readJoinedTubeParams({...preset,tiltAzimuthalAngleDeg:90}),null);
  const doubled=joinedTubePreset('double-joined-tube');
  assert.equal(readJoinedTubeParams({...doubled,topPoints:doubled.topPoints.slice(1)}),null);
});

test('In[3587] equal-chord ellipse has its saved 24-point ring, rotated top and verified spatial net',()=>{
  const preset=joinedTubeSavedEllipsePreset();
  const a=(1+Math.sqrt(5))/2;
  assert.equal(preset.bottomPoints.length,24);
  assert.equal(preset.topPoints.length,24);
  assert.equal(preset.verticalOffset,.2);
  assert.equal(preset.panelOverlap,true);
  assert.deepEqual(preset.bottomPoints[0],[a,0]);
  const lengths=preset.bottomPoints.map(([x,y],i)=>{
    const next=preset.bottomPoints[(i+1)%24];
    assert.ok(Math.abs(x*x/(a*a)+y*y-1)<1e-12);
    assert.ok(Math.hypot(preset.topPoints[i][0]+preset.bottomPoints[(i+3)%24][1],
      preset.topPoints[i][1]-preset.bottomPoints[(i+3)%24][0])<1e-12);
    return Math.hypot(x-next[0],y-next[1]);
  });
  assert.ok(Math.max(...lengths)-Math.min(...lengths)<1e-12);
  assert.ok(Math.abs(lengths[0]-.346217849171274)<1e-12);
  const parsed=readTessParams(JSON.parse(JSON.stringify(preset)));
  assert.deepEqual(parsed,preset);
  assert.equal(readTessParams({...preset,topPoints:preset.topPoints.map(([x,y])=>[x*1.001,y*1.001])}),null);

  const result=generateSavedTube(parsed as TwistJoinedTubeParams);
  assert.deepEqual([result.stats.vertices,result.stats.edges,result.stats.faces],[104,203,100]);
  assert.equal(result.stats.checks.geometry.status,'passed');
  assert.equal(result.stats.checks.local.status,'not_applicable');
  assert.equal(result.stats.checks.layerOrder.status,'not_checked');
  assert.equal(result.source.staticGlobalIsometryChecked,true);
  assert.ok(result.source.maximumFaceDistanceError<1e-9);
  assert.ok(result.source.maximumEquationResidual<1e-8);
  assert.equal(result.source.continuousRigidPathChecked,false);
  assert.equal(result.source.selfCollisionChecked,false);
});

test('In[3590]/In[3591] saved pleated pentagon rings preserve perimeter and both static nets',()=>{
  const preset=joinedTubeSavedPleatedPentagonPreset();
  const last:[number,number]=[Math.cos(8*Math.PI/5),Math.sin(8*Math.PI/5)];
  const expectedFirst:[number,number]=[.9-.1*last[0],-.1*last[1]];
  assert.equal(preset.bottomPoints.length,10);
  assert.equal(preset.topPoints.length,10);
  assert.equal(preset.verticalOffset,.5);
  assert.equal(preset.twistDirection,'CCW');
  assert.equal(preset.panelOverlap,true);
  assert.ok(Math.hypot(preset.bottomPoints[0][0]-expectedFirst[0],
    preset.bottomPoints[0][1]-expectedFirst[1])<1e-12);
  const length=(ring:[number,number][])=>ring.reduce((sum,p,i)=>
    sum+Math.hypot(p[0]-ring[(i+1)%ring.length][0],p[1]-ring[(i+1)%ring.length][1]),0);
  assert.ok(Math.abs(length(preset.bottomPoints)-length(preset.topPoints))<1e-12);
  assert.ok(Math.abs(length(preset.bottomPoints)-5*2*Math.sin(Math.PI/5))<1e-12);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(preset))),preset);
  for(const twistDirection of ['CCW','CW'] as const){
    const result=generateSavedTube({...preset,twistDirection});
    assert.deepEqual([result.stats.vertices,result.stats.edges,result.stats.faces],[48,91,44]);
    assert.equal(result.stats.checks.geometry.status,'passed');
    assert.equal(result.stats.checks.local.status,'not_applicable');
    assert.equal(result.stats.checks.layerOrder.status,'not_checked');
    assert.equal(result.source.staticGlobalIsometryChecked,true);
    assert.ok(result.source.maximumFaceDistanceError<1e-9);
    assert.ok(result.source.maximumEquationResidual<1e-8);
    assert.equal(result.source.continuousRigidPathChecked,false);
    assert.equal(result.source.selfCollisionChecked,false);
  }
});

test('In[3588]/In[3589] rectangle pair preserves exact ring order and both spatial nets',()=>{
  for(const direction of ['CW','CCW'] as const){
    const preset=joinedTubeSavedRectanglesPreset(direction);
    assert.deepEqual(preset.bottomPoints,[[1.732,1],[-1.732,1],[-1.732,-1],[1.732,-1]]);
    assert.deepEqual(preset.topPoints,[...rotateTubePoints(preset.bottomPoints,60).slice(1),
      rotateTubePoints(preset.bottomPoints,60)[0]]);
    assert.equal(preset.verticalOffset,.95);
    assert.equal(preset.twistDirection,direction);
    assert.equal(preset.panelOverlap,true);
    assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(preset))),preset);
    const result=generateSavedTube(preset);
    assert.deepEqual([result.stats.vertices,result.stats.edges,result.stats.faces],[24,43,20]);
    assert.equal(result.stats.checks.geometry.status,'passed');
    assert.equal(result.source.staticGlobalIsometryChecked,true);
    assert.ok(result.source.maximumFaceDistanceError<1e-9);
    assert.equal(result.source.selfCollisionChecked,false);
  }
});

test('In[3586] offset 24-gon retains phase, translation and the source tangency gap',()=>{
  const preset=joinedTubeSavedOffsetCirclePreset();
  assert.equal(preset.bottomPoints.length,24);
  assert.equal(preset.topPoints.length,24);
  assert.equal(preset.verticalOffset,.32);
  assert.equal(preset.typeMinimumAngleDeg,30);
  assert.equal(preset.twistDirection,'CCW');
  assert.deepEqual(preset.bottomPoints[0],[1,0]);
  assert.ok(Math.hypot(preset.topPoints[0][0]-(.5+Math.cos(175*Math.PI/180)),
    preset.topPoints[0][1]-(.5+Math.sin(175*Math.PI/180)))<1e-12);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(preset))),preset);
  const result=generateSavedTube(preset);
  assert.equal(result.stats.checks.geometry.status,'passed');
  assert.equal(result.source.staticGlobalIsometryChecked,true);
  assert.ok(result.source.maximumFaceDistanceError<1e-9);
  assert.equal(result.source.selfCollisionChecked,false);
});

test('In[3592] tilted 12-gon keeps both source tilt angles and verified spatial net',()=>{
  const preset=joinedTubeSavedTiltedCirclePreset();
  assert.equal(preset.bottomPoints.length,12);
  assert.equal(preset.topPoints.length,12);
  assert.equal(preset.verticalOffset,.8);
  assert.equal(preset.tiltAxialAngleDeg,90);
  assert.equal(preset.tiltAzimuthalAngleDeg,15);
  assert.equal(preset.typeMinimumAngleDeg,30);
  assert.ok(Math.hypot(preset.topPoints[0][0],preset.topPoints[0][1]-1)<1e-12);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(preset))),preset);
  const result=generateSavedTube(preset);
  assert.equal(result.stats.checks.geometry.status,'passed');
  assert.equal(result.source.staticGlobalIsometryChecked,true);
  assert.ok(result.source.maximumFaceDistanceError<1e-9);
  assert.equal(result.source.selfCollisionChecked,false);
});
