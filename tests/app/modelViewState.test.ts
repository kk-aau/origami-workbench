import {test} from 'node:test';
import assert from 'node:assert/strict';
import {copyModelView,defaultModelView,validateModelView} from '../../src/app/modelViewState';
import {emptyFoldedModelCollection,foldedModelCollectionReducer as reduce,modelAnalysisTicket} from '../../src/app/foldedModelCollection';
import {exportModelCollection,prepareModelCollection} from '../../src/app/modelCollectionFile';
import {blankDoc} from '../../src/app/state';
import {buildFold} from '../../src/core/geometry';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
function fixture(){
 const doc=blankDoc('视图测试',100,100),result=computeFlatFold(doc);
 const models=reduce(emptyFoldedModelCollection(),{type:'add',id:'a',name:'A',source:{doc,graph:buildFold(doc).graph},result});
 return {doc,result,models};
}
const view=()=>({...defaultModelView(),side:'back' as const,rotation:22.5,xray:true,cameras:{'back-transparent':{rotation:22.5,x:-10,y:5,width:80,height:70}}});
test('existing crease visibility survives save and reopen without changing legacy defaults',()=>{
 const {doc,models}=fixture();
 assert.equal(copyModelView(view()).showExistingCreases,undefined);
 for(const showExistingCreases of [false,true]){
  const input={...view(),showExistingCreases};
  const state=reduce(models,{type:'view',id:'a',view:input});
  const reopened=prepareModelCollection(exportModelCollection(doc,state));
  assert.equal(reopened.collection.entries[0].view!.showExistingCreases,showExistingCreases);
 }
 for(const value of [null,0,'false'])assert.throws(()=>validateModelView({...view(),showExistingCreases:value}));
});
test('model views validate finite bounded cameras and clone independently',()=>{
 const original=view(),copy=copyModelView(original);validateModelView(copy);
 copy.cameras['back-transparent']!.x=100;assert.equal(original.cameras['back-transparent'].x,-10);
 assert.deepEqual(copyModelView(undefined),defaultModelView());
 for(const change of [(v:any)=>v.rotation=360,(v:any)=>v.xray='yes',(v:any)=>v.side='unknown',(v:any)=>v.cameras.other={},(v:any)=>v.cameras['back-transparent'].width=0,(v:any)=>v.cameras['back-transparent'].x=Infinity,(v:any)=>v.cameras['back-transparent'].height=1e10,(v:any)=>v.extra=1]){
   const invalid=structuredClone(original);change(invalid);assert.throws(()=>validateModelView(invalid),/模型/);
 }
});
test('view updates preserve geometry history and in-flight analysis tickets',()=>{
 const {models}=fixture(),ticket=modelAnalysisTicket(models)!,history=models.entries[0].history,input=view();
 const next=reduce(models,{type:'view',id:'a',view:input});input.rotation=180;
 assert.equal(next.generation,models.generation);assert.equal(next.entries[0].history,history);assert.equal(next.entries[0].view!.rotation,22.5);
 assert.deepEqual(modelAnalysisTicket(next),ticket);
 const analyzed=reduce(next,{type:'analysis',ticket,result:recomputeFlatLayers(history.present!)});
 assert.notEqual(analyzed,next);assert.deepEqual(analyzed.entries[0].view,next.entries[0].view);
 assert.equal(reduce(next,{type:'view',id:'missing',view:view()}),next);
});
test('copy, switch and geometry undo keep per-model views independent',()=>{
 const {models}=fixture(),a=reduce(models,{type:'view',id:'a',view:view()}),b=reduce(a,{type:'snapshot-copy',id:'b',name:'B'});
 assert.deepEqual(b.entries[0].view,b.entries[1].view);assert.notEqual(b.entries[0].view,b.entries[1].view);
 const changed=reduce(b,{type:'view',id:'b',view:defaultModelView()});
 assert.equal(changed.entries[0].view!.rotation,22.5);assert.equal(changed.entries[1].view!.rotation,0);
 assert.equal(reduce(changed,{type:'view',id:'a',view:defaultModelView()}),changed);
 const back=reduce(changed,{type:'select',id:'a'}),undone=reduce(back,{type:'edit',action:{type:'undo'}});
 assert.equal(undone.entries[0].view!.rotation,22.5);
});
test('collection v3 saves view state and source grouping while v1 migrates to default views',()=>{
 const {doc,models}=fixture(),state=reduce(models,{type:'view',id:'a',view:view()}),raw=JSON.parse(exportModelCollection(doc,state));
 assert.equal(raw.version,3);assert.deepEqual(prepareModelCollection(JSON.stringify(raw)).collection.entries[0].view,view());
 raw.version=1;delete raw.models[0].view;delete raw.models[0].cpKey;
 assert.deepEqual(prepareModelCollection(JSON.stringify(raw)).collection.entries[0].view,defaultModelView());
});
test('invalid later model view rejects collection before any result publication',()=>{
 const {doc,models}=fixture(),state=reduce(models,{type:'snapshot-copy',id:'b',name:'B'}),before=structuredClone(state),raw=JSON.parse(exportModelCollection(doc,state));
 raw.models[1].view.cameras={'front-solid':{rotation:0,x:0,y:0,width:-10,height:20}};
 assert.throws(()=>prepareModelCollection(JSON.stringify(raw)),/相机/);assert.deepEqual(state,before);
 raw.models[1].view=null;assert.throws(()=>prepareModelCollection(JSON.stringify(raw)),/视图/);
 delete raw.models[1].view;assert.throws(()=>prepareModelCollection(JSON.stringify(raw)),/字段/);
});

test('optional shadow setting validates strictly while older views remain unchanged',()=>{
 const old=view();validateModelView(old);assert.deepEqual(copyModelView(old),old);
 for(const shadows of [true,false]){
  const input={...old,shadows};validateModelView(input);assert.equal(copyModelView(input).shadows,shadows);
  validateModelView({...input,colors:{front:'#112233',back:'#445566',line:'#778899'}});
 }
 for(const shadows of [undefined,null,0,1,'true',{},[]])assert.throws(()=>validateModelView({...old,shadows}),/阴影/);
 for(const field of ['cameras','rotation','side','xray']){
  const input:Record<string,unknown>={...old,shadows:true};delete input[field];assert.throws(()=>validateModelView(input),/视图/);
 }
 assert.throws(()=>validateModelView({...old,shadows:true,extra:false}),/视图/);
});

test('model anti-alias and face-number preferences persist and validate strictly',()=>{
 const old=view();assert.equal(defaultModelView().antiAlias,true);assert.equal(defaultModelView().displayNumbers,false);validateModelView(old);
 for(const antiAlias of [true,false]){const input={...old,antiAlias};validateModelView(input);assert.equal(copyModelView(input).antiAlias,antiAlias);}
 for(const displayNumbers of [true,false]){const input={...old,displayNumbers};validateModelView(input);assert.equal(copyModelView(input).displayNumbers,displayNumbers);}
 for(const antiAlias of [null,0,1,'true',{},[]])assert.throws(()=>validateModelView({...old,antiAlias}),/抗锯齿/);
 for(const displayNumbers of [null,0,1,'true',{},[]])assert.throws(()=>validateModelView({...old,displayNumbers}),/编号/);
 const legacy={...old};delete (legacy as Record<string,unknown>).antiAlias;validateModelView(legacy);assert.equal(copyModelView(legacy).antiAlias,undefined);
});

test('shadow preference survives independent copies and collection files without trusting imported layers',()=>{
 const {doc,models}=fixture(),ticket=modelAnalysisTicket(models),history=models.entries[0].history;
 const enabled=reduce(models,{type:'view',id:'a',view:{...view(),shadows:true}});
 assert.equal(enabled.entries[0].history,history);assert.deepEqual(modelAnalysisTicket(enabled),ticket);
 const copied=reduce(enabled,{type:'snapshot-copy',id:'b',name:'B'});
 assert.equal(copied.entries[1].view!.shadows,true);
 const disabled=reduce(copied,{type:'view',id:'b',view:{...copied.entries[1].view!,shadows:false}});
 assert.equal(disabled.entries[0].view!.shadows,true);assert.equal(disabled.entries[1].view!.shadows,false);
 const loaded=prepareModelCollection(exportModelCollection(doc,disabled)).collection;
 assert.deepEqual(loaded.entries.map(entry=>entry.view?.shadows),[true,false]);
 assert.ok(loaded.entries.every(entry=>entry.history.present!.layers.status!=='solved'));
 const raw=JSON.parse(exportModelCollection(doc,disabled));raw.models[1].view.shadows='true';
 assert.throws(()=>prepareModelCollection(JSON.stringify(raw)),/阴影/);
 delete raw.models[0].view.shadows;delete raw.models[1].view.shadows;
 assert.ok(prepareModelCollection(JSON.stringify(raw)).collection.entries.every(entry=>entry.view?.shadows===undefined));
});
