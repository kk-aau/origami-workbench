import test from 'node:test';
import assert from 'node:assert/strict';
import {archimedeanPatchGeometry,archimedeanPatchParams,archimedeanPatchPreset}
  from '../../src/app/archimedeanPatchSource';
import {TWO_COLORABLE_ARCHIMEDEAN_NUMBERS,TWO_COLORABLE_ARCHIMEDEAN_SOURCE,
  readTwoColorableArchimedeanSpec,twoColorableArchimedeanGeometry,
  twoColorableArchimedeanParams,twoColorableArchimedeanPreset}
  from '../../src/app/twoColorableArchimedeanPatchSource';
import {changeTessParams,readTessParams} from '../../src/app/tessellation';
import {readCustomMeshJson} from '../../src/app/customMeshJson';

test('four distinct two-colorable sources retain canonical parity and saved 2×2 JSON',()=>{
  const parity={1:[1,-1],2:[1,-1],8:[1,-1,1,-1,1,-1],9:[1,-1,1]};
  const faces={1:2,2:2,8:6,9:3};
  for(const number of TWO_COLORABLE_ARCHIMEDEAN_NUMBERS){
    const geometry=twoColorableArchimedeanGeometry(number);
    assert.deepEqual(geometry.parity,parity[number]);
    assert.equal(geometry.faces.length,faces[number]);
    const spec=twoColorableArchimedeanPreset(number);
    const restored=readTessParams(JSON.parse(JSON.stringify(twoColorableArchimedeanParams(spec))));
    assert.ok(restored&&restored.family==='custom',`n=${number}`);
    assert.deepEqual(restored.twoColorableArchimedeanPatch,spec);
    assert.equal(restored.customOutput,'tiling');
    assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(restored))),restored);
    if(number!==2){
      const ordinary=archimedeanPatchGeometry(number);
      assert.deepEqual(geometry.sourceTiles,ordinary.sourceTiles);
      assert.deepEqual(geometry.lattice,ordinary.lattice);
    }
  }
});

test('two-colorable n=2 uses two squares and (2,0),(1,1), unlike ordinary n=2',()=>{
  const colored=twoColorableArchimedeanGeometry(2),ordinary=archimedeanPatchGeometry(2);
  assert.deepEqual(colored.sourceTiles,[
    [[0,0],[1,0],[1,1],[0,1]],
    [[1,0],[2,0],[2,1],[1,1]],
  ]);
  assert.deepEqual(colored.lattice,[[2,0],[1,1]]);
  assert.equal(ordinary.faces.length,1);
  assert.ok(Math.abs(ordinary.lattice[0][0]-1)<1e-12&&Math.abs(ordinary.lattice[0][1])<1e-12);
  assert.ok(Math.abs(ordinary.lattice[1][0])<1e-12&&Math.abs(ordinary.lattice[1][1]-1)<1e-12);
  assert.notDeepEqual(twoColorableArchimedeanParams(twoColorableArchimedeanPreset(2)).faces,
    archimedeanPatchParams(archimedeanPatchPreset(2)).faces);
});

test('three n=2 saved presets read back exact patch, range, parity and twist options',()=>{
  for(const preset of ['in3184-offset','in3187-alt-pruned','in3188-offset-pruned'] as const){
    const spec=twoColorableArchimedeanPreset(2,preset),params=twoColorableArchimedeanParams(spec);
    const restored=readTessParams(JSON.parse(JSON.stringify(params)));
    assert.ok(restored&&restored.family==='custom',preset);
    assert.deepEqual(restored.twoColorableArchimedeanPatch,spec);
    assert.equal(restored.customOutput,'tile-twists');
    assert.deepEqual(restored.twoColorableArchimedeanPatch.parity,[1,-1]);
    assert.deepEqual(restored.monolithicOptions,{
      mergedEdges:'delete',samePtTolerance:1e-8,collinearCleanup:true,collinearTolerance:1e-8,
    });
    if(preset==='in3184-offset'){
      assert.equal(restored.lattice,undefined);
      assert.equal(restored.pruneBoundary,undefined);
      assert.deepEqual(restored.tileTwists?.map(tile=>tile.offset),[.1,-.1]);
      assert.deepEqual(restored.tileTwists?.map(tile=>tile.centralTypes.join('')),["MMMM","MMMM"]);
    }else{
      assert.deepEqual(restored.lattice,[[2,0],[1,1]]);
      assert.deepEqual(restored.range1,[-2,2]);assert.deepEqual(restored.range2,[0,3]);
      assert.deepEqual(restored.pruneBoundary,[[.1,.1],[3.9,.1],[3.9,3.9],[.1,3.9]]);
      assert.equal(restored.faces.length*(restored.range1![1]-restored.range1![0]+1)*
        (restored.range2![1]-restored.range2![0]+1),40);
      if(preset==='in3187-alt-pruned'){
        assert.deepEqual(restored.tileTwists?.map(tile=>tile.twistAngle),[30,30]);
        assert.deepEqual(restored.tileTwists?.map(tile=>tile.centralTypes.join('')),["MMMM","VVVV"]);
      }else assert.deepEqual(restored.tileTwists?.map(tile=>tile.offset),[.1001,-.1001]);
      assert.equal(readTessParams({...restored,pruneBoundary:undefined}),null);
    }
  }
});

test('two-colorable provenance rejects forged parity, source, geometry and preset options',()=>{
  const original=twoColorableArchimedeanParams(twoColorableArchimedeanPreset(2,'in3188-offset-pruned'));
  for(const edit of [
    (p:typeof original)=>{p.twoColorableArchimedeanPatch.parity[1]=1;},
    (p:typeof original)=>{p.twoColorableArchimedeanPatch.number=1;},
    (p:typeof original)=>{p.twoColorableArchimedeanPatch.source='Ordinary' as typeof TWO_COLORABLE_ARCHIMEDEAN_SOURCE;},
    (p:typeof original)=>{p.vertices[0][0]+=.01;},
    (p:typeof original)=>{p.lattice![0][0]+=.01;},
    (p:typeof original)=>{p.tileTwists![1].offset=-.1;},
    (p:typeof original)=>{p.pruneBoundary![0][0]+=.01;},
    (p:typeof original)=>{p.monolithicOptions!.mergedEdges='retain';},
  ]){
    const forged=structuredClone(original);edit(forged);
    assert.equal(readTessParams(forged),null);
  }
  assert.equal(readTessParams({...original,archimedeanPatch:archimedeanPatchPreset(2)}),null);
  assert.equal(readTwoColorableArchimedeanSpec({...twoColorableArchimedeanPreset(2),extra:true}),null);
  assert.equal(readTwoColorableArchimedeanSpec({...twoColorableArchimedeanPreset(2),parity:[1,1]}),null);
  assert.equal(readTwoColorableArchimedeanSpec({...twoColorableArchimedeanPreset(2),number:3}),null);
  assert.equal(readTwoColorableArchimedeanSpec({...twoColorableArchimedeanPreset(8),range1:[0,8],range2:[0,8]}),null);
});

test('mesh edits retain two-colorable provenance only for unchanged geometry',()=>{
  const paper={shape:'square' as const,margin:.1};
  const source=twoColorableArchimedeanParams(twoColorableArchimedeanPreset(2),paper);
  const restored=readTessParams(source);
  assert.ok(restored&&restored.family==='custom');
  assert.deepEqual(restored.paper,paper);
  const same=readCustomMeshJson(source,JSON.stringify({vertices:source.vertices,faces:source.faces}));
  assert.deepEqual(same.twoColorableArchimedeanPatch,source.twoColorableArchimedeanPatch);
  const vertices=structuredClone(source.vertices);vertices[0][0]+=.01;
  const edited=readCustomMeshJson(source,JSON.stringify({vertices,faces:source.faces}));
  assert.equal(edited.twoColorableArchimedeanPatch,undefined);
  const pruned=changeTessParams(source,{pruneBoundary:[[.1,.1],[1.9,.1],[1.9,.9],[.1,.9]]});
  assert.ok(pruned.family==='custom');
  assert.equal(pruned.twoColorableArchimedeanPatch,undefined);
});
