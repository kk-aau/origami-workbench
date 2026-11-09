import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {closedTubePreset,closedTubeSavedEllipsePreset,closedTubeSavedTiltedPreset,readClosedTubeParams} from '../../src/app/closedTubeParams';
import {canAdoptTess,prepareTessResult,readTessParams,tessConstructionKey,tessPreset} from '../../src/app/tessellation';

test('original closed square tube preset survives project parameter restoration',()=>{
  const preset=closedTubePreset();
  assert.deepEqual(readClosedTubeParams(preset),preset);
  assert.deepEqual(readTessParams(preset),preset);
  assert.deepEqual(tessPreset('closed-twist-topped-tube'),preset);
  assert.equal(tessConstructionKey(preset),JSON.stringify(preset));
});

test('closed tube reader rejects a degenerate normal, duplicate points and unsupported paper',()=>{
  const preset=closedTubePreset();
  assert.equal(readClosedTubeParams({...preset,twistNormal:[1,0,0]}),null);
  assert.equal(readClosedTubeParams({...preset,points:[[1,1],[1,1],[-1,-1]]}),null);
  assert.equal(readClosedTubeParams({...preset,paper:{shape:'square',margin:.1}}),null);
  assert.equal(readClosedTubeParams({...preset,typeMinimumAngleDeg:90,typeMaximumAngleDeg:89}),null);
});

test('In[3567] fixed tilted cap restores exactly and passes the real backend adoption gate',()=>{
  const params=closedTubeSavedTiltedPreset();
  assert.deepEqual(params.points,[[1,1],[-1,1],[-1,-1],[1,-1]]);
  assert.deepEqual(params.convergencePoint,[.4,0,.2]);
  assert.deepEqual(params.twistNormal,[-.2,-.3,1]);
  assert.equal(params.twistDirection,'CW');
  assert.equal(params.panelOverlap,false);
  assert.equal(params.twistExtension,0);
  assert.equal(params.tubeHeight,1);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  const python=path.resolve('.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  const run=spawnSync(python,[path.resolve('backend/tessellate.py')],{
    input:JSON.stringify(params),encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:16*1024*1024,
    env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
  });
  assert.equal(run.status,0,run.stderr);
  const result=JSON.parse(run.stdout);
  assert.deepEqual([result.stats.vertices,result.stats.edges,result.stats.faces],[19,30,12]);
  assert.equal(result.stats.checks.geometry.status,'passed');
  assert.equal(result.source.staticGlobalIsometryChecked,true);
  assert.ok(result.source.maximumFaceDistanceError<1e-9);
  assert.ok(result.source.maximumIntermediateEquationResidual<1e-9);
  assert.deepEqual(result.source.twistPlaneHeights.map((height:number)=>+height.toFixed(10)),[.5,.1,-.5,-.1]);
  assert.equal(result.source.continuousRigidPathChecked,false);
  assert.equal(result.source.selfCollisionChecked,false);
  const prepared=prepareTessResult(result,params);
  assert.equal(prepared.doc.segments.length,30);
  assert.equal(canAdoptTess(prepared,false,tessConstructionKey(params),params),true);
});

test('In[3568]/In[3569] saved equal-chord ellipse survives project readback and static isometry gate',()=>{
  const a=(1+Math.sqrt(5))/2;
  const positive=closedTubeSavedEllipsePreset(.2);
  assert.equal(positive.points.length,16);
  assert.deepEqual(positive.convergencePoint,[0,0,0]);
  assert.deepEqual(positive.twistNormal,[0,0,1]);
  assert.equal(positive.panelOverlap,true);
  assert.equal(positive.typeMinimumAngleDeg,45);
  const lengths=positive.points.map(([x,y],j)=>{
    assert.ok(Math.abs(x*x/(a*a)+y*y-1)<1e-12);
    const next=positive.points[(j+1)%16];
    return Math.hypot(x-next[0],y-next[1]);
  });
  assert.ok(Math.max(...lengths)-Math.min(...lengths)<1e-12);
  assert.ok(Math.abs(lengths[0]-.5169451124921098)<1e-12);
  const python=path.resolve('.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  for(const extension of [.2,-.1] as const){
    const params=closedTubeSavedEllipsePreset(extension);
    assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
    const run=spawnSync(python,[path.resolve('backend/tessellate.py')],{
      input:JSON.stringify(params),encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:16*1024*1024,
      env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
    });
    assert.equal(run.status,0,run.stderr);
    const result=JSON.parse(run.stdout);
    assert.deepEqual([result.stats.vertices,result.stats.edges,result.stats.faces],[71,121,51]);
    assert.equal(result.stats.checks.geometry.status,'passed');
    assert.equal(result.stats.checks.local.status,'not_applicable');
    assert.equal(result.stats.checks.layerOrder.status,'not_checked');
    assert.equal(result.source.staticGlobalIsometryChecked,true);
    assert.ok(result.source.maximumFaceDistanceError<1e-9);
    assert.ok(result.source.maximumIntermediateEquationResidual<1e-9);
    assert.equal(result.source.continuousRigidPathChecked,false);
    assert.equal(result.source.selfCollisionChecked,false);
    const prepared=prepareTessResult(result,params);
    assert.equal(prepared.doc.segments.length,121);
    assert.ok(prepared.doc.segments.every(segment=>
      segment.assignment!=='M'||segment.angle===null||segment.angle<=0));
    assert.ok(prepared.doc.segments.every(segment=>
      segment.assignment!=='V'||segment.angle===null||segment.angle>=0));
    assert.equal(canAdoptTess(prepared,false,tessConstructionKey(params),params),true);
  }
});
