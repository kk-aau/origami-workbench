import test from 'node:test';
import assert from 'node:assert/strict';
import {readTessParams,unitQuadrilateralSplitSourceParams} from '../../src/app/tessellation';
import {readCustomMeshJson} from '../../src/app/customMeshJson';
import {readUnitQuadrilateralSplitSpec,unitQuadrilateralAltSplitPreset,unitQuadrilateralCenteredSplitPreset,unitQuadrilateralSplitMesh} from '../../src/app/unitQuadrilateralSplitSource';

test('unit quadrilateral centered split saved pair round trips strictly',()=>{const spec=unitQuadrilateralCenteredSplitPreset();const parsed=readUnitQuadrilateralSplitSpec(spec);assert.ok(parsed);const mesh=unitQuadrilateralSplitMesh(parsed);assert.deepEqual(mesh.faces,[[0,1,2,3],[4,2,1,5]]);const params=readTessParams(unitQuadrilateralSplitSourceParams(parsed));assert.ok(params&&params.family==='custom');assert.deepEqual(params.unitQuadrilateralSplit,parsed);assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);});
test('unit quadrilateral Alt rejects forged split metadata',()=>{const spec=unitQuadrilateralAltSplitPreset(),params=unitQuadrilateralSplitSourceParams(spec);assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),readTessParams(params));const forged=structuredClone(params);if(forged.family==='custom'&&forged.tileTwists)forged.tileTwists[0].baseVertex=0;assert.equal(readTessParams(forged),null);const wrongPair=structuredClone(spec);wrongPair.arrangement='in3066-pair';assert.equal(readUnitQuadrilateralSplitSpec(wrongPair),null);const obtuse=unitQuadrilateralCenteredSplitPreset();obtuse.pleatAngle=100;assert.equal(readUnitQuadrilateralSplitSpec(obtuse),null);});

test('unit quadrilateral source survives unchanged JSON mesh and clears after mesh edit',()=>{
  const params=readTessParams(unitQuadrilateralSplitSourceParams(unitQuadrilateralCenteredSplitPreset()));
  assert.ok(params&&params.family==='custom');
  const mesh={vertices:params.vertices,faces:params.faces};
  assert.deepEqual(readCustomMeshJson(params,JSON.stringify(mesh)).unitQuadrilateralSplit,params.unitQuadrilateralSplit);
  const changed=structuredClone(mesh); changed.vertices[3][0]+=0.01;
  assert.equal(readCustomMeshJson(params,JSON.stringify(changed)).unitQuadrilateralSplit,undefined);
});
