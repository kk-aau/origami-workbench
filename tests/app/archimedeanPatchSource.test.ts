import test from 'node:test';
import assert from 'node:assert/strict';
import {ARCHIMEDEAN_PATCH_CATALOG,ARCHIMEDEAN_PATCH_NUMBERS,ARCHIMEDEAN_PATCH_SOURCE,
  archimedeanPatchGeometry,archimedeanPatchParams,archimedeanPatchPreset,
  archimedeanPatchIn3180Preset,archimedeanPatchIn3180LatticePreset,
  archimedeanPatchIn3182Preset,archimedeanPatchIn3185Preset,
  archimedeanPatchIn3186Preset,archimedeanPatchIn3186PrunedPreset,
  archimedeanPatchSourceMatches,readArchimedeanPatchSpec,type ArchimedeanPatchNumber}
  from '../../src/app/archimedeanPatchSource';
import {changeTessParams,defaultTileTwists,readTessParams} from '../../src/app/tessellation';
import {readCustomMeshJson} from '../../src/app/customMeshJson';

const h=Math.sqrt(3)/2,s=Math.sqrt(2);
const expected:Record<ArchimedeanPatchNumber,{
  sides:number[];lattice:[[number,number],[number,number]];
}>={
  1:{sides:[3,3],lattice:[[1,0],[.5,h]]},
  2:{sides:[4],lattice:[[1,0],[0,1]]},
  3:{sides:[6],lattice:[[1.5,h],[0,2*h]]},
  4:{sides:[3,3,3,3,3,3,3,3,6],lattice:[[2.5,h],[.5,3*h]]},
  5:{sides:[3,3,3,3,3,3,3,3,6],lattice:[[2.5,-h],[-.5,3*h]]},
  6:{sides:[3,3,4],lattice:[[1,0],[.5,1+h]]},
  7:{sides:[3,4,3,3,4,3],lattice:[[1+h,.5],[-.5,1+h]]},
  8:{sides:[4,3,4,3,4,6],lattice:[[1+2*h,0],[.5+h,1.5+h]]},
  9:{sides:[3,6,3],lattice:[[2,0],[1,2*h]]},
  10:{sides:[3,12,3],lattice:[[2+2*h,0],[1+h,1.5+2*h]]},
  11:{sides:[4,6,4,6,4,12],lattice:[[1.5+3*h,1.5+h],[0,3+2*h]]},
  12:{sides:[4,8],lattice:[[2+s,0],[1+s/2,1+s/2]]},
};

test('all 12 ordinary saved examples preserve source face order and lattice vectors',()=>{
  assert.deepEqual(ARCHIMEDEAN_PATCH_CATALOG.map(row=>row.number),[...ARCHIMEDEAN_PATCH_NUMBERS]);
  for(const number of ARCHIMEDEAN_PATCH_NUMBERS){
    const geometry=archimedeanPatchGeometry(number),anchor=expected[number];
    assert.deepEqual(geometry.sourceTiles.map(tile=>tile.length),anchor.sides,`n=${number}`);
    for(let axis=0;axis<2;axis++)for(let component=0;component<2;component++)
      assert.ok(Math.abs(geometry.lattice[axis][component]-anchor.lattice[axis][component])<1e-11,
        `n=${number}, lattice=${axis}, component=${component}`);
    assert.deepEqual(geometry.faces.map(face=>face.length),anchor.sides,`n=${number}`);
    const spec=archimedeanPatchPreset(number),params=archimedeanPatchParams(spec);
    assert.deepEqual(params.range1,[0,1]);assert.deepEqual(params.range2,[0,1]);
    assert.equal(params.customOutput,'tiling');
    assert.equal(archimedeanPatchSourceMatches(params,spec),true,`n=${number}`);
    assert.deepEqual(readArchimedeanPatchSpec(JSON.parse(JSON.stringify(params.archimedeanPatch))),spec);
  }
  assert.deepEqual(ARCHIMEDEAN_PATCH_CATALOG[11].notebookIn,[3148,3149,3151]);
});

test('n=9 source triangles and hexagon match independent analytic coordinates',()=>{
  const tiles=archimedeanPatchGeometry(9).sourceTiles;
  const points=[
    [[0,0],[1,0],[.5,h]],
    [[1,0],[2,0],[2.5,h],[2,2*h],[1,2*h],[.5,h]],
    [[2.5,h],[3,2*h],[2,2*h]],
  ];
  for(let face=0;face<points.length;face++)for(let vertex=0;vertex<points[face].length;vertex++)
    for(let axis=0;axis<2;axis++)
      assert.ok(Math.abs(tiles[face][vertex][axis]-points[face][vertex][axis])<1e-11);
});

test('named provenance rejects forged saved geometry, lattice, ranges and source keys',()=>{
  const original=archimedeanPatchParams(archimedeanPatchPreset(8));
  for(const change of [
    (p:typeof original)=>{p.vertices[0][0]+=.001;},
    (p:typeof original)=>{p.faces[0][0]=p.faces[0][1];},
    (p:typeof original)=>{p.lattice![0][0]+=.001;},
    (p:typeof original)=>{p.range1![1]=2;},
    (p:typeof original)=>{p.customOutput='twist';},
    (p:typeof original)=>{p.archimedeanPatch.number=9;},
  ]){
    const forged=structuredClone(original);change(forged);
    assert.equal(archimedeanPatchSourceMatches(forged,forged.archimedeanPatch),false);
  }
  const other=structuredClone(original);
  other.archimedeanPatch.source='TwoColorableArchimedeanPatch' as typeof ARCHIMEDEAN_PATCH_SOURCE;
  assert.equal(readArchimedeanPatchSpec(other.archimedeanPatch),null);
  assert.equal(archimedeanPatchSourceMatches(other,other.archimedeanPatch),false);
});

test('source parser bounds the ordinary namespace and total lattice face count',()=>{
  const valid=archimedeanPatchPreset(2);
  for(const patch of [
    {...valid,number:0},{...valid,number:13},{...valid,number:true},
    {...valid,extra:'unverified'},
    {...valid,range1:[1,0]},{...valid,range1:[0,65]},
    {...valid,range1:[0,191],range2:[0,1]},
    {...archimedeanPatchPreset(4),range1:[0,5],range2:[0,5]},
  ])assert.equal(readArchimedeanPatchSpec(patch),null);
  assert.deepEqual(readArchimedeanPatchSpec({...valid,range1:[-2,2],range2:[0,3]}),
    {...valid,range1:[-2,2],range2:[0,3]});
});

test('all saved 2×2 named sources survive project JSON readback',()=>{
  for(const number of ARCHIMEDEAN_PATCH_NUMBERS){
    const saved=JSON.parse(JSON.stringify(archimedeanPatchParams(archimedeanPatchPreset(number))));
    const restored=readTessParams(saved);
    assert.ok(restored&&restored.family==='custom',`n=${number}`);
    assert.deepEqual(restored.archimedeanPatch,archimedeanPatchPreset(number));
    assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(restored))),restored);
  }
});

test('In[3180] centered pleat-angle patch binds two triangles and survives strict readback',()=>{
  const spec=archimedeanPatchIn3180Preset(),paper={shape:'square' as const,margin:.1};
  const params=archimedeanPatchParams(spec,paper);
  assert.deepEqual([params.range1,params.range2],[[0,0],[0,0]]);
  assert.deepEqual(params.faces.map(face=>face.length),[3,3]);
  assert.equal(params.customOutput,'tile-twists');
  assert.equal(params.pruneBoundary,undefined);
  assert.equal(params.monolithicOptions,undefined);
  assert.deepEqual(params.tileTwists,[
    {width:.2,offset:0,tilt:70,centralTypes:['M','M','M']},
    {width:.2,offset:0,tilt:70,centralTypes:['V','V','V']},
  ]);
  assert.equal(archimedeanPatchSourceMatches(params,spec),true);
  const restored=readTessParams(JSON.parse(JSON.stringify(params)));
  assert.ok(restored&&restored.family==='custom');
  assert.deepEqual(restored.archimedeanPatch,spec);
  assert.deepEqual(restored.paper,paper);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(restored))),restored);
  for(const mutate of [
    (p:typeof params)=>{p.tileTwists![0].tilt=71;},
    (p:typeof params)=>{p.tileTwists![1].centralTypes[0]='M';},
    (p:typeof params)=>{p.tileTwists![0].angleMode='twist';},
    (p:typeof params)=>{p.range1![1]=1;},
    (p:typeof params)=>{p.vertices[0][0]+=.01;},
    (p:typeof params)=>{p.monolithicOptions={mergedEdges:'delete',
      samePtTolerance:1e-8,collinearCleanup:true,collinearTolerance:1e-8};},
  ]){
    const forged=structuredClone(params);mutate(forged);
    assert.equal(readTessParams(forged),null);
  }
  assert.equal(readArchimedeanPatchSpec({...spec,number:2}),null);
  assert.equal(readArchimedeanPatchSpec({...spec,range2:[0,1]}),null);
  const edited=changeTessParams(params,{tileTwists:[
    {...params.tileTwists![0],tilt:71},params.tileTwists![1]]});
  assert.ok(edited.family==='custom');
  assert.equal(edited.archimedeanPatch,undefined);
  const same=readCustomMeshJson(params,JSON.stringify({
    vertices:params.vertices,faces:params.faces}));
  assert.deepEqual(same.archimedeanPatch,spec);
  const changed=structuredClone(params.vertices);changed[0][0]+=.01;
  const imported=readCustomMeshJson(params,JSON.stringify({
    vertices:changed,faces:params.faces}));
  assert.equal(imported.archimedeanPatch,undefined);
});

test('In[3106]+In[3180] 2×2 centered seam keeps its eight-source recipe and provenance',()=>{
  const spec=archimedeanPatchIn3180LatticePreset(),paper={shape:'square' as const,margin:.1};
  const params=archimedeanPatchParams(spec,paper);
  assert.deepEqual([params.range1,params.range2],[[0,1],[0,1]]);
  assert.deepEqual(params.faces.map(face=>face.length),[3,3]);
  assert.equal(params.customOutput,'tile-twists');
  assert.equal(params.pruneBoundary,undefined);
  assert.equal(params.monolithicOptions,undefined);
  assert.deepEqual(params.tileTwists,[
    {width:.2,offset:0,tilt:70,centralTypes:['M','M','M']},
    {width:.2,offset:0,tilt:70,centralTypes:['V','V','V']},
  ]);
  assert.equal(archimedeanPatchSourceMatches(params,spec),true);
  const restored=readTessParams(JSON.parse(JSON.stringify(params)));
  assert.ok(restored&&restored.family==='custom');
  assert.deepEqual(restored.archimedeanPatch,spec);
  assert.deepEqual(restored.paper,paper);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(restored))),restored);
  for(const mutate of [
    (p:typeof params)=>{p.range2![1]=2;},
    (p:typeof params)=>{p.tileTwists![0].tilt=71;},
    (p:typeof params)=>{p.tileTwists![1].centralTypes[0]='M';},
    (p:typeof params)=>{p.lattice![1][0]+=.01;},
    (p:typeof params)=>{p.monolithicOptions={mergedEdges:'delete',
      samePtTolerance:1e-8,collinearCleanup:true,collinearTolerance:1e-8};},
  ]){
    const forged=structuredClone(params);mutate(forged);
    assert.equal(readTessParams(forged),null);
  }
  assert.equal(readArchimedeanPatchSpec({...spec,range1:[0,0]}),null);
  const edited=changeTessParams(params,{tileTwists:[
    {...params.tileTwists![0],tilt:71},params.tileTwists![1]]});
  assert.ok(edited.family==='custom');
  assert.equal(edited.archimedeanPatch,undefined);
});

test('In[3185] named Alt prune binds its fold recipe and survives project readback',()=>{
  const spec=archimedeanPatchIn3185Preset(),params=archimedeanPatchParams(spec);
  assert.equal(params.customOutput,'tile-twists');
  assert.deepEqual(params.range1,[0,3]);
  assert.deepEqual(params.range2,[0,3]);
  assert.deepEqual(params.pruneBoundary,[[0,0],[2.9,0],[2.9,2.9],[0,2.9]]);
  assert.deepEqual(params.tileTwists,[{width:.2,offset:0,angleMode:'twist',
    twistAngle:30,centralTypes:['V','V','M','M']}]);
  assert.equal(archimedeanPatchSourceMatches(params,spec),true);
  const restored=readTessParams(JSON.parse(JSON.stringify(params)));
  assert.ok(restored&&restored.family==='custom');
  assert.deepEqual(restored.archimedeanPatch,spec);
  for(const mutate of [
    (p:typeof params)=>{p.tileTwists![0].twistAngle=31;},
    (p:typeof params)=>{p.pruneBoundary![1][0]=2.8;},
    (p:typeof params)=>{p.monolithicOptions!.collinearCleanup=false;},
    (p:typeof params)=>{p.range2![1]=2;},
  ]){
    const forged=structuredClone(params);mutate(forged);
    assert.equal(readTessParams(forged),null);
  }
  assert.equal(readArchimedeanPatchSpec({...spec,range1:[0,2]}),null);
  assert.equal(readArchimedeanPatchSpec({...archimedeanPatchPreset(8),
    preset:'in3185-alt-pruned'}),null);
  const edited=changeTessParams(params,{tileTwists:[{...params.tileTwists![0],twistAngle:31}]});
  assert.ok(edited.family==='custom');
  assert.equal(edited.archimedeanPatch,undefined);
  const same=readCustomMeshJson(params,JSON.stringify({
    vertices:params.vertices,faces:params.faces}));
  assert.deepEqual(same.archimedeanPatch,spec);
  const changed=structuredClone(params.vertices);changed[0][0]+=.01;
  const imported=readCustomMeshJson(params,JSON.stringify({
    vertices:changed,faces:params.faces}));
  assert.equal(imported.archimedeanPatch,undefined);
});

for(const [inNumber,preset,source,twist,types,hasMonolithic] of [
  [3182,archimedeanPatchIn3182Preset,6,25,['MMM','VVV','MMMM'],false],
  [3186,archimedeanPatchIn3186Preset,8,29,
    ['MMMM','VVV','MMMM','VVV','MMMM','VVVVVV'],true],
] as const){
  test(`In[${inNumber}] single-patch Alt source survives strict readback and source edits`,()=>{
    const spec=preset(),paper={shape:'square' as const,margin:.1};
    const params=archimedeanPatchParams(spec,paper);
    assert.equal(spec.number,source);
    assert.deepEqual([params.range1,params.range2],[[0,0],[0,0]]);
    assert.equal(params.customOutput,'tile-twists');
    assert.equal(params.pruneBoundary,undefined);
    assert.equal(params.tileTwists?.length,types.length);
    assert.equal(params.monolithicOptions!==undefined,hasMonolithic);
    assert.deepEqual(params.tileTwists?.map(option=>option.centralTypes.join('')),types);
    assert.ok(params.tileTwists?.every(option=>option.angleMode==='twist'&&
      option.twistAngle===twist&&option.offset===0&&
      option.width===(source===6 ? .2 : .12)));
    assert.equal(archimedeanPatchSourceMatches(params,spec),true);
    const restored=readTessParams(JSON.parse(JSON.stringify(params)));
    assert.ok(restored&&restored.family==='custom');
    assert.deepEqual(restored.archimedeanPatch,spec);
    assert.deepEqual(restored.paper,paper);
    assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(restored))),restored);
    for(const mutate of [
      (p:typeof params)=>{p.tileTwists![0].twistAngle++;},
      (p:typeof params)=>{p.tileTwists![0].centralTypes[0]=
        p.tileTwists![0].centralTypes[0]==='M'?'V':'M';},
      (p:typeof params)=>{p.range1![1]=1;},
      (p:typeof params)=>{p.vertices[0][0]+=.01;},
      (p:typeof params)=>{p.monolithicOptions=hasMonolithic?undefined:
        {mergedEdges:'delete',samePtTolerance:1e-8,
          collinearCleanup:true,collinearTolerance:1e-8};},
    ]){
      const forged=structuredClone(params);mutate(forged);
      assert.equal(readTessParams(forged),null);
    }
    assert.equal(readArchimedeanPatchSpec({...spec,range2:[0,1]}),null);
    assert.equal(readArchimedeanPatchSpec({...spec,number:2}),null);
    const edited=changeTessParams(params,{tileTwists:[
      {...params.tileTwists![0],twistAngle:twist+1},...params.tileTwists!.slice(1)]});
    assert.ok(edited.family==='custom');
    assert.equal(edited.archimedeanPatch,undefined);
    const same=readCustomMeshJson(params,JSON.stringify({
      vertices:params.vertices,faces:params.faces}));
    assert.deepEqual(same.archimedeanPatch,spec);
    const changed=structuredClone(params.vertices);changed[0][0]+=.01;
    const imported=readCustomMeshJson(params,JSON.stringify({
      vertices:changed,faces:params.faces}));
    assert.equal(imported.archimedeanPatch,undefined);
  });
}

test('In[3186] full pruned Alt binds 120-source extent, crop and source provenance',()=>{
  const spec=archimedeanPatchIn3186PrunedPreset();
  const paper={shape:'square' as const,margin:.1};
  const params=archimedeanPatchParams(spec,paper);
  assert.deepEqual([params.range1,params.range2],[[-2,2],[-1,2]]);
  assert.equal(params.customOutput,'tile-twists');
  assert.deepEqual(params.pruneBoundary,
    [[.1,.1],[3.9,.1],[3.9,3.9],[.1,3.9]]);
  assert.deepEqual(params.monolithicOptions,
    {mergedEdges:'delete',samePtTolerance:1e-8,
      collinearCleanup:true,collinearTolerance:1e-8});
  assert.deepEqual(params.tileTwists?.map(option=>option.centralTypes.join('')),
    ['MMMM','VVV','MMMM','VVV','MMMM','VVVVVV']);
  assert.ok(params.tileTwists?.every(option=>option.angleMode==='twist'&&
    option.twistAngle===29&&option.width===.12&&option.offset===0));
  assert.equal(archimedeanPatchSourceMatches(params,spec),true);
  const restored=readTessParams(JSON.parse(JSON.stringify(params)));
  assert.ok(restored&&restored.family==='custom');
  assert.deepEqual(restored.archimedeanPatch,spec);
  assert.deepEqual(restored.paper,paper);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(restored))),restored);
  for(const mutate of [
    (p:typeof params)=>{p.tileTwists![0].twistAngle=30;},
    (p:typeof params)=>{p.tileTwists![1].centralTypes[0]='M';},
    (p:typeof params)=>{p.pruneBoundary![1][0]=3.8;},
    (p:typeof params)=>{p.monolithicOptions!.mergedEdges='retain';},
    (p:typeof params)=>{p.range1![0]=-1;},
    (p:typeof params)=>{p.vertices[0][0]+=.01;},
    (p:typeof params)=>{p.archimedeanPatch.preset='in3186-alt-single';},
  ]){
    const forged=structuredClone(params);mutate(forged);
    assert.equal(readTessParams(forged),null);
  }
  assert.equal(readArchimedeanPatchSpec({...spec,range1:[-2,1]}),null);
  assert.equal(readArchimedeanPatchSpec({...spec,number:6}),null);
  assert.equal(readArchimedeanPatchSpec({...archimedeanPatchIn3186Preset(),
    preset:'in3186-alt-pruned'}),null);
  const edited=changeTessParams(params,{pruneBoundary:undefined});
  assert.ok(edited.family==='custom');
  assert.equal(edited.archimedeanPatch,undefined);
  const reangled=changeTessParams(params,{tileTwists:[
    {...params.tileTwists![0],twistAngle:30},...params.tileTwists!.slice(1)]});
  assert.ok(reangled.family==='custom');
  assert.equal(reangled.archimedeanPatch,undefined);
  const same=readCustomMeshJson(params,JSON.stringify({
    vertices:params.vertices,faces:params.faces}));
  assert.deepEqual(same.archimedeanPatch,spec);
  const changed=structuredClone(params.vertices);changed[0][0]+=.01;
  const imported=readCustomMeshJson(params,JSON.stringify({
    vertices:changed,faces:params.faces}));
  assert.equal(imported.archimedeanPatch,undefined);
});

test('ordinary named mother keeps an explicitly selected paper on source changes',()=>{
  const paper={shape:'square' as const,margin:.1};
  const first=archimedeanPatchParams(archimedeanPatchPreset(2),paper);
  const second=archimedeanPatchParams(archimedeanPatchPreset(9),first.paper);
  const restored=readTessParams(JSON.parse(JSON.stringify(second)));
  assert.ok(restored&&restored.family==='custom');
  assert.deepEqual(restored.paper,paper);
  assert.deepEqual(restored.archimedeanPatch,archimedeanPatchPreset(9));
});

test('project readback rejects forged named source and editing invalidates provenance',()=>{
  const original=archimedeanPatchParams(archimedeanPatchPreset(8));
  for(const edit of [
    (p:typeof original)=>{p.vertices[0][0]+=.001;},
    (p:typeof original)=>{p.lattice![0][0]+=.001;},
    (p:typeof original)=>{p.range2![1]=2;},
    (p:typeof original)=>{p.archimedeanPatch.number=7;},
  ]){
    const saved=structuredClone(original);edit(saved);
    assert.equal(readTessParams(saved),null);
  }
  assert.equal(readTessParams({...original,unitTriangle:{}}),null);
  const edited=changeTessParams(original,{vertices:original.vertices.map(([x,y],i)=>[x+(i===0?.01:0),y])});
  assert.ok(edited.family==='custom');
  assert.equal(edited.archimedeanPatch,undefined);
  const same=readCustomMeshJson(original,JSON.stringify({vertices:original.vertices,faces:original.faces}));
  assert.deepEqual(same.archimedeanPatch,original.archimedeanPatch);
  const changedVertices=structuredClone(original.vertices);changedVertices[0][0]+=.01;
  const changed=readCustomMeshJson(original,JSON.stringify({vertices:changedVertices,faces:original.faces}));
  assert.equal(changed.archimedeanPatch,undefined);
});

test('40 tile twists require a valid pruning boundary before front-end readback',()=>{
  const vertices:[number,number][]=[],faces:number[][]=[];
  for(let y=0;y<=8;y++)for(let x=0;x<=5;x++)vertices.push([x,y]);
  for(let y=0;y<8;y++)for(let x=0;x<5;x++){
    const a=y*6+x;faces.push([a,a+1,a+7,a+6]);
  }
  const raw={family:'custom',vertices,faces,repeatX:1,repeatY:1,
    angle:36,scale:.3,customOutput:'tile-twists',tileTwists:defaultTileTwists(faces)};
  assert.equal(readTessParams(raw),null);
  const cropped=readTessParams({...raw,pruneBoundary:[[.1,.1],[4.9,.1],[4.9,6.9],[.1,6.9]]});
  assert.ok(cropped&&cropped.family==='custom');
  assert.equal(cropped.faces.length,40);
  assert.equal(readTessParams({...raw,pruneBoundary:[[0,0],[1,1],[0,1],[1,0]]}),null);
});
