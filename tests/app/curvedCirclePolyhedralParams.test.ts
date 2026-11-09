import test from 'node:test';
import assert from 'node:assert/strict';
import {curvedCirclePolyhedralPreset} from '../../src/app/curvedCirclePolyhedralParams';
import {canAdoptTess,prepareTessResult,readTessParams} from '../../src/app/tessellation';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

test('In[3992] polyhedral parameters are strictly recoverable',()=>{
  const preset=curvedCirclePolyhedralPreset();
  assert.deepEqual(readTessParams(structuredClone(preset)),preset);
  const changed={...preset,curveSegments:12,foldAngleDeg:80,parameterStartPi:.25,
    parameterEndPi:.75,leftWidth:.5,rightWidth:1.5};
  assert.deepEqual(readTessParams(changed),changed);
  for(const bad of [{...preset,curveSegments:2},{...preset,foldAngleDeg:180},
    {...preset,leftWidth:2},{...preset,parameterStartPi:.995},
    {...preset,unknown:true}])assert.equal(readTessParams(bad),null);
});

test('actual In[3992] candidate has same-index exact spatial faces and can be adopted',()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  const params=curvedCirclePolyhedralPreset();
  const run=spawnSync(python,[path.join(root,'backend/tessellate.py')],{
    cwd:root,input:JSON.stringify(params),encoding:'utf8',windowsHide:true,timeout:30000,
    env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
  });
  assert.equal(run.status,0,run.stderr||String(run.error));
  const response=JSON.parse(run.stdout);
  assert.equal(response.stats.checks.geometry.status,'passed');
  assert.equal(response.source.originalSmoothSurfaceExact,false);
  assert.equal(response.source.exactPolyhedralFacetIsometry,true);
  const result=prepareTessResult(response,params);
  assert.equal(result.fold.vertices_coords.length,99);
  assert.equal(result.source.foldedForm3D.length,99);
  assert.equal(canAdoptTess(result,false,JSON.stringify(params),params),true);
});
