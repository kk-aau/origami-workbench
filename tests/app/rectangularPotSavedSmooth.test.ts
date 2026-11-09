import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {exportDocument,importDocument} from '../../src/core/formats';
import {rectangularPotSmoothSavedParams,rectangularPotSmoothSection,matchRectangularPotSmoothSaved} from '../../src/app/rectangularPotSaved';
import {readRectangularPotParams,rectangularPotPreset} from '../../src/app/rectangularPotParams';
import {canAdoptTess,prepareTessResult,readTessParams,tessConstructionKey,type TessResponse} from '../../src/app/tessellation';
import {spatialMeshScene} from '../../src/app/spatialMeshView';

const generate=(params:unknown):TessResponse=>{
  const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',
    "import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps(generate(json.load(sys.stdin))))"],
    {input:JSON.stringify(params),encoding:'utf8',windowsHide:true,timeout:30000,
      env:{...process.env,OPENBLAS_NUM_THREADS:'1'}});
  assert.equal(run.status,0,run.stderr);
  return JSON.parse(run.stdout) as TessResponse;
};

test('In[3504]/In[3505] sample all 21 source profile points and strict parameter bounds',()=>{
  const section=rectangularPotSmoothSection();
  assert.equal(section.length,21);
  for(let i=0;i<=20;i++){
    assert.ok(Math.abs(section[i][0]-.5*Math.sin(Math.PI*i/20))<1e-15);
    assert.ok(Math.abs(section[i][1]-(Math.cos(Math.PI*i/20)-1))<1e-15);
  }
  assert.deepEqual([section[0][1],section[10][0],section[20][1]],[0,.5,-2]);
  const saved=rectangularPotSmoothSavedParams(3504);
  assert.equal(matchRectangularPotSmoothSaved(saved),3504);
  assert.equal(matchRectangularPotSmoothSaved(rectangularPotSmoothSavedParams(3505)),3505);
  assert.equal(matchRectangularPotSmoothSaved({...saved,flangeExcess:.4}),null);
  assert.deepEqual(readRectangularPotParams({...saved,crossSection:section.slice(0,12)})?.crossSection,section.slice(0,12));
  assert.equal(readRectangularPotParams({...saved,crossSection:[...section,...section.slice(0,4)]}),null);
  assert.ok(readRectangularPotParams({...saved,crossSection:Array.from({length:24},(_,i)=>[.5*Math.sin(Math.PI*i/23),Math.cos(Math.PI*i/23)-1] as [number,number])}));
  assert.equal(readRectangularPotParams({...saved,panels:7,sectors:7}),null);
  assert.deepEqual(readRectangularPotParams(rectangularPotPreset()),rectangularPotPreset());
});

test('both smooth saved pots pass real backend, spatial adoption and native project readback',()=>{
  for(const cell of [3504,3505] as const){
    const params=rectangularPotSmoothSavedParams(cell),response=generate(params);
    assert.deepEqual([response.stats.vertices,response.stats.edges,response.stats.faces],[425,824,400]);
    assert.equal(response.stats.checks.geometry.status,'passed');
    assert.equal(response.source.staticGlobalIsometryChecked,true);
    assert.equal(response.source.continuousRigidPathChecked,false);
    assert.equal(response.source.selfCollisionChecked,false);
    assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(response.stats.parameters))),params);
    const result=prepareTessResult(response,params),scene=spatialMeshScene(result);
    assert.ok(scene);
    assert.deepEqual([scene.vertices.length,scene.edges.length,scene.faces.length],[425,824,400]);
    assert.ok(canAdoptTess(result,false,tessConstructionKey(params),params));
    const native=exportDocument(result.doc,'json');
    const restored=importDocument(native.text,'json').doc;
    const restoredParams=readTessParams((restored.metadata?.tessellation as {parameters:unknown}).parameters);
    assert.deepEqual(restoredParams,params);
    assert.equal(matchRectangularPotSmoothSaved(restoredParams!),cell);
    assert.equal(restored.segments.length,result.doc.segments.length);
    assert.ok(spatialMeshScene({fold:response.fold,source:(restored.metadata?.tessellation as {source:Record<string,unknown>}).source}));
    const tampered=structuredClone(response);
    const coords=(tampered.source.foldedForm3D as [number,number,number][]);
    coords[20][2]+=0.1;
    assert.equal(spatialMeshScene({fold:tampered.fold,source:tampered.source}),null);
  }
});
