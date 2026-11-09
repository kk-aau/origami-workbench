import assert from 'node:assert/strict';
import {test} from 'node:test';
import {defaultTileTwists,readTessParams,tessPreset,TESS_NAMES,type TessFamily,type TessPaperSpec} from '../../src/app/tessellation';
import {wovenPreset} from '../../src/app/wovenParams';
import {twoColorableArchimedeanParams,twoColorableArchimedeanPreset} from '../../src/app/twoColorableArchimedeanPatchSource';

const papers:(TessPaperSpec|undefined)[]=[undefined,{shape:'square',margin:.1,fit:'inscribed'}];
const generic:TessFamily[]=['twist','periodic','primal-dual','archimedean','nonperiodic','custom','ring','flagstone','woven'];
const lineFields={lines:[[0,0,1]],parity:1,minPleat:1,minBorderPleat:.01,borderInset:'auto',
  periodicity:[[0,1]],segmentInsets:[{line:0,from:[0,0],to:[1,0],inset:.1}],minDistance:.15,maxTries:500,order:7};

test('wrong generic family tags reject each recognized line-weaving field instead of loading a default construction',()=>{
  for(const family of generic)for(const paper of papers)for(const [field,value] of Object.entries(lineFields)){
    const params={...tessPreset(family),...(paper?{paper}:{}),[field]:value};
    assert.equal(readTessParams(params),null,`${family}: ${field}/${paper?.fit??'legacy'}`);
  }
  for(const family of generic)for(const mode of ['lines','chord','random'] as const){
    assert.equal(readTessParams({...tessPreset(family),mode}),null,`${family}: bare ${mode} discriminator`);
    assert.equal(readTessParams({...wovenPreset(mode),family,paper:papers[1]}),null,`${family}: wrong ${mode} record`);
  }
});

test('box-weave fields belong only to the box-weave family',()=>{
  for(const family of Object.keys(TESS_NAMES) as TessFamily[])if(family!=='woven'){
    for(const field of ['weave','phase'] as const)
      assert.equal(readTessParams({...tessPreset(family),[field]:field==='weave'?'twill':1}),null,`${family}: ${field}`);
  }
  for(const weave of ['plain','basket','twill'])for(const phase of [0,1])for(const paper of papers){
    const params={...tessPreset('woven'),weave,phase,...(paper?{paper}:{})};
    assert.deepEqual(readTessParams(params),params);
  }
});

test('legacy generic partial records and unrelated historical extension fields still restore',()=>{
  for(const family of generic.filter(family=>family!=='woven')){
    const partial={family,legacyDisplayNote:'older extension',paper:papers[1]};
    const restored=readTessParams(partial);
    assert.ok(restored,family);assert.equal(restored.family,family);
    assert.deepEqual(restored.paper,papers[1]);
  }
  const legacy=readTessParams({tiling:'hexagon',rings:2,angle:36,scale:.5,paper:papers[1]});
  assert.deepEqual(legacy,{family:'primal-dual',tiling:'hexagon',rings:2,angle:36,scale:.5,paper:papers[1]});
  for(const family of [null,false,0,[],{},'unknown','__proto__','toString'])
    assert.equal(readTessParams({family,paper:papers[1]}),null);
});

test('shared clipping boundaries and custom stationary faces remain legal',()=>{
  const boundary:[number,number][]=[[-1,-1],[1,-1],[1,1],[-1,1]];
  const voronoi={...tessPreset('nonperiodic'),boundary,paper:papers[1]};
  assert.deepEqual(readTessParams(voronoi),voronoi);
  const base=tessPreset('custom');
  const custom={...base,customOutput:'tile-twists' as const,tileTwists:defaultTileTwists(base.faces),stationaryFace:0,paper:papers[1]};
  const restored=readTessParams(custom);
  assert.ok(restored&&restored.family==='custom');assert.equal(restored.stationaryFace,0);assert.deepEqual(restored.paper,papers[1]);
  for(const mode of ['lines','chord','random'] as const){
    const params={...wovenPreset(mode),paper:papers[1]};
    assert.deepEqual(readTessParams(params),params,`${mode} retains its genuine family inputs`);
  }
});

test('nested two-colorable tile parity is independent of top-level weaving parity',()=>{
  const params=twoColorableArchimedeanParams(twoColorableArchimedeanPreset(2,'mother'));
  assert.deepEqual(readTessParams({...params,paper:papers[1]}),{...params,paper:papers[1]});
});


test('Graph tolerance guards preserve the original rigid-quad shared option',()=>{
  const rigid=tessPreset('rigid-quad');
  for(const samePtTolerance of [null,0,1e-6]){
    const input={...rigid,samePtTolerance};
    assert.deepEqual(readTessParams(input),input);
    assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(input))),input);
  }
  assert.equal(readTessParams({...rigid,intersectionTolerance:1e-6}),null);
  for(const family of generic)for(const key of ['samePtTolerance','intersectionTolerance'])
    assert.equal(readTessParams({...tessPreset(family),[key]:1e-6}),null,family+': '+key);
});
