import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {exportDocument,importDocument} from '../../src/core/formats';
import {moselyBudCrossSectionPoint,moselyBudSavedSection,moselyBudSavedParams,matchMoselyBudSaved} from '../../src/app/radialPotMoselyBudSaved';
import {radialPotPreset,readRadialPotParams} from '../../src/app/radialPotParams';
import {canAdoptTess,prepareTessResult,readTessParams,tessConstructionKey,type TessResponse} from '../../src/app/tessellation';
import {spatialMeshScene} from '../../src/app/spatialMeshView';

const python=(code:string,input?:unknown)=>{
  const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',code],{
    input:input===undefined?undefined:JSON.stringify(input),encoding:'utf8',windowsHide:true,
    timeout:30000,env:{...process.env,OPENBLAS_NUM_THREADS:'1'}});
  assert.equal(run.status,0,run.stderr);
  return JSON.parse(run.stdout) as unknown;
};

test('In[3456] real branch matches independent backend and source anchors',()=>{
  const section=moselyBudSavedSection();
  const backend=python("import sys,json;sys.path.insert(0,'backend');from tessellation_mosely_bud import saved_mosely_bud_section;print(json.dumps(saved_mosely_bud_section()))") as [number,number][];
  assert.equal(section.length,21);
  for(let i=0;i<21;i++)for(let j=0;j<2;j++)
    assert.ok(Math.abs(section[i][j]-backend[i][j])<2e-11,`${i}/${j}: ${section[i][j]} vs ${backend[i][j]}`);
  assert.ok(Math.abs(moselyBudCrossSectionPoint(.5)[1]-.4236065423969895)<2e-11);
  assert.ok(Math.abs(moselyBudCrossSectionPoint(1)[1]-.8472130847939791)<2e-11);
  assert.throws(()=>moselyBudCrossSectionPoint(-.01));
  assert.throws(()=>moselyBudCrossSectionPoint(Number.NaN));
  for(const cell of [3481,3482] as const){
    const params=moselyBudSavedParams(cell);
    assert.equal(matchMoselyBudSaved(params),cell);
    assert.equal(params.asymmetry,cell===3481?0:.3333);
    assert.equal(params.border,'planar');
    assert.equal(params.typeMinimumAngleDeg,30);
    assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  }
  assert.equal(matchMoselyBudSaved({...moselyBudSavedParams(3481),typeMinimumAngleDeg:25}),null);
  assert.deepEqual(readRadialPotParams(radialPotPreset()),radialPotPreset());
  assert.ok(readRadialPotParams({...moselyBudSavedParams(3481),crossSection:section.slice(0,12)}));
  assert.equal(readRadialPotParams({...moselyBudSavedParams(3481),crossSection:[...section,...section.slice(0,4)]}),null);
});

test('both saved Buds pass real static spatial gate and native project readback',()=>{
  for(const cell of [3481,3482] as const){
    const params=moselyBudSavedParams(cell);
    const response=python("import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps(generate(json.load(sys.stdin))))",params) as TessResponse;
    assert.deepEqual([response.stats.vertices,response.stats.edges,response.stats.faces],[393,792,400]);
    assert.equal(response.stats.checks.geometry.status,'passed');
    assert.equal(response.source.staticGlobalIsometryChecked,true);
    assert.equal(response.source.continuousRigidPathChecked,false);
    assert.equal(response.source.selfCollisionChecked,false);
    assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(response.stats.parameters))),params);
    const result=prepareTessResult(response,params),scene=spatialMeshScene(result);
    assert.ok(scene);
    assert.deepEqual([scene.vertices.length,scene.edges.length,scene.faces.length],[393,792,400]);
    assert.equal(canAdoptTess(result,false,tessConstructionKey(params),params),true);
    const restored=importDocument(exportDocument(result.doc,'json').text,'json').doc;
    const metadata=restored.metadata?.tessellation as {parameters:unknown;source:Record<string,unknown>};
    const restoredParams=readTessParams(metadata.parameters);
    assert.deepEqual(restoredParams,params);
    assert.equal(matchMoselyBudSaved(restoredParams!),cell);
    assert.equal(restored.segments.length,result.doc.segments.length);
    assert.ok(spatialMeshScene({fold:response.fold,source:metadata.source}));
    const tampered=structuredClone(response);
    (tampered.source.foldedForm3D as [number,number,number][])[20][2]+=.1;
    assert.equal(spatialMeshScene({fold:tampered.fold,source:tampered.source}),null);
  }
});
