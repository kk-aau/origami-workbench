import {test} from 'node:test';
import assert from 'node:assert/strict';
import {primalDualIn3354Params} from '../../src/app/primalDualIn3354';
import {readTessParams} from '../../src/app/tessellation';

test('In[3354] button parameters strictly round-trip without default paper or stale edits',()=>{
  const params=primalDualIn3354Params();
  assert.equal(params.rings,0);
  assert.equal(params.tiling,'square');
  assert.equal(params.parameterization,'gamma-alpha');
  assert.equal(params.gamma,2);
  assert.equal(params.pleatAngle,20);
  assert.equal(params.twistDirection,'ccw');
  assert.equal(params.postRotation,'primal');
  assert.equal(params.faceupFace,3);
  assert.equal(params.visibleTopFace,undefined);
  assert.equal(params.paper,undefined);
  assert.equal(params.pruneBoundary,undefined);
  assert.equal(params.dualEdgeFlips,undefined);
  assert.equal(params.dualTargets,undefined);
  assert.ok(params.motherParams?.family==='custom');
  assert.deepEqual(params.motherParams.vertices,
    [[0,0],[2,0],[4,0],[0,2],[2,2],[4,2],[0,4],[2,4],[4,4]]);
  assert.deepEqual(params.motherParams.faces,
    [[0,1,4,3],[1,2,5,4],[3,4,7,6],[4,5,8,7]]);
  assert.equal(params.motherParams.repeatX,1);
  assert.equal(params.motherParams.repeatY,1);
  assert.equal(params.motherParams.paper,undefined);
  assert.ok(Math.abs(params.scale-.7925482672068609)<1e-12);
  assert.ok(Math.abs(params.angle-21.862218721594214)<1e-12);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  params.motherParams.vertices[0][0]=1;
  const again=primalDualIn3354Params();
  assert.ok(again.motherParams?.family==='custom');
  assert.equal(again.motherParams.vertices[0][0],0);
});
