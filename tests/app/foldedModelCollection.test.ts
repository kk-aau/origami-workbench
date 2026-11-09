import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyFoldedModelCollection,foldedModelCollectionReducer as reduce,activeFoldedModel,modelAnalysisTicket,collectionHasUnsavedEdits,countFoldedModelsForCp,MAX_FOLDED_MODELS_PER_CP} from '../../src/app/foldedModelCollection';
import {blankDoc} from '../../src/app/state';
import {buildFold} from '../../src/core/geometry';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {moveFoldedVertices} from '../../src/app/foldedVertexEdit';
import {flatFoldPublication} from '../../src/app/flatFoldPublication';
import {acquireModelSurface,rememberCompletedModelSurface} from '../../src/app/modelOverlapTask';

const fixture=()=>{const doc=blankDoc('源工程',100,100);return {source:{doc,graph:buildFold(doc).graph},result:computeFlatFold(doc)};};
const initial=()=>reduce(emptyFoldedModelCollection(),{type:'add',id:'a',name:'模型A',...fixture()});
const move=(state:ReturnType<typeof initial>)=>reduce(state,{type:'edit',action:{type:'commit',result:moveFoldedVertices(activeFoldedModel(state)!.history.present!,{group:[0],selected:[0]},[-10,-20])}});

test('retained models and snapshot copies reuse completed paper without sharing editable result objects',async()=>{
 const doc=blankDoc('缓存模型',16,16);for(let i=1;i<16;i++)doc.segments.push({id:`x${i}`,a:[i,0],b:[i,16],assignment:'F',angle:0},{id:`y${i}`,a:[0,i],b:[16,i],assignment:'F',angle:0});
 const result=computeFlatFold(doc),publication=flatFoldPublication(result);assert.ok(publication.surface?.status==='complete'&&publication.surface.exact);rememberCompletedModelSurface(result,publication.surface);
 const state=reduce(emptyFoldedModelCollection(),{type:'add',id:'a',name:'A',source:{doc,graph:buildFold(doc).graph},result}),copied=reduce(state,{type:'snapshot-copy',id:'b',name:'B'});
 assert.notEqual(copied.entries[0].history.present,copied.entries[1].history.present);assert.notEqual(copied.entries[0].history.present,result);
 const Native=globalThis.Worker;let made=0;globalThis.Worker=class{constructor(){made++;throw Error('retained model must not recalculate');}} as unknown as typeof Worker;
 try{for(const entry of copied.entries){const task=acquireModelSurface(entry.history.present!,'front',true);assert.equal((await task.promise).status,'complete');task.cancel();}assert.equal(made,0);}finally{globalThis.Worker=Native;}
});

test('detaching preserves all models and invalidates legacy generation-only analysis',()=>{
  const state=move(initial()),{source:_source,...ticket}=modelAnalysisTicket(state)!,result=activeFoldedModel(state)!.history.present!;
  const draft=reduce(state,{type:'detach'});assert.equal(draft.activeId,null);assert.equal(draft.entries,state.entries);assert.equal(collectionHasUnsavedEdits(draft),true);
  assert.equal(reduce(draft,{type:'analysis',ticket,result}),draft);
  const restored=reduce(draft,{type:'select',id:'a'});assert.equal(activeFoldedModel(restored)!.history,state.entries[0].history);assert.equal(reduce(restored,{type:'analysis',ticket,result}),restored);
});

test('collection add and snapshot copy isolate source, geometry and history',()=>{
  const input=fixture(),state=reduce(emptyFoldedModelCollection(),{type:'add',id:'a',name:'A',...input});
  input.source.doc.name='外部改名';input.result.geometry.vertices[0][0]=999;
  assert.equal(activeFoldedModel(state)!.source.doc.name,'源工程');assert.notEqual(activeFoldedModel(state)!.history.present!.geometry.vertices[0][0],999);
  const changed=move(state),copied=reduce(changed,{type:'snapshot-copy',id:'b',name:'副本'});
  assert.deepEqual(copied.entries[0].history.present,copied.entries[1].history.present);assert.equal(copied.entries[1].history.past.length,0);assert.equal(copied.entries[0].history.past.length,1);
  copied.entries[1].source.doc.name='B';copied.entries[1].history.present!.geometry.vertices[0][0]=888;
  assert.equal(copied.entries[0].source.doc.name,'源工程');assert.equal(copied.entries[0].history.present!.geometry.vertices[0][0],-10);
});
test('switching preserves independent undo redo and unsaved inactive models',()=>{
  let state=move(initial());state=reduce(state,{type:'snapshot-copy',id:'b',name:'B'});
  state=reduce(state,{type:'edit',action:{type:'replace',result:fixture().result}});
  assert.equal(collectionHasUnsavedEdits(state),true);
  state=reduce(state,{type:'select',id:'a'});state=reduce(state,{type:'edit',action:{type:'undo'}});
  assert.equal(activeFoldedModel(state)!.history.future.length,1);assert.equal(collectionHasUnsavedEdits(state),true);
  state=reduce(state,{type:'select',id:'b'});assert.equal(activeFoldedModel(state)!.history.future.length,0);
  state=reduce(state,{type:'select',id:'a'});state=reduce(state,{type:'edit',action:{type:'redo'}});assert.equal(activeFoldedModel(state)!.history.present!.geometry.vertices[0][0],-10);
});
test('legacy analysis accepts current ticket once but rejects switched-away-and-back results',()=>{
  const state=initial(),{source:_source,...ticket}=modelAnalysisTicket(state)!,result=recomputeFlatLayers(activeFoldedModel(state)!.history.present!);
  const accepted=reduce(state,{type:'analysis',ticket,result});assert.notEqual(accepted,state);assert.equal(reduce(accepted,{type:'analysis',ticket,result}),accepted);
  const added=reduce(state,{type:'snapshot-copy',id:'b',name:'B'}),back=reduce(added,{type:'select',id:'a'});
  assert.equal(reduce(back,{type:'analysis',ticket,result}),back);
  const edited=move(state);assert.equal(reduce(edited,{type:'analysis',ticket,result}),edited);
});

test('each CP has four creation slots shared by new calculations and snapshot copies',()=>{
 const input=fixture();let state=reduce(emptyFoldedModelCollection(),{type:'add',id:'first',name:'first',...input});
 for(let i=1;i<MAX_FOLDED_MODELS_PER_CP;i++)state=reduce(state,{type:'snapshot-copy',id:`copy-${i}`,name:`copy ${i}`});
 const key=state.entries[0].source.cpKey!,before=structuredClone(state);
 assert.equal(countFoldedModelsForCp(state,key),4);
 assert.throws(()=>reduce(state,{type:'add',id:'fifth',name:'fifth',...input}),/最多保留 4/);
 assert.throws(()=>reduce(state,{type:'snapshot-copy',id:'fifth-copy',name:'fifth copy'}),/最多保留 4/);
 const legacy={...state,entries:state.entries.map(entry=>{const {cpKey:_key,...source}=entry.source;return {...entry,source};})};
 assert.equal(countFoldedModelsForCp(legacy,key),4);assert.throws(()=>reduce(legacy,{type:'add',id:'legacy-fifth',name:'fifth',...input}),/最多保留 4/);
 assert.deepEqual(state,before);
 const second=fixture(),withOther=reduce(state,{type:'add',id:'other',name:'other',...second});assert.equal(withOther.entries.length,5);
 const freed=reduce(state,{type:'remove',id:'copy-1'});assert.equal(countFoldedModelsForCp(freed,key),3);
 assert.equal(reduce(freed,{type:'add',id:'again',name:'again',...input}).entries.length,4);
});

test('bound analysis follows its source across selection changes without editing the new active result',()=>{
 const a=initial(),ticket=modelAnalysisTicket(a)!,state=reduce(a,{type:'snapshot-copy',id:'b',name:'B'}),other=state.entries[1],result=recomputeFlatLayers(a.entries[0].history.present!);
 const accepted=reduce(state,{type:'analysis',ticket,result});
 assert.equal(accepted.activeId,'b');assert.equal(accepted.entries[1],other);assert.notEqual(accepted.entries[0].history,a.entries[0].history);
 assert.equal(reduce(accepted,{type:'analysis',ticket,result}),accepted,'a committed result advances its revision');
 const detached=reduce(state,{type:'detach'}),finished=reduce(detached,{type:'analysis',ticket,result});
 assert.equal(finished.activeId,null);assert.notEqual(finished.entries[0].history,detached.entries[0].history);
 const restored={...state,entries:structuredClone(state.entries)};
 assert.equal(reduce(restored,{type:'analysis',ticket,result}),restored,'same IDs and revisions from a reload cannot accept an old source reference');
 assert.equal(reduce(move(a),{type:'analysis',ticket,result}).entries[0].history.revision,move(a).entries[0].history.revision,'edited geometry rejects the old revision');
});

test('canvas camera callbacks update only their mounted source without selecting it or changing analysis generation',()=>{
 const a=initial(),state=reduce(a,{type:'snapshot-copy',id:'b',name:'B'}),source=state.entries[0].source,ticket=modelAnalysisTicket(state)!,view={...state.entries[0].view!,side:'back' as const,rotation:45};
 const updated=reduce(state,{type:'canvas-view',id:'a',source,view});
 assert.equal(updated.activeId,'b');assert.equal(updated.generation,state.generation);assert.equal(updated.entries[0].history,state.entries[0].history);
 assert.equal(updated.entries[0].view!.rotation,45);assert.equal(updated.entries[1],state.entries[1]);assert.deepEqual(modelAnalysisTicket(updated),ticket);
 assert.equal(reduce(state,{type:'view',id:'a',view}),state,'the old active-only path stays protected');
 const restored={...state,entries:structuredClone(state.entries)};
 assert.equal(reduce(restored,{type:'canvas-view',id:'a',source,view}),restored);
 assert.equal(reduce(state,{type:'canvas-view',id:'missing',source,view}),state);
});
test('deletion selects a surviving neighbour, never alters other histories and rejects late results',()=>{
  let state=reduce(initial(),{type:'snapshot-copy',id:'b',name:'B'});const ticket=modelAnalysisTicket(state)!,result=activeFoldedModel(state)!.history.present!,first=state.entries[0];
  state=reduce(state,{type:'remove',id:'b'});assert.equal(state.activeId,'a');assert.equal(state.entries[0],first);assert.equal(reduce(state,{type:'analysis',ticket,result}),state);
  state=reduce(state,{type:'remove',id:'a'});assert.equal(state.activeId,null);assert.equal(modelAnalysisTicket(state),null);assert.equal(state.entries.length,0);
});
test('invalid IDs no-op or reject without modifying state; rename and clear are explicit',()=>{
  const state=initial(),before=structuredClone(state);
  for(const type of ['select','remove'] as const)assert.equal(reduce(state,{type,id:'missing'}),state);
  assert.throws(()=>reduce(state,{type:'snapshot-copy',id:'a',name:'重复'}),/编号/);
  assert.throws(()=>reduce(emptyFoldedModelCollection(),{type:'snapshot-copy',id:'x',name:'无源'}),/几何/);
  const renamed=reduce(state,{type:'rename',id:'a',name:' 新名 '});assert.equal(activeFoldedModel(renamed)!.name,'新名');assert.equal(activeFoldedModel(renamed)!.source.doc.name,'源工程');
  assert.equal(reduce(renamed,{type:'clear'}).entries.length,0);assert.deepEqual(state,before);
});
