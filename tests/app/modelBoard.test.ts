import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultBoardPlacement,transformBoardPlacement} from '../../src/app/modelBoard';
import {copyModelView,defaultModelView,validateModelView} from '../../src/app/modelViewState';
import {emptyFoldedModelCollection,foldedModelCollectionReducer as reduce,modelAnalysisTicket} from '../../src/app/foldedModelCollection';
import {exportModelCollection,prepareModelCollection} from '../../src/app/modelCollectionFile';
import {blankDoc} from '../../src/app/state';
import {buildFold} from '../../src/core/geometry';
import {computeFlatFold} from '../../src/core/flatFold';
function fixture(){const doc=blankDoc('同屏',100,100);const a=reduce(emptyFoldedModelCollection(),{type:'add',id:'a',name:'A',source:{doc,graph:buildFold(doc).graph},result:computeFlatFold(doc)});return {doc,state:reduce(a,{type:'snapshot-copy',id:'b',name:'B'})};}
test('board placement clamps movement and resize without modifying input',()=>{
 const start=defaultBoardPlacement(2),before={...start};assert.deepEqual(start,{x:16,y:352,width:360,height:320,visible:true});
 assert.deepEqual(transformBoardPlacement(start,32,-52),{...start,x:48,y:300});
 assert.deepEqual(transformBoardPlacement(start,-1e6,1e6),{...start,x:0,y:100000});
 assert.deepEqual(transformBoardPlacement(start,1e6,-1e6,true),{...start,width:2000,height:240});
 assert.deepEqual(transformBoardPlacement(start,Infinity,0),start);assert.deepEqual(start,before);
});
test('board optional schema rejects malformed coordinates, sizes and unknown fields',()=>{
 const board=defaultBoardPlacement(0),view={...defaultModelView(),board};validateModelView(view);
 const cloned=copyModelView(view);cloned.board!.x=888;assert.equal(board.x,16);
 for(const invalid of [undefined,null,{}, {...board,x:-1},{...board,y:Infinity},{...board,x:100001},{...board,width:239},{...board,height:2001},{...board,visible:1},{...board,z:0}])assert.throws(()=>validateModelView({...view,board:invalid}),/同屏/);
});
test('inactive model board edits preserve active analysis, history and other model settings',()=>{
 const {state}=fixture(),ticket=modelAnalysisTicket(state),board=defaultBoardPlacement(0),history=state.entries[0].history;
 const next=reduce(state,{type:'board',id:'a',placement:board});board.x=999;
 assert.equal(next.activeId,'b');assert.deepEqual(modelAnalysisTicket(next),ticket);assert.equal(next.entries[0].history,history);assert.equal(next.entries[1],state.entries[1]);assert.equal(next.entries[0].view!.board!.x,16);
 assert.equal(reduce(next,{type:'board',id:'a',placement:defaultBoardPlacement(0)}),next);
 assert.equal(reduce(next,{type:'board',id:'missing',placement:board}),next);
});
test('collection roundtrip preserves hidden placement and copies appear offset and visible',()=>{
 const {doc,state}=fixture(),board={...defaultBoardPlacement(1),visible:false};
 const placed=reduce(state,{type:'board',id:'b',placement:board});const reopened=prepareModelCollection(exportModelCollection(doc,placed));
 assert.deepEqual(reopened.collection.entries[1].view!.board,board);
 assert.equal(reopened.collection.entries[0].view!.board,undefined);
 const copy=reduce(placed,{type:'snapshot-copy',id:'c',name:'C'});
 assert.deepEqual(copy.entries[2].view!.board,{...board,x:board.x+24,y:board.y+24,visible:true});assert.deepEqual(copy.entries[1].view!.board,board);
 const raw=JSON.parse(exportModelCollection(doc,placed));raw.models[1].view.board.width=0;assert.throws(()=>prepareModelCollection(JSON.stringify(raw)),/同屏/);
});
