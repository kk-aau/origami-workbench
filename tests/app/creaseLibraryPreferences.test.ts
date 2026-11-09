import test from 'node:test';
import assert from 'node:assert/strict';
import {CREASE_LIBRARY_KEY,emptyCreaseLibraryPreferences,readCreaseLibraryPreferences,saveCreaseLibraryPreferences,createCreaseLibraryFolder,moveCreaseLibraryDocument,markCreaseLibraryDocumentOpen,removeCreaseLibraryDocument,type CreaseLibraryPreferences} from '../../src/app/creaseLibraryPreferences';

const FIRST='12345678-abcd-1234-abcd-123456789abc',SECOND='87654321-abcd-4321-abcd-cba987654321';

test('removing a document clears only its organization and matching recent entry',()=>{
  const initial=markCreaseLibraryDocumentOpen(markCreaseLibraryDocumentOpen(hierarchy(),FIRST,100),SECOND,200),snapshot=structuredClone(initial);
  const removedOther=removeCreaseLibraryDocument(initial,FIRST);
  assert.equal(removedOther.documents[FIRST],undefined);assert.deepEqual(removedOther.documents[SECOND],initial.documents[SECOND]);assert.equal(removedOther.lastOpenId,SECOND);
  const removedLast=removeCreaseLibraryDocument(initial,SECOND);
  assert.equal(removedLast.lastOpenId,null);assert.deepEqual(removedLast.folders,initial.folders);assert.deepEqual(removedLast.documents[FIRST],initial.documents[FIRST]);
  const backing=storage();saveCreaseLibraryPreferences(removedLast,backing);assert.deepEqual(readCreaseLibraryPreferences(backing),removedLast);assert.deepEqual(initial,snapshot);
});

test('invalid deletion IDs cannot alter metadata and deleting absent metadata is harmless',()=>{
  const initial=markCreaseLibraryDocumentOpen(hierarchy(),FIRST,100),snapshot=structuredClone(initial);
  assert.deepEqual(removeCreaseLibraryDocument(initial,SECOND),initial);
  for(const id of ['../outside','',FIRST.toUpperCase()])assert.throws(()=>removeCreaseLibraryDocument(initial,id),/编号/);
  assert.deepEqual(initial,snapshot);
});
function storage(){const values=new Map<string,string>();let writes=0;return {values,get writes(){return writes;},getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{writes++;values.set(key,value);}};}
function hierarchy(){let value=createCreaseLibraryFolder(emptyCreaseLibraryPreferences(),'动物',null,()=> 'animals',100);return createCreaseLibraryFolder(value,'鸟类','animals',()=> 'birds',101);}

test('missing metadata produces independent empty values and round trips organization without project content',()=>{
  const backing=storage(),empty=readCreaseLibraryPreferences(backing);empty.folders.push({id:'temporary',name:'临时',parentId:null,createdAt:0});
  assert.deepEqual(readCreaseLibraryPreferences(backing),emptyCreaseLibraryPreferences());assert.equal(backing.writes,0);
  const value=markCreaseLibraryDocumentOpen(moveCreaseLibraryDocument(hierarchy(),FIRST,'birds'),FIRST,300);
  saveCreaseLibraryPreferences(value,backing);assert.deepEqual(readCreaseLibraryPreferences(backing),value);assert.equal(backing.writes,1);
  const restored=readCreaseLibraryPreferences(backing);restored.documents[FIRST].folderId=null;restored.folders[0].name='外部改动';
  assert.deepEqual(readCreaseLibraryPreferences(backing),value);assert.equal(backing.values.size,1);assert.ok(backing.values.has(CREASE_LIBRARY_KEY));
});

test('nested folders, moves and recent opening preserve unrelated and currently unavailable project metadata',()=>{
  const initial=hierarchy(),snapshot=structuredClone(initial);
  const grouped=moveCreaseLibraryDocument(initial,FIRST,'birds'),opened=markCreaseLibraryDocumentOpen(grouped,FIRST,500);
  const other=markCreaseLibraryDocumentOpen(opened,SECOND,600),moved=moveCreaseLibraryDocument(other,FIRST,null);
  assert.deepEqual(initial,snapshot);assert.equal(grouped.documents[FIRST].openedAt,0);assert.equal(opened.lastOpenId,FIRST);
  assert.deepEqual(other.documents[FIRST],{folderId:'birds',openedAt:500});assert.equal(other.lastOpenId,SECOND);
  assert.deepEqual(moved.documents[FIRST],{folderId:null,openedAt:500});assert.deepEqual(moved.documents[SECOND],{folderId:null,openedAt:600});assert.equal(moved.lastOpenId,SECOND);
});

test('invalid folder operations and document IDs leave the caller metadata unchanged',()=>{
  const value=hierarchy(),snapshot=structuredClone(value);
  for(const name of ['', '   ', '长'.repeat(161), '名称\u0000', '名称\n换行', '\t名称', '名称\n', '名称\u007f'])assert.throws(()=>createCreaseLibraryFolder(value,name),/名称/);
  assert.equal(createCreaseLibraryFolder(value,'  空白可修整  ',null,()=> 'trimmed',0).folders.at(-1)?.name,'空白可修整');
  assert.throws(()=>createCreaseLibraryFolder(value,'无上级','missing',()=> 'next',0),/上级/);
  assert.throws(()=>createCreaseLibraryFolder(value,'重复',null,()=> 'animals',0),/编号/);
  assert.throws(()=>createCreaseLibraryFolder(value,'坏时间',null,()=> 'new',NaN),/时间/);
  assert.throws(()=>moveCreaseLibraryDocument(value,FIRST,'missing'),/目标/);
  for(const id of ['../outside','not-a-uuid','',FIRST+'x',FIRST.toUpperCase()]){
    assert.throws(()=>moveCreaseLibraryDocument(value,id,null),/编号/);assert.throws(()=>markCreaseLibraryDocumentOpen(value,id),/编号/);
  }
  assert.throws(()=>markCreaseLibraryDocumentOpen(value,FIRST,-1),/时间/);assert.deepEqual(value,snapshot);
});

test('invalid read or write never resets or overwrites the previously stored directory',()=>{
  const backing=storage(),valid=markCreaseLibraryDocumentOpen(hierarchy(),FIRST,123);saveCreaseLibraryPreferences(valid,backing);
  const raw=backing.values.get(CREASE_LIBRARY_KEY),writes=backing.writes;
  const invalid:unknown[]=[null,[],{}, {...valid,version:2},{...valid,documents:[]},{...valid,lastOpenId:SECOND},
    {...valid,documents:{bad:{folderId:null,openedAt:0}}},{...valid,documents:{[FIRST.toUpperCase()]:{folderId:null,openedAt:0}}},{...valid,documents:{[FIRST]:{folderId:'missing',openedAt:0}}},
    {...valid,documents:{[FIRST]:{folderId:null,openedAt:-1}}},{...valid,doc:{segments:[]}},
    {...valid,folders:[...valid.folders,{...valid.folders[0]}]},
    {...valid,folders:[{...valid.folders[0],name:'未\u0001授权'}]},
    {...valid,folders:[{...valid.folders[0],name:' 空白 '}]}];
  for(const value of invalid){
    assert.throws(()=>saveCreaseLibraryPreferences(value as CreaseLibraryPreferences,backing));assert.equal(backing.values.get(CREASE_LIBRARY_KEY),raw);assert.equal(backing.writes,writes);
    backing.values.set(CREASE_LIBRARY_KEY,JSON.stringify(value));assert.throws(()=>readCreaseLibraryPreferences(backing),/损坏|名称/);assert.equal(backing.values.get(CREASE_LIBRARY_KEY),JSON.stringify(value));assert.equal(backing.writes,writes);
    backing.values.set(CREASE_LIBRARY_KEY,raw!);
  }
  for(const corrupt of ['', '{']){backing.values.set(CREASE_LIBRARY_KEY,corrupt);assert.throws(()=>readCreaseLibraryPreferences(backing),/JSON.*损坏/);assert.equal(backing.values.get(CREASE_LIBRARY_KEY),corrupt);}
});

test('cycles and orphan parents are rejected while valid deep folder paths remain readable',()=>{
  const backing=storage(),valid=hierarchy();
  for(const folders of [[{...valid.folders[0],parentId:'animals'}],valid.folders.map(item=>item.id==='animals'?{...item,parentId:'birds'}:item),[{...valid.folders[0],parentId:'absent'}]]){
    const value={...valid,folders};backing.values.set(CREASE_LIBRARY_KEY,JSON.stringify(value));assert.throws(()=>readCreaseLibraryPreferences(backing),/循环|缺失/);assert.throws(()=>saveCreaseLibraryPreferences(value,backing),/循环|缺失/);
  }
  const folders=Array.from({length:1000},(_,i)=>({id:`folder-${i}`,name:`分类 ${i}`,parentId:i===0?null:`folder-${i-1}`,createdAt:i}));
  const value={...emptyCreaseLibraryPreferences(),folders};saveCreaseLibraryPreferences(value,backing);assert.deepEqual(readCreaseLibraryPreferences(backing),value);
});

test('large UTF-8 metadata remains writable and readable above the former index ceiling',()=>{
  const backing=storage(),valid=hierarchy();saveCreaseLibraryPreferences(valid,backing);const writes=backing.writes;
  const value={...emptyCreaseLibraryPreferences(),folders:Array.from({length:2000},(_,i)=>({id:`folder-${i}`,name:'中'.repeat(160),parentId:null,createdAt:0}))};
  const raw=JSON.stringify(value);assert.ok(new TextEncoder().encode(raw).length>1_000_000);
  saveCreaseLibraryPreferences(value,backing);assert.equal(backing.values.get(CREASE_LIBRARY_KEY),raw);assert.equal(backing.writes,writes+1);
  assert.deepEqual(readCreaseLibraryPreferences(backing),value);assert.equal(backing.writes,writes+1);
});
