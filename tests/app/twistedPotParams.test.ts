import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readTwistedPotParams,twistedPotPreset} from '../../src/app/twistedPotParams';
import {canAdoptTess,prepareTessResult,readTessParams,tessConstructionKey,tessPreset,type TessResponse} from '../../src/app/tessellation';
import {spatialMeshScene} from '../../src/app/spatialMeshView';
import {projectRigidQuad} from '../../src/app/rigidQuadView';

test('twisted pot preset and all exposed options restore within the faceted domain',()=>{
  const preset=twistedPotPreset();
  assert.deepEqual(tessPreset('twisted-pot'),preset);
  assert.deepEqual(readTessParams(structuredClone(preset)),preset);
  const edited={...preset,sectors:8,asymmetry:-1 as const,goreTwist:-1 as const,
    flangeRotationDeg:10,border:'trimmed' as const,typeMinimumAngleDeg:5,flangeInset:.05};
  assert.deepEqual(readTwistedPotParams(edited),edited);
  assert.deepEqual(readTessParams(structuredClone(edited)),edited);
  assert.deepEqual(readTwistedPotParams({...preset,crossSection:preset.crossSection.map(([x,z])=>[x+2,z+3])}),preset);
});

test('twisted pot reader refuses unsupported shape, paper, smooth flange and invalid inset',()=>{
  const preset=twistedPotPreset();
  for(const invalid of [
    {...preset,paper:{shape:'square',margin:.1}},
    {...preset,flatFlanges:'smooth'},
    {...preset,flangeInset:-.01},
    {...preset,flangeInset:.51},
    {...preset,sectors:true},
    {...preset,sectors:17},
    {...preset,asymmetry:0},
    {...preset,goreTwist:0},
    {...preset,border:'circular'},
    {...preset,flangeRotationDeg:46},
    {...preset,typeMinimumAngleDeg:46},
    {...preset,crossSection:[[0,0],[1,1],[1,2],[1,3]]},
    {...preset,crossSection:[[0,0],[1,0],[1,1],[1,.5]]},
    {...preset,crossSection:[[0,0],[1,0],[1,1],[0,2]]},
    {...preset,crossSection:Array.from({length:13},(_,i)=>[i?1:0,i?i-1:0]),sectors:16},
  ])assert.equal(readTessParams(invalid),null,JSON.stringify(invalid));
});

test('the generated twisted pot can be adopted on the same-sheet static spatial canvas',()=>{
  const response=JSON.parse(readFileSync(new URL('../fixtures/constructed_twisted_pot.json',import.meta.url),'utf8')) as TessResponse;
  const params=twistedPotPreset();
  const result=prepareTessResult(response,params);
  const scene=spatialMeshScene(result);
  assert.ok(scene);
  assert.deepEqual([scene.vertices.length,scene.edges.length,scene.faces.length],[78,210,133]);
  assert.ok(scene.maximumFaceDistanceError<1e-8);
  assert.equal(result.source.staticGlobalIsometryChecked,true);
  assert.equal(canAdoptTess(result,false,tessConstructionKey(params),params),true);
  assert.equal(canAdoptTess(result,false,'stale',params),false);
  assert.ok(result.doc.segments.length>0);
  assert.deepEqual(readTessParams(result.doc.metadata?.tessellation?.parameters),params);
  for(const back of [false,true]){
    const projection=projectRigidQuad(scene,-25,48,back,0);
    assert.equal(projection.faceOrder.length,133);
  }
});
