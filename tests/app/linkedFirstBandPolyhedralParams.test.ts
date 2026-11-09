import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {linkedFirstBandPolyhedralPreset} from '../../src/app/linkedFirstBandPolyhedralParams';
import {canAdoptTess,prepareTessResult,readTessParams} from '../../src/app/tessellation';
import {spatialMeshScene} from '../../src/app/spatialMeshView';

test('saved linked first-band finite companion parameters are bounded',()=>{
  const preset=linkedFirstBandPolyhedralPreset();
  assert.deepEqual(readTessParams(structuredClone(preset)),preset);
  assert.deepEqual(readTessParams({...preset,curveSegments:96,minimumAngleDeg:0}),
    {...preset,curveSegments:96,minimumAngleDeg:0});
  for(const bad of [{...preset,curveSegments:7},{...preset,curveSegments:97},
    {...preset,curveSegments:20.5},{...preset,minimumAngleDeg:Infinity},
    {...preset,variant:'zero-chain'}])assert.equal(readTessParams(bad),null);
});

test('real saved first-band candidate has an independently checked 3D mesh on the same canvas',()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  const params=linkedFirstBandPolyhedralPreset();
  const run=spawnSync(python,[path.join(root,'backend/tessellate.py')],{
    cwd:root,input:JSON.stringify(params),encoding:'utf8',windowsHide:true,timeout:30000,
    env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
  });
  assert.equal(run.status,0,run.stderr||String(run.error));
  const response=JSON.parse(run.stdout);
  assert.equal(response.stats.checks.geometry.status,'passed');
  assert.equal(response.source.originalSavedCell,'In[4086]');
  assert.equal(response.source.originalSmoothSurfaceExact,false);
  assert.equal(response.source.exactPolyhedralFacetIsometry,true);
  assert.equal(response.source.wholeSavedPerturbedChainCertified,false);
  const result=prepareTessResult(response,params);
  const scene=spatialMeshScene(result);
  assert.ok(scene);
  assert.equal(scene.vertices.length,66);
  assert.equal(scene.faces.length,64);
  assert.ok(scene.maximumFaceDistanceError<1e-12);
  assert.equal(canAdoptTess(result,false,JSON.stringify(params),params),true);
  const altered=structuredClone(response);
  altered.source.foldedForm3D[1][0]+=.01;
  assert.equal(spatialMeshScene(prepareTessResult(altered,params)),null);
});
