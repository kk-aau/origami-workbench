import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canAdoptTessWithTileLayers,changeTessParams,defaultTileTwists,prepareTessResult,readTessParams,tessConstructionKey,tessPreset,type TessResponse} from '../../src/app/tessellation';
import {ORIGINAL_MONOLITHIC_OPTIONS} from '../../src/app/tileMonolithicOptions';

test('original monolithic options round-trip while old tile patches stay untouched',()=>{
  const base=tessPreset('custom');assert.equal(base.family,'custom');
  const input={...base,customOutput:'tile-twists',tileTwists:defaultTileTwists(base.faces)};
  const old=readTessParams(input)!;
  const original=readTessParams({...input,monolithicOptions:ORIGINAL_MONOLITHIC_OPTIONS})!;
  assert.ok(old.family==='custom'&&original.family==='custom');
  assert.equal(old.monolithicOptions,undefined);
  assert.deepEqual(original.monolithicOptions,ORIGINAL_MONOLITHIC_OPTIONS);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(original))),original);
  assert.notEqual(tessConstructionKey(old),tessConstructionKey(original));
  const tiling=changeTessParams(original,{customOutput:'tiling'});
  assert.equal(tiling.family,'custom');assert.equal(tiling.monolithicOptions,undefined);
  assert.equal(readTessParams({...original,monolithicOptions:{...ORIGINAL_MONOLITHIC_OPTIONS,collinearTolerance:-1}}),null);
  assert.equal(readTessParams({...original,customOutput:'tiling',tileTwists:undefined}),null);
});

test('adjacent custom faces receive complementary default tile angles',()=>{
  const base=tessPreset('custom');assert.equal(base.family,'custom');
  const twists=defaultTileTwists(base.faces);
  assert.deepEqual(twists.map(t=>t.tilt),[70,110,110,70]);
  assert.deepEqual(twists.map(t=>t.centralTypes),[
    ['M','M','M','M'],['V','V','V','V'],['V','V','V','V'],['M','M','M','M'],
  ]);
  const params=readTessParams({...base,customOutput:'tile-twists',tileTwists:twists})!;
  assert.ok(params);assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  assert.equal(readTessParams({...params,tileTwists:twists.slice(0,2)}),null);
  assert.equal(readTessParams({...params,tileTwists:[{...twists[0],centralTypes:['M']},...twists.slice(1)]}),null);
  assert.equal(readTessParams({...params,parameterization:'gamma-alpha',gamma:1,pleatAngle:30}),null);
});

test('a split quadrilateral and an ordinary triangle keep distinct per-tile constructors',()=>{
  const base=tessPreset('custom');assert.equal(base.family,'custom');
  const vertices:[[number,number],[number,number],[number,number],[number,number],[number,number]]=
    [[0,0],[1,0],[1.1,1.4],[-.2,1],[.5,-Math.sqrt(3)/2]];
  const faces=[[0,1,2,3],[1,0,4]];
  const split={width:.15,offset:0,tilt:70,centralTypes:['M','M','V','V'],construction:'split',baseVertex:1,connection:'M',ccw:true};
  const triangle={width:.15,offset:0,tilt:110,centralTypes:['V','V','V']};
  const params=readTessParams({...base,vertices,faces,customOutput:'tile-twists',tileTwists:[split,triangle]});
  assert.ok(params&&params.family==='custom');
  assert.deepEqual(params.tileTwists?.[0],split);
  assert.deepEqual(params.tileTwists?.[1],triangle);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  for(const wrong of [{...split,baseVertex:4},{...split,baseVertex:true},
    {...split,connection:'U'},{...split,ccw:1},{...split,construction:'polygon'},
    {...split,ccw:undefined}])
    assert.equal(readTessParams({...params,tileTwists:[wrong,triangle]}),null);
  assert.equal(readTessParams({...params,tileTwists:[split,{...split,centralTypes:['M','M','V']}]}),null,
    'a triangle cannot use a quadrilateral split');
});

test('original centered AltTile keeps each twist angle through width edits and save/load',()=>{
  const base=tessPreset('custom');assert.equal(base.family,'custom');
  const old=defaultTileTwists(base.faces);
  const alpha=(tilt:number)=>Math.atan2(.2*Math.sin(tilt*Math.PI/180),Math.cos(tilt*Math.PI/180))*180/Math.PI;
  const alt=old.map((row,i)=>({width:row.width,offset:0,angleMode:'twist',
    twistAngle:alpha(row.tilt!),centralTypes:row.centralTypes,
    ...(i===0?{construction:'split',baseVertex:0,connection:'M'}:{})}));
  const params=readTessParams({...base,customOutput:'tile-twists',tileTwists:alt})!;
  assert.equal(params.family,'custom');
  assert.deepEqual(params.tileTwists,alt);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  const wider=changeTessParams(params,{tileTwists:params.tileTwists?.map(row=>({...row,width:.32}))});
  assert.equal(wider.family,'custom');
  assert.deepEqual(wider.tileTwists?.map(row=>row.twistAngle),params.tileTwists?.map(row=>row.twistAngle));
  assert.notEqual(tessConstructionKey(wider),tessConstructionKey(params));
  const invalid=[{...alt[0],offset:.01},{...alt[0],twistAngle:180},
    {...alt[0],tilt:70},{...alt[0],ccw:true},
    {...alt[0],twistAngle:Number.NaN}];
  for(const wrong of invalid)assert.equal(readTessParams({...params,tileTwists:[wrong,...alt.slice(1)]}),null);
  assert.deepEqual(readTessParams({...params,tileTwists:old})?.tileTwists,old,
    'saved pleat-angle projects retain their original parameter shape');
});

test('changing tile geometry resets per-face settings, while changing vertex positions preserves them',()=>{
  const base=tessPreset('custom');assert.equal(base.family,'custom');
  const twists=defaultTileTwists(base.faces);
  const params=readTessParams({...base,customOutput:'tile-twists',tileTwists:twists})!;
  assert.equal(params.family,'custom');
  const moved=changeTessParams(params,{vertices:params.vertices.map(([x,y])=>[x+.1,y])});
  assert.equal(moved.family,'custom');assert.deepEqual(moved.tileTwists,twists);
  const changed=changeTessParams(params,{faces:[...params.faces].reverse()});
  assert.equal(changed.family,'custom');assert.deepEqual(changed.tileTwists,defaultTileTwists(changed.faces));
  const tiling=changeTessParams(params,{customOutput:'tiling'});
  assert.equal(tiling.family,'custom');assert.equal(tiling.tileTwists,undefined);
});

test('tile patch fixed face survives parameter edits but resets with topology and output changes',()=>{
  const base=tessPreset('custom');assert.equal(base.family,'custom');
  const twists=defaultTileTwists(base.faces);
  const params=readTessParams({...base,customOutput:'tile-twists',tileTwists:twists,stationaryFace:2})!;
  assert.ok(params&&params.family==='custom');
  assert.equal(params.stationaryFace,2);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  assert.equal(readTessParams({...params,stationaryFace:-1}),null);
  assert.equal(readTessParams({...params,stationaryFace:1.5}),null);
  const moved=changeTessParams(params,{vertices:params.vertices.map(([x,y])=>[x+.1,y])});
  assert.equal(moved.family,'custom');assert.equal(moved.stationaryFace,2);
  const retiled=changeTessParams(params,{faces:[...params.faces].reverse()});
  assert.equal(retiled.family,'custom');assert.equal(retiled.stationaryFace,undefined);
  const tiling=changeTessParams(params,{customOutput:'tiling'});
  assert.equal(tiling.family,'custom');assert.equal(tiling.stationaryFace,undefined);
  assert.equal(readTessParams({...params,customOutput:'tiling',tileTwists:undefined}),null);
});

test('tile patches and paper-framed folds require a verified global layer order before adoption',()=>{
  const response:TessResponse={fold:{vertices_coords:[[0,0],[1,0],[1,1],[0,1]],edges_vertices:[[0,1],[1,2],[2,3],[3,0]],edges_assignment:['B','B','B','B']},
    stats:{vertices:4,edges:4,faces:1,tiles:1,checks:{geometry:{status:'passed'},local:{status:'passed'}}},warnings:[],source:{algorithm:'test'}};
  const base=tessPreset('custom');assert.equal(base.family,'custom');
  const params=readTessParams({...base,customOutput:'tile-twists',tileTwists:defaultTileTwists(base.faces)})!;
  const result=prepareTessResult(response,params),key=tessConstructionKey(params);
  for(const status of [undefined,'checking','no-solution','invalid','unconfirmed'])
    assert.equal(canAdoptTessWithTileLayers(result,false,key,params,status),false,status);
  assert.equal(canAdoptTessWithTileLayers(result,false,key,params,'solved'),true);
  assert.equal(canAdoptTessWithTileLayers(result,true,key,params,'solved'),false);
  const oldParams=readTessParams({...params,tileTwists:params.family==='custom'?params.tileTwists?.map(t=>({...t,centralTypes:t.centralTypes.map(()=> 'M')})):undefined});
  assert.ok(oldParams&&oldParams.family==='custom','legacy all-M settings remain readable for editing');
  const preset=tessPreset('periodic');
  assert.deepEqual(preset.paper,{shape:'square',margin:.1});
  const {paper:_newDefault,...legacy}=preset;
  const periodic=readTessParams(legacy)!;
  assert.equal(periodic.paper,undefined,'saved projects without a paper choice retain their original boundary');
  const normal=prepareTessResult(response,periodic);
  assert.equal(canAdoptTessWithTileLayers(normal,false,tessConstructionKey(periodic),periodic),true);
  const paper=changeTessParams(periodic,{paper:{shape:'square',margin:.1}});
  const framed=prepareTessResult(response,paper),paperKey=tessConstructionKey(paper);
  for(const status of [undefined,'checking','no-solution','invalid','unconfirmed'])
    assert.equal(canAdoptTessWithTileLayers(framed,false,paperKey,paper,status),false,status);
  assert.equal(canAdoptTessWithTileLayers(framed,false,paperKey,paper,'solved'),true);
  const mother=prepareTessResult({...response,source:{algorithm:'test',output:'tiling'}},paper);
  assert.equal(canAdoptTessWithTileLayers(mother,false,paperKey,paper),true);
});
