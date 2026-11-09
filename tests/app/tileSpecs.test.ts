import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assembleTiles,starTileAtEdge,unitStarTile,type Tile} from '../../src/app/tileAssembly';
import {archimedeanPatch6TileSpecs,embedTileSpec,embedTilingSpecs,tileToSpec,unitCairoPentagonTileVertices,unitRegularPolygonTileVertices,unitTriangleTileVertices,type TileSpec} from '../../src/app/tileSpecs';
import {archimedeanPatchIn3182Preset,archimedeanPatchParams} from '../../src/app/archimedeanPatchSource';
import {readCustomMeshJson} from '../../src/app/customMeshJson';
import {changeTessParams,readTessParams,tessConstructionKey,tessPreset,unitTriangleParams} from '../../src/app/tessellation';
import {triangleAltPreset} from '../../src/app/unitTriangleSource';
import {unitCyclicPolygonVertices} from '../../src/app/unitCyclicPolygon';

const square:Tile=[[0,0],[1,0],[1,1],[0,1]];
const at=(offset:[number,number]=[0,0]):TileSpec=>({tiletype:'PolygonTile',vertices:square,offset,rotation:0,scale:1});
const close=(a:Tile,b:Tile)=>a.forEach((point,i)=>point.forEach((value,j)=>assert.ok(Math.abs(value-b[i][j])<1e-9,`vertex ${i+1}, axis ${j+1}`)));

test('EmbedTiling reproduces saved Out[2811] two indexed TestTile squares',()=>{
  // The notebook's In[2811]/Out[2811] has tile 1 in [0,1]² and tile 2 at {1,0}.
  const result=embedTilingSpecs([at(),at([1,0])]);
  close(result[0].points,square);
  close(result[1].points,[[1,0],[2,0],[2,1],[1,1]]);
  assert.equal(assembleTiles(result.map(item=>item.points)).faces.length,2);
});

test('EmbedTile rotates and scales around the tile-local origin before offset',()=>{
  close(embedTileSpec({...at([2,3]),rotation:90,scale:2}),[[2,3],[2,5],[0,5],[0,3]]);
  const restored=tileToSpec([[2,3],[2,5],[0,5],[0,3]]);
  close(embedTileSpec(restored),[[2,3],[2,5],[0,5],[0,3]]);
});

test('JoinTiling +k aligns reverse edges and solves rotation and scale from source geometry',()=>{
  const joined=embedTilingSpecs([at(),{
    ...at([9,9]),rotation:43,scale:2,
    join:{kind:'edge',targetTile:0,targetVertex:1,sourceVertex:0,extraOffset:[0,0]},
  }]);
  close(joined[1].points,[[1,0],[2,0],[2,1],[1,1]]);
  assert.deepEqual(joined[1].offset,[1,0]);
  assert.equal(joined[1].rotation,0);
  assert.equal(joined[1].scale,1);
  const exploded=embedTilingSpecs([at(),{...at(),join:{kind:'edge',targetTile:0,targetVertex:1,sourceVertex:0,extraOffset:[.1,0]}}]);
  close(exploded[1].points,[[1.1,0],[2.1,0],[2.1,1],[1.1,1]]);
  assert.throws(()=>assembleTiles(exploded.map(item=>item.points)),/共边/);
});

test('JoinTiling -k retains supplied angle and scale while attaching one vertex',()=>{
  const placed=embedTilingSpecs([at(),{
    ...at(),rotation:90,scale:2,
    join:{kind:'vertex',targetTile:0,targetVertex:1,sourceVertex:0,extraOffset:[0,0]},
  }]);
  assert.equal(placed[1].rotation,90);
  assert.equal(placed[1].scale,2);
  close(placed[1].points,[[1,0],[1,2],[-1,2],[-1,0]]);
  const third=embedTilingSpecs([at(),{...at(),join:{kind:'edge',targetTile:0,targetVertex:1,sourceVertex:0,extraOffset:[0,0]}},{...at(),join:{kind:'edge',targetTile:1,targetVertex:1,sourceVertex:0,extraOffset:[0,0]}}]);
  close(third[2].points,[[2,0],[3,0],[3,1],[2,1]]);
  assert.equal(assembleTiles(third.map(item=>item.points)).faces.length,3);
});

test('saved numeric PolygonTile and original JoinTiling inputs survive project round trip',()=>{
  const specs:TileSpec[]=[{...at([2,3]),rotation:90,scale:2},{
    ...at([9,9]),rotation:43,scale:2,
    join:{kind:'edge',targetTile:0,targetVertex:1,sourceVertex:0,extraOffset:[0,0]},
  }];
  const result=embedTilingSpecs(specs);
  const original={...tessPreset('custom'),...assembleTiles(result.map(item=>item.points)),customOutput:'tiling' as const,tileSpecs:specs};
  const restored=readTessParams(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(restored,original);
  assert.ok(restored?.family==='custom');
  if(restored?.family!=='custom')return;
  assert.deepEqual(restored.tileSpecs,specs);
  assert.equal(restored.tileSpecs?.[1].rotation,43);
  assert.equal(restored.tileSpecs?.[1].scale,2);
  assert.ok(Math.abs(result[1].rotation-90)<1e-9);
  assert.ok(Math.abs(result[1].scale-2)<1e-9);
  assert.equal(tessConstructionKey(restored),tessConstructionKey({...restored,tileSpecs:undefined}));
  const second=restored.faces[1].map(index=>restored.vertices[index]);
  close(embedTileSpec(tileToSpec(second)),result[1].points);
});

test('saved In[3022] UnitTriangleTile angles reconstruct its unit-base PolygonTile and survive JoinTiling',()=>{
  // In[3021] delegates UnitTriangleTile rendering to PolygonTile[UnitTriangleVertices[angles]].
  // In[3022] saves the 50° / 60° / 70° Tiling input, but no numeric Out table.
  const vertices=unitTriangleTileVertices([50,60,70]);
  close(vertices,[[0,0],[1,0],[.5923962654520477,.7059903775918711]]);
  const first:TileSpec={tiletype:'UnitTriangleTile',angles:[50,60,70],vertices,offset:[0,0],rotation:0,scale:1};
  const second:TileSpec={...first,offset:[8,8],join:{
    kind:'edge',targetTile:0,targetVertex:0,sourceVertex:1,extraOffset:[0,0],
  }};
  const placed=embedTilingSpecs([first,second]);
  close(placed[0].points,vertices);
  close(placed[1].points,[[1,0],[0,0],[.4076037345479523,-.7059903775918711]]);
  const mesh=assembleTiles(placed.map(item=>item.points));
  const saved={...tessPreset('custom'),...mesh,customOutput:'tiling' as const,tileSpecs:[first,second]};
  const restored=readTessParams(JSON.parse(JSON.stringify(saved)));
  assert.ok(restored?.family==='custom');
  if(restored?.family==='custom')assert.deepEqual(restored.tileSpecs,[first,second]);
});

test('UnitTriangleTile source rejects forged angles, vertices and extra expressions',()=>{
  const vertices=unitTriangleTileVertices([50,60,70]);
  const source:TileSpec={tiletype:'UnitTriangleTile',angles:[50,60,70],vertices,offset:[0,0],rotation:0,scale:1};
  const mesh=assembleTiles([vertices]);
  const saved={...tessPreset('custom'),...mesh,customOutput:'tiling' as const,tileSpecs:[source]};
  assert.ok(readTessParams(saved));
  assert.equal(readTessParams({...saved,tileSpecs:[{...source,angles:[50,60,71]}]}),null);
  assert.equal(readTessParams({...saved,tileSpecs:[{...source,vertices:[[0,0],[1,0],[.6,.7]]}]}),null);
  assert.equal(readTessParams({...saved,tileSpecs:[{...source,tiletype:'PolygonTile'}]}),null);
  assert.equal(readTessParams({...saved,tileSpecs:[{...source,expression:'Sin[x]'}]}),null);
});

test('In[433–434]/In[2999] UnitRegularPolygonTile has unit first edge and original counterclockwise vertex order',()=>{
  close(unitRegularPolygonTileVertices(4),square);
  const pentagon=unitRegularPolygonTileVertices(5);
  close(pentagon,[[0,0],[1,0],[1.3090169943749475,.9510565162951535],
    [.5,1.5388417685876268],[-.30901699437494745,.9510565162951536]]);
  for(const sides of [3,4,5,6,8,12,13,16,24]){
    const polygon=unitRegularPolygonTileVertices(sides);
    for(let i=0;i<sides;i++){
      const [a,b]=[polygon[i],polygon[(i+1)%sides]];
      assert.ok(Math.abs(Math.hypot(b[0]-a[0],b[1]-a[1])-1)<1e-9);
    }
  }
  for(const sides of [2,25,4.5,NaN,Infinity])assert.throws(()=>unitRegularPolygonTileVertices(sides));
});

test('higher-sided UnitRegularPolygonTile remains a strict, readable source',()=>{
  for(const sides of [13,16,24]){
    const vertices=unitRegularPolygonTileVertices(sides);
    const source:TileSpec={tiletype:'UnitRegularPolygonTile',sides,vertices,offset:[0,0],rotation:0,scale:1};
    const mesh=assembleTiles([vertices]);
    const saved={...tessPreset('custom'),...mesh,customOutput:'tiling' as const,tileSpecs:[source]};
    const restored=readTessParams(JSON.parse(JSON.stringify(saved)));
    assert.ok(restored?.family==='custom'&&restored.tileSpecs?.[0].sides===sides);
    assert.equal(readTessParams({...saved,tileSpecs:[{...source,sides:sides-1}]}),null);
    assert.equal(readTessParams({...saved,tileSpecs:[{...source,vertices:vertices.map((p,i)=>
      i===2?[p[0]+.001,p[1]] as [number,number]:p)}]}),null);
  }
});

test('named UnitRegularPolygonTile joins, preserves source through project read, and rejects tampered geometry',()=>{
  const vertices=unitRegularPolygonTileVertices(4);
  const first:TileSpec={tiletype:'UnitRegularPolygonTile',sides:4,vertices,offset:[0,0],rotation:0,scale:1};
  const second:TileSpec={...first,offset:[9,9],join:{kind:'edge',targetTile:0,targetVertex:1,sourceVertex:0,extraOffset:[0,0]}};
  const placed=embedTilingSpecs([first,second]);
  close(placed[0].points,square);close(placed[1].points,[[1,0],[2,0],[2,1],[1,1]]);
  const mesh=assembleTiles(placed.map(item=>item.points));
  const saved={...tessPreset('custom'),...mesh,customOutput:'tiling' as const,tileSpecs:[first,second]};
  const restored=readTessParams(JSON.parse(JSON.stringify(saved)));
  assert.ok(restored?.family==='custom');
  if(restored?.family==='custom')assert.deepEqual(restored.tileSpecs,[first,second]);
  assert.equal(readTessParams({...saved,tileSpecs:[{...first,sides:5},second]}),null);
  assert.equal(readTessParams({...saved,tileSpecs:[{...first,vertices:[[0,0],[1,0],[1,1.01],[0,1]]},second]}),null);
  assert.equal(readTessParams({...saved,tileSpecs:[{...first,expression:'Sin[x]'},second]}),null);
});

test('saved In[3182] mixed 3.3.3.4.4 patch attaches three named unit tiles and exact joins without changing twist data',()=>{
  const original=archimedeanPatchParams(archimedeanPatchIn3182Preset());
  const tiles=original.faces.map(face=>face.map(index=>original.vertices[index]));
  const specs=archimedeanPatch6TileSpecs(tiles);
  assert.ok(specs);
  if(!specs)return;
  assert.deepEqual(specs.map(spec=>[spec.tiletype,spec.sides]),[
    ['UnitRegularPolygonTile',3],['UnitRegularPolygonTile',3],['UnitRegularPolygonTile',4]]);
  assert.deepEqual(specs.slice(1).map(spec=>spec.join&&[spec.join.targetTile,spec.join.targetVertex,spec.join.sourceVertex]),
    [[0,1,0],[1,1,1]]);
  const placed=embedTilingSpecs(specs).map(item=>item.points);
  placed.forEach((tile,index)=>close(tile,tiles[index]));
  const mesh=assembleTiles(placed);
  assert.deepEqual(mesh.faces,original.faces);
  mesh.vertices.forEach((point,index)=>assert.ok(Math.hypot(point[0]-original.vertices[index][0],point[1]-original.vertices[index][1])<1e-9));
  const updated=changeTessParams(original,{tileSpecs:specs});
  assert.ok(updated.family==='custom');
  if(updated.family!=='custom')return;
  assert.deepEqual(updated.archimedeanPatch,original.archimedeanPatch);
  assert.deepEqual(updated.tileTwists,original.tileTwists);
  assert.deepEqual(updated.tileSpecs,specs);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(updated))),updated);
  assert.equal(readTessParams({...updated,tileSpecs:[specs[0],{...specs[1],join:{...specs[1].join!,sourceVertex:1}},specs[2]]}),null);
  assert.equal(archimedeanPatch6TileSpecs(tiles.map((tile,i)=>i===2?tile.map((point,j)=>j===2?[point[0]+.01,point[1]]:point):tile)),null);
});

test('In[3283] UnitCairoPentagonTile reconstructs the saved Out[3294] first unit polygon',()=>{
  const expected:Tile=[[0,0],[1,0],[1.4114378277661477,.9114378277661477],
    [.7500000000000004,1.661437827766148],[0,1.0000000000000007]];
  close(unitCairoPentagonTileVertices(90),expected);
  for(const angle of [60.1,70,90,98.707370271,105,119.9]){
    const vertices=unitCairoPentagonTileVertices(angle);
    for(let i=0;i<5;i++){
      const a=vertices[i],b=vertices[(i+1)%5];
      assert.ok(Math.abs(Math.hypot(a[0]-b[0],a[1]-b[1])-1)<1e-9,`δ=${angle}, edge ${i+1}`);
    }
  }
  for(const angle of [60,120,NaN,Infinity])assert.throws(()=>unitCairoPentagonTileVertices(angle));
});

test('named UnitCairoPentagonTile survives strict project read and rejects changed source or vertices',()=>{
  const vertices=unitCairoPentagonTileVertices(90);
  const source:TileSpec={tiletype:'UnitCairoPentagonTile',cairoAngle:90,vertices,offset:[0,0],rotation:0,scale:1};
  const mesh=assembleTiles(embedTilingSpecs([source]).map(item=>item.points));
  const saved={...tessPreset('custom'),...mesh,customOutput:'tiling' as const,tileSpecs:[source]};
  const restored=readTessParams(JSON.parse(JSON.stringify(saved)));
  assert.ok(restored?.family==='custom');
  if(restored?.family==='custom')assert.deepEqual(restored.tileSpecs,[source]);
  assert.equal(readTessParams({...saved,tileSpecs:[{...source,cairoAngle:91}]}),null);
  assert.equal(readTessParams({...saved,tileSpecs:[{...source,vertices:vertices.map((p,i)=>i===3?[p[0]+.01,p[1]]:p)}]}),null);
  assert.equal(readTessParams({...saved,tileSpecs:[{...source,sides:5}]}),null);
  assert.equal(readTessParams({...saved,tileSpecs:[{...source,expression:'Sin[x]'}]}),null);
});

test('In[378] general cyclic mother polygon keeps numeric angle and side source through project read',()=>{
  for(const [cyclicAngles,cyclicSide,cyclicSideIndex] of [
    [[110,125,112.5,102.5,0],1,2],
    [[130,120,112.5,117.5,0,0],1,2],
    ...[13,24].map(sides=>{
      const angles=Array(sides).fill((sides-2)*180/sides);
      angles[sides-1]=0;
      if(sides%2===0)angles[sides-2]=0;
      return [angles,1,2] as [number[],number,number];
    }),
  ] as [number[],number,number][]){
    const vertices=unitCyclicPolygonVertices(cyclicAngles,cyclicSide,cyclicSideIndex);
    const source:TileSpec={tiletype:'UnitCyclicPolygonTile',cyclicAngles,cyclicSide,
      cyclicSideIndex,vertices,offset:[0,0],rotation:0,scale:1};
    const mesh=assembleTiles(embedTilingSpecs([source]).map(item=>item.points));
    const saved={...tessPreset('custom'),...mesh,customOutput:'tiling' as const,tileSpecs:[source]};
    const restored=readTessParams(JSON.parse(JSON.stringify(saved)));
    assert.ok(restored?.family==='custom');
    if(restored?.family==='custom')assert.deepEqual(restored.tileSpecs,[source]);
    assert.equal(readTessParams({...saved,tileSpecs:[{...source,cyclicAngles:[cyclicAngles[0]+1,...cyclicAngles.slice(1)]}]}),null);
    assert.equal(readTessParams({...saved,tileSpecs:[{...source,vertices:vertices.map((p,i)=>i===2?[p[0]+.01,p[1]]:p)}]}),null);
    assert.equal(readTessParams({...saved,tileSpecs:[{...source,expression:'Sin[x]'}]}),null);
  }
});

test('In[3073–3074] UnitRegularStarPolygonTile stores the original simple-star outline as a named 2D source',()=>{
  for(const [starPoints,tipDegrees] of [[5,36],[6,200]]){
    const vertices=unitStarTile(starPoints,tipDegrees);
    const spec:TileSpec={tiletype:'UnitRegularStarPolygonTile',starPoints,tipDegrees,vertices,offset:[0,0],rotation:0,scale:1};
    const mesh=assembleTiles(embedTilingSpecs([spec]).map(item=>item.points),true);
    assert.equal(mesh.faces[0].length,2*starPoints);
    const saved={...tessPreset('custom'),...mesh,customOutput:'tiling' as const,tileSpecs:[spec]};
    const restored=readTessParams(JSON.parse(JSON.stringify(saved)));
    assert.ok(restored?.family==='custom');
    if(restored?.family==='custom')assert.deepEqual(restored.tileSpecs,[spec]);
    assert.equal(readTessParams({...saved,tileSpecs:[{...spec,tipDegrees:tipDegrees+1}]}),null);
    assert.equal(readTessParams({...saved,tileSpecs:[{...spec,vertices:vertices.map((p,i)=>i===3?[p[0]+.01,p[1]]:p)}]}),null);
    assert.equal(readTessParams({...saved,tileSpecs:[{...spec,expression:'Cos[x]'}]}),null);
  }
});

test('a concave named star can attach to a square as mother tiling without claiming a fold construction',()=>{
  const first:TileSpec={tiletype:'UnitRegularPolygonTile',sides:4,vertices:unitRegularPolygonTileVertices(4),offset:[0,0],rotation:0,scale:1};
  const second:TileSpec={tiletype:'UnitRegularStarPolygonTile',starPoints:5,tipDegrees:36,
    vertices:unitStarTile(5,36),offset:[0,0],rotation:0,scale:1,
    join:{kind:'edge',targetTile:0,targetVertex:0,sourceVertex:1,extraOffset:[0,0]}};
  const placed=embedTilingSpecs([first,second]);
  close(placed[1].points,starTileAtEdge(5,36,square,0));
  const mesh=assembleTiles(placed.map(item=>item.points),true);
  const saved={...tessPreset('custom'),...mesh,customOutput:'tiling' as const,tileSpecs:[first,second]};
  const restored=readTessParams(JSON.parse(JSON.stringify(saved)));
  assert.ok(restored?.family==='custom');
  if(restored?.family==='custom'){
    assert.deepEqual(restored.tileSpecs,[first,second]);
    assert.equal(restored.customOutput,'tiling');
  }
  assert.equal(readTessParams({...saved,tileSpecs:[first,{...second,starPoints:4}]}),null);
  assert.equal(readTessParams({...saved,tileSpecs:[first,{...second,starPoints:5.5}]}),null);
  assert.equal(readTessParams({...saved,tileSpecs:[first,{...second,tipDegrees:288}]}),null);
});

test('a mixed UnitTriangleTile and UnitRegularPolygonTile mesh retains tile twists when TileSpec geometry is unchanged',()=>{
  const triangle=unitTriangleTileVertices([50,60,70]);
  const first:TileSpec={tiletype:'UnitTriangleTile',angles:[50,60,70],vertices:triangle,offset:[0,0],rotation:0,scale:1};
  const second:TileSpec={tiletype:'UnitRegularPolygonTile',sides:4,vertices:unitRegularPolygonTileVertices(4),
    offset:[0,0],rotation:0,scale:1,join:{kind:'edge',targetTile:0,targetVertex:0,sourceVertex:1,extraOffset:[0,0]}};
  const specs=[first,second],mesh=assembleTiles(embedTilingSpecs(specs).map(item=>item.points));
  const twists=[{width:.1,offset:0,tilt:80,centralTypes:['M','M','V'] as ('M'|'V')[]},
    {width:.1,offset:0,tilt:80,centralTypes:['M','M','V','V'] as ('M'|'V')[]}];
  const source=readTessParams({...tessPreset('custom'),...mesh,customOutput:'tile-twists',tileTwists:twists,tileSpecs:specs});
  assert.ok(source?.family==='custom');
  if(source?.family!=='custom')return;
  const rebuilt=assembleTiles(embedTilingSpecs(source.tileSpecs!).map(item=>item.points));
  const updated=changeTessParams(source,{...rebuilt,tileSpecs:structuredClone(source.tileSpecs)});
  assert.ok(updated.family==='custom');
  if(updated.family!=='custom')return;
  assert.deepEqual(updated.tileTwists,twists);
  assert.deepEqual(updated.tileSpecs,specs);
  assert.ok(readTessParams(JSON.parse(JSON.stringify(updated))));
});

test('reopening unchanged In[3028] mesh preserves per-tile twist while geometry edits reset it',()=>{
  const original=unitTriangleParams(triangleAltPreset());
  const same=changeTessParams(original,{
    vertices:structuredClone(original.vertices),faces:structuredClone(original.faces),
  });
  assert.equal(same.family,'custom');
  if(same.family!=='custom')return;
  assert.deepEqual(same.tileTwists,original.tileTwists);
  assert.equal(same.tileTwists?.[0].angleMode,'twist');
  assert.equal(same.tileTwists?.[0].twistAngle,25);
  assert.ok(readTessParams(same));
  const roundoff=changeTessParams(original,{
    vertices:original.vertices.map(([x,y],i)=>i===2?[x+1e-16,y]:[x,y]),
    faces:structuredClone(original.faces),
  });
  assert.equal(roundoff.family,'custom');
  if(roundoff.family!=='custom')return;
  assert.deepEqual(roundoff.tileTwists,original.tileTwists);
  assert.deepEqual(roundoff.unitTriangle,original.unitTriangle);
  assert.ok(readTessParams(roundoff));
  const namedFirst:TileSpec={tiletype:'UnitTriangleTile',angles:[50,60,70],
    vertices:unitTriangleTileVertices([50,60,70]),offset:[0,0],rotation:0,scale:1};
  const second=tileToSpec(original.faces[1].map(index=>original.vertices[index]));
  const specs=[namedFirst,second];
  const rebuilt=assembleTiles(embedTilingSpecs(specs).map(item=>item.points));
  const withBothSources=changeTessParams(original,{...rebuilt,tileSpecs:specs});
  assert.equal(withBothSources.family,'custom');
  if(withBothSources.family!=='custom')return;
  assert.deepEqual(withBothSources.unitTriangle,original.unitTriangle);
  assert.deepEqual(withBothSources.tileSpecs,specs);
  assert.deepEqual(withBothSources.tileTwists,original.tileTwists);
  assert.ok(readTessParams(withBothSources));
  const changedVertex=changeTessParams(original,{
    vertices:original.vertices.map(([x,y],i)=>i===2?[x+.01,y]:[x,y]),
  });
  assert.equal(changedVertex.family,'custom');
  if(changedVertex.family!=='custom')return;
  assert.notDeepEqual(changedVertex.tileTwists,original.tileTwists);
  assert.equal(changedVertex.tileTwists?.[0].angleMode,undefined);
  assert.equal(changedVertex.unitTriangle,undefined);
  const changedFace=changeTessParams(original,{
    faces:original.faces.map((face,i)=>i===0?[...face].reverse():[...face]),
  });
  assert.equal(changedFace.family,'custom');
  if(changedFace.family==='custom')assert.notDeepEqual(changedFace.tileTwists,original.tileTwists);
});

test('mesh edits discard TileSpec provenance; unchanged JSON edits retain it',()=>{
  const specs:TileSpec[]=[at(),{...at([8,8]),join:{kind:'edge',targetTile:0,targetVertex:1,sourceVertex:0,extraOffset:[0,0]}}];
  const mesh=assembleTiles(embedTilingSpecs(specs).map(item=>item.points));
  const params=readTessParams({...tessPreset('custom'),...mesh,customOutput:'tiling',tileSpecs:specs});
  assert.ok(params?.family==='custom');
  if(params?.family!=='custom')return;
  const json={vertices:params.vertices,faces:params.faces};
  assert.deepEqual(readCustomMeshJson(params,JSON.stringify(json)).tileSpecs,specs);
  assert.deepEqual((changeTessParams(params,{vertices:structuredClone(params.vertices)}) as typeof params).tileSpecs,specs);
  const vertices=params.vertices.map(([x,y],i)=>i===2?[x+.05,y] as [number,number]:[x,y] as [number,number]);
  const changed=readCustomMeshJson(params,JSON.stringify({...json,vertices}));
  assert.equal(changed.tileSpecs,undefined);
  assert.ok(readTessParams(JSON.parse(JSON.stringify(changed))));
  assert.equal(changeTessParams(params,{vertices}).family,'custom');
  assert.equal((changeTessParams(params,{vertices}) as typeof params).tileSpecs,undefined);
  assert.ok(readTessParams({...params,vertices,tileSpecs:undefined}));
  assert.equal(readTessParams({...params,vertices}),null);
});

test('TileSpec reader rejects expressions, unknown tiletypes, invalid references and stale geometry',()=>{
  const specs:TileSpec[]=[at(),{...at(),join:{kind:'edge',targetTile:0,targetVertex:1,sourceVertex:0,extraOffset:[0,0]}}];
  const mesh=assembleTiles(embedTilingSpecs(specs).map(item=>item.points));
  const original={...tessPreset('custom'),...mesh,customOutput:'tiling' as const,tileSpecs:specs};
  assert.equal(readTessParams({...original,tileSpecs:[{...specs[0],tiletype:'Run["code"]'},specs[1]]}),null);
  assert.equal(readTessParams({...original,tileSpecs:[{...specs[0],expression:'1+1'},specs[1]]}),null);
  assert.equal(readTessParams({...original,tileSpecs:[specs[0],{...specs[1],join:{...specs[1].join!,targetTile:1}}]}),null);
  assert.equal(readTessParams({...original,tileSpecs:[specs[0]]}),null);
  assert.ok(readTessParams({...tessPreset('custom'),...mesh,customOutput:'tiling'}));
});

test('partial shared edges retain the original local vertices through mesh subdivision',()=>{
  const specs:TileSpec[]=[
    {...at(),vertices:[[0,0],[2,0],[2,2],[0,2]]},
    at([2,0]),
    at([2,1]),
  ];
  const mesh=assembleTiles(embedTilingSpecs(specs).map(item=>item.points));
  assert.equal(mesh.faces[0].length,5);
  const expanded=assembleTiles(mesh.faces.map(face=>face.map(index=>mesh.vertices[index])));
  assert.notDeepEqual(expanded.vertices,mesh.vertices);
  const restored=readTessParams({...tessPreset('custom'),...mesh,customOutput:'tiling',tileSpecs:specs});
  assert.ok(restored?.family==='custom');
  if(restored?.family==='custom')assert.deepEqual(restored.tileSpecs?.[0].vertices,specs[0].vertices);
});

test('JoinTiling rejects future references, invalid vertices and degenerate edges',()=>{
  assert.throws(()=>embedTilingSpecs([at(),{...at(),join:{kind:'edge',targetTile:1,targetVertex:0,sourceVertex:0,extraOffset:[0,0]}}]),/引用无效/);
  assert.throws(()=>embedTilingSpecs([at(),{...at(),join:{kind:'vertex',targetTile:0,targetVertex:4,sourceVertex:0,extraOffset:[0,0]}}]),/引用无效/);
  assert.throws(()=>embedTilingSpecs([at(),{...at(),vertices:[[0,0],[1,0],[0,0]],join:{kind:'edge',targetTile:0,targetVertex:1,sourceVertex:0,extraOffset:[0,0]}}]),/长度不能为零/);
  assert.throws(()=>embedTileSpec({...at(),scale:0}),/正缩放/);
});
