import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assembleTiles} from '../../src/app/tileAssembly';
import {joinTilingPatches,type PatchInfo} from '../../src/app/joinTilingPatches';
import {embedTilingSpecs,unitCairoPentagonTileVertices,unitRegularPolygonTileVertices,type TileSpec} from '../../src/app/tileSpecs';
import {readTessParams,tessPreset} from '../../src/app/tessellation';

const square=unitRegularPolygonTileVertices(4);
const tile=(offset:[number,number]=[0,0]):TileSpec=>({
  tiletype:'UnitRegularPolygonTile',sides:4,vertices:square,offset,rotation:0,scale:1,
});
const close=(actual:readonly number[],expected:readonly number[])=>{
  actual.forEach((value,index)=>assert.ok(Math.abs(value-expected[index])<1e-9,`${value} != ${expected[index]}`));
};

/** The three-square L patch in the original In[3321] example. */
const tromino=():TileSpec[]=>[
  tile(),
  {...tile(),join:{kind:'edge',targetTile:0,targetVertex:1,sourceVertex:0,extraOffset:[0,0]}},
  {...tile(),join:{kind:'edge',targetTile:1,targetVertex:2,sourceVertex:0,extraOffset:[0,0]}},
];

test('In[3321] joins four whole three-square patches around one square',()=>{
  // The notebook saves an input and a drawing, but no machine-readable Out vertices.
  const patches:PatchInfo[]=[{tiles:[tile()]}];
  for(const targetVertex of [1,2,3,0])patches.push({tiles:tromino(),join:{
    targetPatch:0,targetTile:0,targetVertex,sourceTile:0,sourceVertex:0,
  }});
  const flat=joinTilingPatches(patches);
  assert.equal(flat.length,13);
  assert.ok(flat.every(spec=>spec.tiletype==='UnitRegularPolygonTile'&&spec.sides===4&&!spec.join));
  const placed=embedTilingSpecs(flat);
  close(placed[1].points[0],[1,0]);
  close(placed[2].points[0],[2,0]);
  close(placed[3].points[0],[3,1]);
  for(let group=0;group<4;group++){
    const first=placed[1+group*3].points;
    close(first[0],placed[0].points[[1,2,3,0][group]]);
    close(first[3],placed[0].points[[2,3,0,1][group]]);
    // The whole patch shares one transform; no member is individually re-joined.
    const members=placed.slice(1+group*3,4+group*3);
    for(const member of members)assert.equal(member.scale,1);
  }
  const mesh=assembleTiles(placed.map(item=>item.points));
  assert.equal(mesh.faces.length,13);
  const saved={...tessPreset('custom'),...mesh,customOutput:'tiling' as const,tileSpecs:flat};
  const restored=readTessParams(JSON.parse(JSON.stringify(saved)));
  assert.ok(restored?.family==='custom');
  if(restored?.family==='custom')assert.deepEqual(restored.tileSpecs,flat);
});

test('patch-level similarity composes each member offset, rotation and scale',()=>{
  const current=[tile([0,0]),tile([1,0])];
  const joined=joinTilingPatches([
    {tiles:[{...tile(),scale:2}]},
    {tiles:current,join:{targetPatch:0,targetTile:0,targetVertex:1,sourceTile:0,sourceVertex:0}},
  ]);
  close(joined[1].offset,[2,0]);
  close(joined[2].offset,[4,0]);
  assert.equal(joined[1].scale,2);
  assert.equal(joined[2].scale,2);
  const vertices=embedTilingSpecs(joined).map(item=>item.points);
  close(vertices[2][0],[4,0]);
  close(vertices[2][2],[6,2]);
  assert.equal(assembleTiles(vertices).faces.length,3);
});

test('later patch can attach to an earlier non-first patch; invalid references reject',()=>{
  const joined=joinTilingPatches([
    {tiles:[tile()]},
    {tiles:[tile()],join:{targetPatch:0,targetTile:0,targetVertex:1,sourceTile:0,sourceVertex:0}},
    {tiles:[tile()],join:{targetPatch:1,targetTile:0,targetVertex:1,sourceTile:0,sourceVertex:0}},
  ]);
  close(joined[2].offset,[2,0]);
  assert.throws(()=>joinTilingPatches([{tiles:[tile()]},{tiles:[tile()],join:{targetPatch:1,targetTile:0,targetVertex:1,sourceTile:0,sourceVertex:0}}]),/引用无效/);
  assert.throws(()=>joinTilingPatches([{tiles:[tile()]},{tiles:[tile()],join:{targetPatch:0,targetTile:0,targetVertex:8,sourceTile:0,sourceVertex:0}}]),/顶点引用无效/);
  assert.throws(()=>joinTilingPatches([{tiles:[tile()],join:{targetPatch:0,targetTile:0,targetVertex:0,sourceTile:0,sourceVertex:0}}]),/首组/);
  assert.throws(()=>joinTilingPatches([{tiles:[tile()]},{tiles:[tile(),tile([100,0])],join:{targetPatch:0,targetTile:0,targetVertex:1,sourceTile:0,sourceVertex:0}}]),/数值范围/);
});

test('whole-patch join retains UnitCairoPentagonTile source in the flattened saved result',()=>{
  const vertices=unitCairoPentagonTileVertices(100);
  const cairo:TileSpec={tiletype:'UnitCairoPentagonTile',cairoAngle:100,vertices,offset:[0,0],rotation:0,scale:1};
  const flat=joinTilingPatches([
    {tiles:[cairo]},
    {tiles:[cairo],join:{targetPatch:0,targetTile:0,targetVertex:1,sourceTile:0,sourceVertex:0}},
  ]);
  assert.ok(flat.every(spec=>spec.tiletype==='UnitCairoPentagonTile'&&spec.cairoAngle===100&&!spec.join));
  const placed=embedTilingSpecs(flat);
  close(placed[1].points[0],placed[0].points[1]);
  close(placed[1].points[4],placed[0].points[2]);
  const mesh=assembleTiles(placed.map(item=>item.points));
  const saved={...tessPreset('custom'),...mesh,customOutput:'tiling' as const,tileSpecs:flat};
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(saved))),saved);
});
