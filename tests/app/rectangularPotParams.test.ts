import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readRectangularPotParams,rectangularPotPreset} from '../../src/app/rectangularPotParams';
import {canAdoptTess,prepareTessResult,readTessParams,tessConstructionKey,tessPreset,type TessResponse} from '../../src/app/tessellation';
import {spatialMeshScene} from '../../src/app/spatialMeshView';
import {projectRigidQuad} from '../../src/app/rigidQuadView';

test('original rectangular pot preset and a partial panel run restore from saved parameters',()=>{
  const preset=rectangularPotPreset();
  assert.deepEqual(tessPreset('rectangular-pot'),preset);
  assert.deepEqual(readRectangularPotParams(preset),preset);
  assert.deepEqual(readTessParams({...preset,panels:3}),{...preset,panels:3});
  assert.equal(readTessParams({...preset,paper:{shape:'square',margin:.1}}),null);
  assert.deepEqual(readRectangularPotParams({...preset,panels:6}),{...preset,panels:6});
  assert.equal(readRectangularPotParams({...preset,gapHalfAngleDeg:18}),null);
  assert.equal(readRectangularPotParams({...preset,crossSection:[[0,0],[0,0],[2,2]]}),null);
  for(const asymmetry of [-1,1]){
    assert.deepEqual(readRectangularPotParams({...preset,asymmetry,flatFlangeInset:.1}),
      {...preset,asymmetry,flatFlangeInset:.1});
  }
  assert.equal(readRectangularPotParams({...preset,flatFlangeInset:.1}),null);
  assert.equal(readRectangularPotParams({...preset,asymmetry:1,flatFlangeInset:-.1}),null);
  assert.equal(readRectangularPotParams({...preset,asymmetry:1,flatFlangeInset:.6}),null);
});

test('generated original rectangular pot enters the same-sheet static spatial canvas',()=>{
  const response=JSON.parse(readFileSync(new URL('../fixtures/constructed_rectangular_pot.json',import.meta.url),'utf8')) as TessResponse;
  const params=rectangularPotPreset(),result=prepareTessResult(response,params);
  const scene=spatialMeshScene(result);
  assert.ok(scene);
  assert.deepEqual([scene.vertices.length,scene.edges.length,scene.faces.length],[105,204,100]);
  assert.equal(canAdoptTess(result,false,tessConstructionKey(params),params),true);
  assert.ok(result.doc.segments.length>0);
  for(const back of [false,true]){
    const projection=projectRigidQuad(scene,-25,48,back,0);
    assert.equal(projection.faceOrder.length,100);
    // Coincident opposite-facing flange panels do not have a unique visible order.
    assert.equal(projection.surfaceOrderReliable,false);
  }
});
