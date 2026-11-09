import test from 'node:test';
import assert from 'node:assert/strict';
import {primalDualIn3386Params} from '../../src/app/primalDualIn3386';
import {readTessParams,tessConstructionKey,tessPreset} from '../../src/app/tessellation';
import {shrinkAndTwist} from '../../src/app/primalDualParams';

test('In[3386] fixes the complete saved input, clearing inherited paper and edits',()=>{
  const p=primalDualIn3386Params();
  assert.equal(p.family,'primal-dual');
  assert.deepEqual(p.motherParams,{...tessPreset('ring'),sides:11,rings:2,
    radii:[1,2,4],includeCenter:false});
  assert.equal(p.rings,0);
  assert.equal(p.parameterization,'gamma-alpha');
  assert.equal(p.gamma,2);
  assert.equal(p.pleatAngle,20);
  assert.equal(p.twistDirection,'cw');
  assert.equal(p.postRotation,'none');
  assert.equal(p.faceupFace,1);
  for(const key of ['paper','pruneBoundary','dualTargets','dualEdgeFlips',
    'visibleTopFace'] as const)assert.equal(p[key],undefined);
  const converted=shrinkAndTwist(2,20,'cw');
  assert.ok(Math.abs(p.angle-converted.angle)<1e-12);
  assert.ok(Math.abs(p.scale-converted.scale)<1e-12);
});

test('In[3386] parameter contract survives strict project readback',()=>{
  const p=primalDualIn3386Params();
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(p))),p);
  assert.equal(tessConstructionKey(readTessParams(JSON.parse(JSON.stringify(p)))!),
    tessConstructionKey(p));
});
