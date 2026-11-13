import test from 'node:test';
import assert from 'node:assert/strict';
import {BaseDesignLibrary,readBaseDesignBank} from '../../src/app/baseDesignLibrary';
import {newBaseDesign} from '../../src/app/baseDesign';
import type {Preferences} from '../../src/app/preferenceStorage';
const key='zhezhi.base-design-library.v1';

function repository(){
 const disk=new Map<string,string>(),cache=new Map<string,string>();let reads=0;
 const storage:Preferences={getItem:key=>cache.get(key)??null,setItem(){throw Error('use CAS');},async getItemAsync(key){reads++;const value=disk.get(key)??null;if(value===null)cache.delete(key);else cache.set(key,value);return value;},compareAndSet(key,expected,value){if((disk.get(key)??null)!==expected)return false;disk.set(key,value);cache.set(key,value);return true;}};
 return {disk,cache,storage,get reads(){return reads;}};
}
test('async design libraries reject empty-cache reads and writes until initial hydration completes',async()=>{
 const store=repository(),library=new BaseDesignLibrary(store.storage);
 assert.equal(library.isReady(),false);assert.throws(()=>library.list(),/正在读取/);assert.throws(()=>library.write(newBaseDesign('tree'),null),/正在读取/);assert.equal(store.disk.size,0);
 await library.ready();assert.equal(library.isReady(),true);assert.deepEqual(library.list(),[]);
 const written=library.write(newBaseDesign('tree'),null);assert.equal(library.list()[0].id,written.id);
 await library.ready();assert.equal(store.reads,1,'repeated ready must not reread or revalidate the whole bank');
});
test('forced refresh loads foreign revisions and stale writes cannot replace them',async()=>{
 const store=repository(),library=new BaseDesignLibrary(store.storage);await library.ready();const first=library.write(newBaseDesign('box'),null);
 const bank=JSON.parse(store.disk.get(key)!);bank.entries[0].revision='foreign revision';bank.entries[0].project.name='other window';store.disk.set(key,JSON.stringify(bank));
 assert.throws(()=>library.write({...first.project,name:'stale'},first),/刚有更新/);await library.ready(true);
 assert.equal(library.list()[0].project.name,'other window');assert.throws(()=>library.write(first.project,first),/另一窗口/);
});
test('corrupt refreshed content never becomes a writable empty bank',async()=>{
 const store=repository(),library=new BaseDesignLibrary(store.storage);await library.ready();library.write(newBaseDesign('tree'),null);store.disk.set(key,'{broken');
 await assert.rejects(library.ready(true));assert.equal(library.isReady(),false);assert.throws(()=>library.write(newBaseDesign('box'),null),/正在读取/);assert.equal(store.disk.get(key),'{broken');
});
test('returned projects and entries cannot mutate the validated cache',async()=>{
 const store=repository(),library=new BaseDesignLibrary(store.storage);await library.ready();const source=newBaseDesign('tree'),entry=library.write(source,null);
 source.name='source changed';entry.project.name='returned changed';const list=library.list();list[0].project.name='list changed';
 assert.equal(library.list()[0].project.name,'树形基础形');assert.equal(readBaseDesignBank(store.disk.get(key)!).entries[0].project.name,'树形基础形');
});

test('summary lists retain no project arrays and reuse immutable metadata across unchanged reentry',async()=>{
 const store=repository(),library=new BaseDesignLibrary(store.storage);await library.ready();const first=library.write(newBaseDesign('tree'),null,true);
 const summaries=library.listSummaries();assert.deepEqual(summaries.map(e=>({name:e.name,kind:e.kind,saved:e.saved})),[{name:'树形基础形',kind:'tree',saved:true}]);
 assert.equal(Object.hasOwn(summaries[0],'project'),false);assert.equal(Object.isFrozen(summaries),true);assert.equal(Object.isFrozen(summaries[0]),true);
 assert.equal(library.listSummaries(),summaries);await library.ready(true);assert.equal(library.listSummaries(),summaries);
 const opened=library.get(first.id)!;opened.project.name='mutated opened copy';assert.equal(library.get(first.id)!.project.name,'树形基础形');
 assert.equal(library.get('missing'),undefined);assert.equal(library.listSummaries(),summaries);
 const updated=library.write({...first.project,name:'edited'},first);assert.equal(library.listSummaries()[0].name,'edited');assert.equal(library.listSummaries()[0].saved,false);
 assert.equal(summaries[0].name,'树形基础形','an old rendered list remains an immutable snapshot');
 const saved=library.write(updated.project,updated,true);assert.equal(library.listSummaries()[0].saved,true);
 library.remove(library.listSummaries()[0]);assert.deepEqual(library.listSummaries(),[]);assert.equal(saved.id,first.id);
});

test('summary refresh preserves foreign content and keeps stale summary operations protected by CAS',async()=>{
 const store=repository(),library=new BaseDesignLibrary(store.storage);await library.ready();const first=library.write(newBaseDesign('box'),null),stale=library.listSummaries()[0];
 const bank=JSON.parse(store.disk.get(key)!);bank.entries[0].project.name='foreign renamed';bank.entries[0].revision='foreign';store.disk.set(key,JSON.stringify(bank));
 assert.throws(()=>library.remove(stale),/刚有更新/);await library.ready(true);
 assert.equal(library.listSummaries()[0].name,'foreign renamed');assert.equal(library.get(first.id)!.revision,'foreign');
 assert.throws(()=>library.remove(stale),/已变化/);assert.equal(JSON.parse(store.disk.get(key)!).entries[0].project.name,'foreign renamed');
});

test('simultaneous initial ready calls read the bank only once and expose no empty summaries',async()=>{
 const store=repository();let release!:(value:string|null)=>void,reads=0;
 store.storage.getItemAsync=()=>{reads++;return new Promise(resolve=>{release=resolve;});};
 const library=new BaseDesignLibrary(store.storage),a=library.ready(),b=library.ready();
 assert.equal(a,b);assert.equal(reads,1);assert.throws(()=>library.listSummaries(),/正在读取/);assert.throws(()=>library.get('missing'),/正在读取/);
 release(null);await Promise.all([a,b]);assert.deepEqual(library.listSummaries(),[]);
});

test('actual bank worker validates complete sources and prepares the matching small summaries',async()=>{
 const scope=globalThis as any,oldMessage=scope.onmessage,oldPost=scope.postMessage,replies:any[]=[];
 try{
  scope.postMessage=(reply:unknown)=>replies.push(reply);await import('../../src/workers/baseDesignLibrary.worker');
  const project=newBaseDesign('tree'),entry={id:'test',revision:'revision',updated:'2026-11-12T00:00:00Z',project,saved:JSON.stringify(project)},bank={version:1,entries:[entry]};
  scope.onmessage({data:JSON.stringify(bank)});assert.deepEqual(replies[0].bank,bank);
  assert.deepEqual(replies[0].summaries,[{id:entry.id,revision:entry.revision,updated:entry.updated,name:project.name,kind:'tree',saved:true}]);
  if(project.kind!=='tree')assert.fail('tree');project.model.edges[0].nodes[0]=9999;scope.onmessage({data:JSON.stringify(bank)});
  assert.match(replies[1].error,/节点不存在/);assert.equal(Object.hasOwn(replies[1],'bank'),false);
 }finally{scope.onmessage=oldMessage;scope.postMessage=oldPost;}
});
