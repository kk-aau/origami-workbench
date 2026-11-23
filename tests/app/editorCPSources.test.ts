import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {listEditorCPChoices,readOpenEditorCP,serveEditorCP} from '../../src/app/editorCPSources';
import type {DesktopDocumentInfo,DesktopDocumentSnapshot} from '../../src/desktop';

const editor=(id:string):DesktopDocumentInfo=>({id,title:'同名工程',windowId:'main',workspace:'edit',home:false,hasEditorCP:true,visible:false,ready:true,active:false,busy:false,saving:false,dirty:false,bounds:null});
const snapshot:DesktopDocumentSnapshot={revision:1,windowId:'main',documents:[
  {...editor('home'),home:true},{...editor('placeholder'),hasEditorCP:false},editor('a'),{...editor('b'),windowId:'other',dirty:true},{...editor('diagram'),workspace:'diagram'},
],windows:['main','other'].map(id=>({id,title:'折纸工坊',workspace:'edit',activeId:null,layout:'tabs',documentIds:id==='main'?['a']:['b']}))};

test('CP source list includes eligible background tabs in other windows and distinguishes same-titled files',()=>{
  const options=listEditorCPChoices(snapshot,'b');
  assert.deepEqual(options.map(i=>i.id),['a','b']);
  assert.notEqual(options[0].detail,options[1].detail);
  assert.equal(options[1].preferred,true);
});

test('a targeted cross-window read returns only the chosen live revision and handles a closed source',async()=>{
  let current=blankDoc('未保存 CP',20,40);
  const stopA=serveEditorCP('a',()=>blankDoc('另一个 CP',99,99));
  const stopB=serveEditorCP('b',()=>current);
  const service={list:async()=>snapshot,subscribe:()=>()=>{}};
  try{
    assert.deepEqual(await readOpenEditorCP(service,'b'),current);
    current={...current,name:'刚刚修改'};
    assert.deepEqual(await readOpenEditorCP(service,'b'),current);
    await assert.rejects(readOpenEditorCP(service,'home'),/关闭/);
    await assert.rejects(readOpenEditorCP(service,'missing'),/关闭/);
  }finally{stopB();stopA();}
});
