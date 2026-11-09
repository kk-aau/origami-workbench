import {test} from 'node:test';
import assert from 'node:assert/strict';
import {modelViewPanes} from '../../src/app/modelViewPanes';
import {defaultModelView,validateModelView,type ModelViewLayout} from '../../src/app/modelViewState';
import {emptyFoldedModelCollection,foldedModelCollectionReducer as reduce,modelAnalysisTicket} from '../../src/app/foldedModelCollection';
import {exportModelCollection,prepareModelCollection} from '../../src/app/modelCollectionFile';
import {blankDoc} from '../../src/app/state';
import {buildFold} from '../../src/core/geometry';
import {computeFlatFold} from '../../src/core/flatFold';

test('old and single views retain selected side and transparency; both shows both directions',()=>{
 const view={...defaultModelView(),side:'back' as const,xray:true};
 assert.deepEqual(modelViewPanes(view).map(p=>p.key),['back-transparent']);
 assert.deepEqual(modelViewPanes({...view,layout:'single'}),modelViewPanes(view));
 assert.deepEqual(modelViewPanes({...view,layout:'both'}).map(p=>p.key),['front-transparent','back-transparent']);
 assert.deepEqual(modelViewPanes({...view,xray:false,layout:'both'}).map(p=>p.key),['front-solid','back-solid']);
});

test('four-view mode always provides solid and X-ray front/back with distinct camera identities',()=>{
 const view={...defaultModelView(),layout:'four' as const},before=structuredClone(view);
 const panes=modelViewPanes(view);assert.deepEqual(panes.map(p=>p.key),['front-solid','back-solid','front-transparent','back-transparent']);
 assert.equal(new Set(panes.map(p=>p.key)).size,4);assert.deepEqual(modelViewPanes({...view,xray:true}),panes);assert.deepEqual(view,before);
});

test('invalid or explicit undefined layout is rejected, absent legacy field is accepted',()=>{
 validateModelView(defaultModelView());
 for(const layout of [undefined,null,'quad','',0,{},[]])assert.throws(()=>validateModelView({...defaultModelView(),layout}),/组合/);
});

test('layout and four cameras survive copy and collection roundtrip without changing geometry or solver ticket',()=>{
 const doc=blankDoc('组合显示',100,100),result=computeFlatFold(doc);
 let collection=reduce(emptyFoldedModelCollection(),{type:'add',id:'a',name:'A',source:{doc,graph:buildFold(doc).graph},result});
 const ticket=modelAnalysisTicket(collection),history=collection.entries[0].history;
 const view={...defaultModelView(),layout:'four' as ModelViewLayout,shadows:true};
 for(const [index,pane] of modelViewPanes(view).entries())view.cameras[pane.key]={rotation:0,x:index*10,y:index,width:100+index,height:100};
 collection=reduce(collection,{type:'view',id:'a',view});assert.equal(collection.entries[0].history,history);assert.deepEqual(modelAnalysisTicket(collection),ticket);
 collection=reduce(collection,{type:'snapshot-copy',id:'b',name:'B'});
 collection=reduce(collection,{type:'view',id:'b',view:{...view,layout:'single'}});
 const loaded=prepareModelCollection(exportModelCollection(doc,collection)).collection;
 assert.equal(loaded.entries[0].view!.layout,'four');assert.equal(loaded.entries[1].view!.layout,'single');
 assert.deepEqual(loaded.entries[0].view!.cameras,view.cameras);
});
