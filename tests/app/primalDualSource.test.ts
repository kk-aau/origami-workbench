import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canAdoptTessWithTileLayers,changeTessParams,readTessParams,tessPreset,
  type TessResult} from '../../src/app/tessellation';
import {primalDualTopFaceConstraints} from '../../src/app/primalDualVisibleFace';

test('P39 custom mother parameters survive project readback and edits',()=>{
  const source={...tessPreset('custom'),customOutput:'tiling' as const};
  const params=readTessParams({...tessPreset('primal-dual'),
    motherParams:source,paper:undefined});
  assert.ok(params&&params.family==='primal-dual');
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  const edited=changeTessParams(params,{angle:42});
  assert.deepEqual((edited as typeof params).motherParams,source);
  for(const motherParams of [tessPreset('primal-dual'),tessPreset('flagstone'),
    tessPreset('twist'),{...tessPreset('ring'),ringMode:'origamica'}])
    assert.equal(readTessParams({...params,motherParams}),null);
});

test('P39 custom mother candidate needs solved whole-sheet layer order to adopt',()=>{
  const params=readTessParams({...tessPreset('primal-dual'),
    motherParams:{...tessPreset('periodic'),paper:undefined},paper:undefined})!;
  const result={source:{},stats:{checks:{geometry:{status:'passed'},
    local:{status:'passed',interiorVertices:4}}}} as TessResult;
  const key=JSON.stringify(params);
  for(const status of [undefined,'checking','no-solution','invalid','unconfirmed'])
    assert.equal(canAdoptTessWithTileLayers(result,false,key,params,status),false);
  assert.equal(canAdoptTessWithTileLayers(result,false,key,params,'solved'),true);
  assert.equal(canAdoptTessWithTileLayers(result,true,key,params,'solved'),false);
});

test('P39 paired mother-edge flips and signed visible face survive readback',()=>{
  const params=readTessParams({...tessPreset('primal-dual'),
    dualEdgeFlips:[[1,2],[4,5]],visibleTopFace:-3})!;
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  const result={source:{},stats:{checks:{geometry:{status:'passed'},
    local:{status:'passed',interiorVertices:4}}}} as TessResult;
  const key=JSON.stringify(params);
  assert.equal(canAdoptTessWithTileLayers(result,false,key,params,'checking'),false);
  assert.equal(canAdoptTessWithTileLayers(result,false,key,params,'solved'),true);
  assert.equal(readTessParams({...params,dualEdgeFlips:[[2,1]]}),null);
  assert.equal(readTessParams({...params,dualEdgeFlips:[[1,2],[1,2]]}),null);
  assert.equal(readTessParams({...params,visibleTopFace:0}),null);
});

test('P39 visible-top constraint uses canonical CP face and signed material side',()=>{
  assert.deepEqual(primalDualTopFaceConstraints(undefined,9),[]);
  assert.deepEqual(primalDualTopFaceConstraints(3,9),[{face:2,side:'white'}]);
  assert.deepEqual(primalDualTopFaceConstraints(-3,9),[{face:2,side:'color'}]);
  assert.equal(primalDualTopFaceConstraints(10,9),null);
  assert.equal(primalDualTopFaceConstraints(-10,9),null);
});

test('P39 FaceupFace survives project readback separately from global top face',()=>{
  const params=readTessParams({...tessPreset('primal-dual'),faceupFace:-3,visibleTopFace:2})!;
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  assert.equal(params.family==='primal-dual'&&params.faceupFace,-3);
  assert.equal(params.family==='primal-dual'&&params.visibleTopFace,2);
  assert.equal(readTessParams({...params,faceupFace:0}),null);
  assert.equal(readTessParams({...params,faceupFace:4097}),null);
  assert.equal(readTessParams({...params,faceupFace:1.5}),null);
  assert.equal(readTessParams({...tessPreset('periodic'),faceupFace:1}),null);
});
