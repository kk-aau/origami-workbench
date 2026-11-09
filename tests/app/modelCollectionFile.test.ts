import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportModelCollection,prepareModelCollection} from '../../src/app/modelCollectionFile';
import {emptyFoldedModelCollection,foldedModelCollectionReducer as reduce,activeFoldedModel,countFoldedModelsForCp} from '../../src/app/foldedModelCollection';
import {foldSourceCpKey} from '../../src/app/foldSelection';
import {blankDoc} from '../../src/app/state';
import {buildFold} from '../../src/core/geometry';
import {computeFlatFold} from '../../src/core/flatFold';
import {moveFoldedVertices} from '../../src/app/foldedVertexEdit';

function fixture(){
  const a=blankDoc('源A',100,100),b=blankDoc('源B',150,120),editor=blankDoc('正在编辑，非模型源',200,180);
  let models=emptyFoldedModelCollection();
  for(const [i,doc] of [a,b].entries())models=reduce(models,{type:'add',id:String(i),name:`模型${i}`,source:{doc,graph:buildFold(doc).graph},result:computeFlatFold(doc)});
  models=reduce(models,{type:'edit',action:{type:'commit',result:moveFoldedVertices(activeFoldedModel(models)!.history.present!,{group:[0],selected:[0]},[-10,-20])}});
  models=reduce(models,{type:'select',id:'0'});return {editor,models};
}
test('collection roundtrip preserves distinct sources, edited shapes, order and active ID',()=>{
  const {editor,models}=fixture(),before=structuredClone({editor,models}),text=exportModelCollection(editor,models),loaded=prepareModelCollection(text);
  assert.deepEqual(loaded.doc,editor);assert.equal(loaded.collection.activeId,'0');assert.deepEqual(loaded.collection.entries.map(e=>e.name),['模型0','模型1']);
  for(let i=0;i<2;i++){assert.deepEqual(loaded.collection.entries[i].source.doc,models.entries[i].source.doc);assert.deepEqual(loaded.collection.entries[i].history.present!.geometry.vertices,models.entries[i].history.present!.geometry.vertices);}
  assert.deepEqual({editor,models},before);
});
test('file excludes undo history, solver caches and old confirmed layers',()=>{
  const {editor,models}=fixture(),text=exportModelCollection(editor,models);assert.equal(models.entries[1].history.past.length,1);
  assert.ok(!text.includes('faceOrders'));assert.ok(!text.includes('"past"'));assert.ok(!text.includes('"layers"'));
  for(const entry of prepareModelCollection(text).collection.entries){assert.equal(entry.history.past.length,0);assert.equal(entry.history.future.length,0);assert.equal(entry.history.present!.layers.status,'unknown');assert.equal(entry.history.present!.geometry.modified,true);}
});
test('invalid later snapshot rejects the whole file without changing the input collection',()=>{
  const {editor,models}=fixture(),before=structuredClone(models),raw=JSON.parse(exportModelCollection(editor,models));raw.models[1].snapshot.model.basis.edges[0]=[999,998];
  assert.throws(()=>prepareModelCollection(JSON.stringify(raw)),/拓扑/);assert.deepEqual(models,before);
});
test('rejects duplicate IDs, missing active, unknown fields and versions',()=>{
  const {editor,models}=fixture(),raw=JSON.parse(exportModelCollection(editor,models));
  for(const modify of [(r:any)=>r.models[1].id=r.models[0].id,(r:any)=>r.activeId='missing',(r:any)=>r.models[0].untrusted=1,(r:any)=>r.version=999,(r:any)=>r.models=[],(r:any)=>r.models[0].name='']){const input=structuredClone(raw);modify(input);assert.throws(()=>prepareModelCollection(JSON.stringify(input)));}
  assert.throws(()=>exportModelCollection(editor,reduce(models,{type:'detach'})),/活动模型/);
});
test('invalid JSON and isolated roundtrip objects prevent unsafe publication',()=>{
  assert.throws(()=>prepareModelCollection('{broken'),/JSON/);
  const {editor,models}=fixture(),loaded=prepareModelCollection(exportModelCollection(editor,models));loaded.collection.entries[0].source.doc.name='changed';loaded.doc.name='edited';assert.equal(editor.name,'正在编辑，非模型源');assert.equal(models.entries[0].source.doc.name,'源A');
});

test('source CP grouping persists explicitly and old v1/v2 collections derive the same identity',()=>{
 const {editor,models}=fixture();models.entries[0].source.cpKey='saved-cp-group';
 const raw=JSON.parse(exportModelCollection(editor,models));assert.equal(raw.version,3);assert.equal(raw.models[0].cpKey,'saved-cp-group');
 assert.equal(prepareModelCollection(JSON.stringify(raw)).collection.entries[0].source.cpKey,'saved-cp-group');
 for(const version of [1,2]){
  const legacy=structuredClone(raw);legacy.version=version;
  for(const entry of legacy.models){delete entry.cpKey;if(version===1)delete entry.view;}
  const loaded=prepareModelCollection(JSON.stringify(legacy)).collection;
  assert.equal(loaded.entries[0].source.cpKey,foldSourceCpKey(loaded.entries[0].source.doc));
 }
 for(const cpKey of ['',null,0,'bad\nkey']){const invalid=structuredClone(raw);invalid.models[1].cpKey=cpKey;assert.throws(()=>prepareModelCollection(JSON.stringify(invalid)),/来源标识/);}
});

test('legacy collections above four results restore without loss but cannot create a fifth result',()=>{
 const {editor,models}=fixture(),raw=JSON.parse(exportModelCollection(editor,models));raw.version=2;
 const saved=raw.models[0];delete saved.cpKey;raw.models=Array.from({length:6},(_,index)=>({...structuredClone(saved),id:`old-${index}`}));raw.activeId='old-3';
 const restored=prepareModelCollection(JSON.stringify(raw)).collection,key=restored.entries[0].source.cpKey!;
 assert.equal(restored.entries.length,6);assert.equal(restored.activeId,'old-3');assert.equal(countFoldedModelsForCp(restored,key),6);
 assert.throws(()=>reduce(restored,{type:'snapshot-copy',id:'seventh',name:'seventh'}),/最多保留 4/);
 assert.equal(prepareModelCollection(exportModelCollection(editor,restored)).collection.entries.length,6);
});

test('large editor and model source metadata survive collection export and reopen above 32 MiB',()=>{
  const {editor,models}=fixture();editor.metadata={padding:'字'.repeat(3_000_000)};
  models.entries[0].source.doc.metadata={padding:'x'.repeat(33*1024*1024)};
  const text=exportModelCollection(editor,models);assert.ok(Buffer.byteLength(text)>32*1024*1024);
  const loaded=prepareModelCollection(text);assert.deepEqual(loaded.doc,editor);
  assert.deepEqual(loaded.collection.entries[0].source.doc,models.entries[0].source.doc);
});
