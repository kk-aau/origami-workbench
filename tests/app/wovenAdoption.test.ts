import assert from 'node:assert/strict';
import {test} from 'node:test';
import {canAdoptTessWithTileLayers,needsTessellationLayerCheck,prepareTessResult,
 readTessParams,tessConstructionKey,tessPreset,type TessParams,type TessResponse} from '../../src/app/tessellation';
import {wovenPreset} from '../../src/app/wovenParams';
import {exportDocument,importDocument} from '../../src/core/formats';

// Locally valid input is deliberately insufficient proof of a global layer order.
const response:TessResponse={
 fold:{vertices_coords:[[0,0],[1,0],[1,1],[0,1]],edges_vertices:[[0,1],[1,2],[2,3],[3,0]],edges_assignment:['B','B','B','B']},
 stats:{vertices:4,edges:4,faces:1,tiles:1,checks:{geometry:{status:'passed'},local:{status:'passed'}}},
 warnings:[],source:{algorithm:'layer-gate-test'},
};
const weaves=['plain','basket','twill'] as const;
const woven=()=>{const params=tessPreset('woven');assert.equal(params.family,'woven');return params;};

test('every bare box weave and both phases require a solved whole-sheet layer order',()=>{
 for(const weave of weaves)for(const phase of [0,1]){
  const params={...woven(),weave,phase};delete params.paper;
  const result=prepareTessResult(response,params),key=tessConstructionKey(params);
  assert.equal(needsTessellationLayerCheck(params),true);
  // Even a mislabeled tiling response cannot exempt a weaving construction.
  assert.equal(needsTessellationLayerCheck(params,true),true);
  for(const status of [undefined,'checking','incomplete','unconfirmed','invalid','no-solution','timeout','cancelled','error','solved-extra'])
   assert.equal(canAdoptTessWithTileLayers(result,false,key,params,status),false,`${weave} phase ${phase}: ${status}`);
  assert.equal(canAdoptTessWithTileLayers(result,false,key,params,'solved'),true);
  assert.equal(canAdoptTessWithTileLayers(result,true,key,params,'solved'),false);
  assert.equal(canAdoptTessWithTileLayers(result,false,key,{...params,width:.3},'solved'),false);
  assert.equal(canAdoptTessWithTileLayers(null,false,key,params,'solved'),false);
  for(const kind of ['geometry','local'] as const){
   const invalid=structuredClone(result);invalid.stats.checks[kind].status='failed';
   assert.equal(canAdoptTessWithTileLayers(invalid,false,key,params,'solved'),false);
  }
 }
});

test('line-group and paper-framed box weaves share the same layer requirement',()=>{
 const params:TessParams[]=[wovenPreset('lines'),wovenPreset('chord'),wovenPreset('random'),
  {...woven(),paper:{shape:'square',margin:.1}}];
 for(const p of params){
  const result=prepareTessResult(response,p),key=tessConstructionKey(p);
  assert.equal(needsTessellationLayerCheck(p),true);
  for(const status of [undefined,'incomplete','no-solution','unconfirmed'])
   assert.equal(canAdoptTessWithTileLayers(result,false,key,p,status),false);
  assert.equal(canAdoptTessWithTileLayers(result,false,key,p,'solved'),true);
 }
});

test('legacy box-weave projects keep all controls through native serialization and reload',()=>{
 for(const weave of weaves)for(const phase of [0,1])for(const paper of [undefined,{shape:'rectangle' as const,aspect:1.5,margin:.1}]){
  const params={...woven(),rows:2,columns:6,width:.2,weave,phase,...(paper?{paper}:{})};
  const result=prepareTessResult(response,params);
  const restored=importDocument(exportDocument(result.doc,'json').text,'json').doc;
  const saved=(restored.metadata?.tessellation as {parameters:unknown}).parameters;
  assert.deepEqual(readTessParams(saved),params);
  assert.notEqual(readTessParams(saved),saved);
 }
 assert.deepEqual(readTessParams({family:'woven'}),woven(),'old partial records still receive their original defaults');
});

test('mislabeled line-group parameters cannot silently load a default box weave',()=>{
 const base=woven();
 const lineOnlyFields={mode:'lines',lines:[[0,.2,1]],boundary:[[-1,-1],[1,-1],[1,1],[-1,1]],
  parity:1,minPleat:1,minBorderPleat:.01,borderInset:'auto',stationaryFace:0,
  periodicity:[[0,1]],segmentInsets:[{line:0,from:[0,0],to:[1,0],inset:.1}]};
 for(const [field,value] of Object.entries(lineOnlyFields))
  assert.equal(readTessParams({...base,[field]:value}),null,field);
 assert.equal(readTessParams({...wovenPreset('lines'),family:'woven',width:.2}),null);
 assert.equal(readTessParams({...base,family:'woven-lines'}),null);
 assert.equal(readTessParams({...base,unexpected:true}),null);
 assert.deepEqual(readTessParams(base),base);
});
