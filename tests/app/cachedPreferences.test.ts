import test from 'node:test';
import assert from 'node:assert/strict';
import {createCachedPreferences,type PreferenceTransport} from '../../src/app/cachedPreferences';

function fixture(){
  const disk=new Map([['zhezhi.theme.v1','light'],['zhezhi.diagram-project.v1','large drawing']]);
  const calls:string[]=[];
  const compare=(key:string,value:string,expected?:string|null)=>{calls.push('write:'+key);if(expected!==undefined&&(disk.get(key)??null)!==expected)return false;disk.set(key,value);return true;};
  const transport:PreferenceTransport={snapshot:async()=>{calls.push('snapshot');return {'zhezhi.theme.v1':disk.get('zhezhi.theme.v1')!};},read:async key=>{calls.push('read:'+key);return disk.get(key)??null;},write:async(...args)=>compare(...args),writeSync:compare};
  return {disk,calls,transport,prefs:createCachedPreferences(transport)};
}
test('UI reads only the preloaded snapshot and explicit document reads populate the cache',async()=>{
  const {prefs,calls}=fixture();await prefs.refresh!();const loadedCalls=calls.length;
  for(let i=0;i<100;i++)assert.equal(prefs.getItem('zhezhi.theme.v1'),'light');
  assert.equal(prefs.getItem('zhezhi.diagram-project.v1'),null);assert.equal(calls.length,loadedCalls);
  assert.equal(await prefs.getItemAsync!('zhezhi.diagram-project.v1'),'large drawing');
  assert.equal(prefs.getItem('zhezhi.diagram-project.v1'),'large drawing');
});
test('unchanged small-setting set skips I/O while changes and explicit CAS retain persistence checks',async()=>{
  const {prefs,calls,disk}=fixture();await prefs.refresh!();const baseline=calls.length;
  prefs.setItem('zhezhi.theme.v1','light');assert.equal(calls.length,baseline);
  assert.equal(prefs.compareAndSet!('zhezhi.theme.v1','light','light'),true);assert.equal(calls.length,baseline+1);
  prefs.setItem('zhezhi.theme.v1','dark');assert.equal(calls.length,baseline+2);assert.equal(disk.get('zhezhi.theme.v1'),'dark');
  disk.set('zhezhi.theme.v1','other window');prefs.setItem('zhezhi.theme.v1','dark');assert.equal(calls.length,baseline+2);assert.equal(disk.get('zhezhi.theme.v1'),'other window');
  assert.throws(()=>prefs.setItem('zhezhi.theme.v1','changed'),/其他窗口/);assert.equal(calls.length,baseline+3);
});
test('writes and CAS update memory only after persistence acknowledgement and reject other-window changes',async()=>{
  const {prefs,transport,disk}=fixture();await prefs.refresh!();
  let finish!:(value:boolean)=>void;transport.write=()=>new Promise(resolve=>{finish=resolve;});
  const pending=prefs.setItemAsync!('zhezhi.theme.v1','dark');assert.equal(prefs.getItem('zhezhi.theme.v1'),'light');finish(true);await pending;
  assert.equal(prefs.getItem('zhezhi.theme.v1'),'dark');
  disk.set('zhezhi.theme.v1','other window');
  assert.throws(()=>prefs.setItem('zhezhi.theme.v1','ours'),/其他窗口/);
  assert.equal(prefs.compareAndSet!('zhezhi.theme.v1','dark','ours'),false);
  assert.equal(prefs.getItem('zhezhi.theme.v1'),'dark');assert.equal(disk.get('zhezhi.theme.v1'),'other window');
});
test('failed persistence does not poison the cache or silently write elsewhere',async()=>{
  const {prefs,transport}=fixture();await prefs.refresh!();transport.write=async()=>{throw Error('disk full');};
  await assert.rejects(prefs.setItemAsync!('zhezhi.theme.v1','dark'),/disk full/);assert.equal(prefs.getItem('zhezhi.theme.v1'),'light');
});
test('a late read or snapshot cannot replace an acknowledged newer write',async()=>{
  const {prefs,transport}=fixture();await prefs.refresh!();
  let answer!:(value:string)=>void;transport.read=()=>new Promise(resolve=>{answer=resolve;});
  const reading=prefs.getItemAsync!('zhezhi.theme.v1');prefs.setItem('zhezhi.theme.v1','dark');answer('light');assert.equal(await reading,'dark');
  let snapshot!:(value:Record<string,string>)=>void;transport.snapshot=()=>new Promise(resolve=>{snapshot=resolve;});
  const refreshing=prefs.refresh!();prefs.setItem('zhezhi.theme.v1','green');snapshot({'zhezhi.theme.v1':'dark'});await refreshing;
  assert.equal(prefs.getItem('zhezhi.theme.v1'),'green');
});
test('directory refresh clears large records and rejects in-flight data from the old directory',async()=>{
  const {prefs,transport}=fixture();await prefs.refresh!();await prefs.getItemAsync!('zhezhi.diagram-project.v1');
  let answer!:(value:string)=>void;transport.read=()=>new Promise(resolve=>{answer=resolve;});
  const reading=prefs.getItemAsync!('zhezhi.diagram-project.v1');await prefs.refresh!(true);answer('old directory');
  await assert.rejects(reading,/保存目录已变化/);assert.equal(prefs.getItem('zhezhi.diagram-project.v1'),null);
});

test('record LRU releases old bodies without deleting disk data or small preferences',async()=>{
  const {prefs,disk}=fixture();await prefs.refresh!();
  const keys=Array.from({length:8},(_,i)=>'zhezhi.diagram-library-doc-'+String.fromCharCode(97+i).repeat(32)+'.v1');
  for(const key of keys){disk.set(key,'body:'+key);assert.equal(await prefs.getItemAsync!(key),'body:'+key);}
  assert.throws(()=>prefs.getItem(keys[0]),/缓存已释放/);assert.equal(prefs.getItem(keys.at(-1)!),disk.get(keys.at(-1)!));
  assert.throws(()=>prefs.setItem(keys[0],disk.get(keys[0])!),/缓存已释放/);
  assert.equal(prefs.getItem('zhezhi.theme.v1'),'light');assert.equal(disk.size,10);
  assert.equal(await prefs.getItemAsync!(keys[0]),disk.get(keys[0]));assert.equal(prefs.getItem(keys[0]),disk.get(keys[0]));
});
test('large records respect the byte budget while explicitly retained transaction records stay available',async()=>{
  const {prefs,disk}=fixture();await prefs.refresh!();
  const a='zhezhi.diagram-library-doc-'+ 'a'.repeat(32)+'.v1',b='zhezhi.diagram-library-doc-'+ 'b'.repeat(32)+'.v1';
  disk.set(a,'a'.repeat(9*1024*1024));disk.set(b,'b'.repeat(9*1024*1024));
  const release=prefs.retainRecords!([a,b]);await prefs.getItemAsync!(a);await prefs.getItemAsync!(b);
  assert.equal(prefs.getItem(a)!.length,9*1024*1024);assert.equal(prefs.getItem(b)!.length,9*1024*1024);
  release();assert.throws(()=>prefs.getItem(a),/缓存已释放/);assert.equal(prefs.getItem(b),disk.get(b));assert.equal(prefs.getItem('zhezhi.theme.v1'),'light');
  assert.equal(disk.get(a)!.length,9*1024*1024);assert.equal(disk.get(b)!.length,9*1024*1024);
});
