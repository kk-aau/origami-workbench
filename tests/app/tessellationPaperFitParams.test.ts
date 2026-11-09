import assert from 'node:assert/strict';
import {test} from 'node:test';
import {changeTessParams,defaultTessPaper,prepareTessResult,readTessPaper,readTessParams,
  tessConstructionKey,tessPreset,TESS_NAMES,type TessFamily,type TessPaperSpec,type TessResponse} from '../../src/app/tessellation';
import {exportDocument,importDocument} from '../../src/core/formats';

const papers:TessPaperSpec[]=[
  {shape:'square',margin:.1},
  {shape:'rectangle',aspect:1.8,margin:.2},
  {shape:'regular',sides:5,margin:.3},
];
const separatePaper=new Set<TessFamily>(['circular-twist','rigid-quad','radial-pot','gore-paper','rectangular-pot',
  'twisted-pot','flasher','paraboloidal-flasher','curved-circle-polyhedral','linked-first-band-polyhedral','discrete-curve-cp',
  'twist-joined-tube','double-joined-tube','closed-twist-topped-tube']);

test('missing paper mode preserves saved extension semantics without inserting a new default',()=>{
  assert.deepEqual(defaultTessPaper(),{shape:'square',margin:.1});
  for(const paper of papers){
    const restored=readTessPaper(paper);
    assert.deepEqual(restored,paper);
    assert.equal(Object.hasOwn(restored!,'fit'),false);
    assert.notEqual(restored,paper);
  }
  const legacy=tessPreset('woven');delete legacy.paper;
  assert.equal(Object.hasOwn(readTessParams(legacy)!,'paper'),false);
  assert.deepEqual(readTessParams({...legacy,paper:{shape:'rectangle',aspect:1.8,margin:.8}})?.paper,
    {shape:'rectangle',aspect:1.8,margin:.8},'old unsupported extension remains readable for explicit UI recovery');
});

test('paper margin bounds depend on the exact mode for all three shapes',()=>{
  for(const paper of papers)for(const fit of [undefined,'extend','inscribed'] as const){
    const max=fit==='inscribed'?.45:1;
    for(const margin of [.02,max]){
      const value={...paper,margin,...(fit?{fit}:{})};
      assert.deepEqual(readTessPaper(value),value);
    }
    for(const margin of [.019999,max+1e-9,NaN,Infinity,-Infinity,'0.1',null])
      assert.equal(readTessPaper({...paper,fit,margin}),null,`${paper.shape}/${fit}: ${String(margin)}`);
  }
});

test('paper shape and mode reject coercion, unknown fields and mixed geometry types',()=>{
  for(const fit of [null,false,0,[],{},new String('inscribed'),'inside','Inscribed','extend '])
    assert.equal(readTessPaper({...papers[0],fit}),null);
  for(const shape of [null,false,0,[],{},new String('square'),'circle','Square'])
    assert.equal(readTessPaper({...papers[0],shape}),null);
  for(const invalid of [null,[],{},
    {...papers[0],fit:'inscribed',aspect:1.2},
    {...papers[0],fit:'extend',sides:4},
    {...papers[1],fit:'inscribed',sides:6},
    {...papers[2],fit:'inscribed',aspect:1},
    {...papers[0],fit:'inscribed',paperMethod:'clip'},
    {...papers[1],fit:'inscribed',aspect:'1.8'},
    {...papers[2],fit:'inscribed',sides:5.5}])assert.equal(readTessPaper(invalid),null);
});

test('all planar family readers preserve both explicit modes, while spatial paper stays separate',()=>{
  for(const family of Object.keys(TESS_NAMES) as TessFamily[])for(const paper of papers)
    for(const fit of ['extend','inscribed'] as const){
      const params={...tessPreset(family),paper:{...paper,fit}};
      if(separatePaper.has(family))assert.equal(readTessParams(params),null,`${family}: ${fit}`);
      else assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params,`${family}: ${paper.shape}/${fit}`);
    }
});

test('changing paper mode invalidates candidate identity and preserves shape and construction parameters',()=>{
  for(const paper of papers){
    const params={...tessPreset('periodic'),paper:{...paper,margin:.8},
      pruneBoundary:[[-.8,-.8],[.8,-.8],[.8,.8],[-.8,.8]] as [number,number][],
      dualTargets:[[0,0],[.2,.2]] as [number,number][]};
    const original=structuredClone(params);
    const inscribed=changeTessParams(params,{paper:{...params.paper,fit:'inscribed',margin:.45}});
    assert.deepEqual(inscribed,{...original,paper:{...original.paper,fit:'inscribed',margin:.45}});
    assert.deepEqual(readTessParams(inscribed),inscribed,'inner clipping allows existing prune and manual dual inputs');
    assert.notEqual(tessConstructionKey(params),tessConstructionKey(inscribed));
    assert.deepEqual(params,original);
    const extended=changeTessParams(inscribed,{paper:{...inscribed.paper!,fit:'extend'}});
    assert.deepEqual(extended.paper,{...paper,margin:.45,fit:'extend'});
  }
});

test('native project serialization restores paper modes and all shape dimensions independently',()=>{
  const response:TessResponse={
    fold:{vertices_coords:[[0,0],[1,0],[1,1],[0,1]],edges_vertices:[[0,1],[1,2],[2,3],[3,0]],edges_assignment:['B','B','B','B']},
    stats:{vertices:4,edges:4,faces:1,tiles:1,checks:{geometry:{status:'passed'},local:{status:'passed'}}},
    warnings:[],source:{algorithm:'paper-read-contract'},
  };
  for(const family of ['woven','woven-lines','polygon-tile','split','brocard','nonperiodic','flagstone'] as const)
    for(const paper of papers)for(const fit of ['extend','inscribed'] as const){
      const params={...tessPreset(family),paper:{...paper,fit}};
      const doc=prepareTessResult(response,params).doc;
      const restored=importDocument(exportDocument(doc,'json').text,'json').doc;
      const saved=(restored.metadata!.tessellation as {parameters:unknown}).parameters;
      assert.deepEqual(readTessParams(saved),params,`${family}: ${paper.shape}/${fit}`);
      assert.notEqual(readTessParams(saved)?.paper,(saved as {paper:unknown}).paper);
    }
});
