import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createActivityLog,sanitizeActivity} from '../src/core/activityLog.mjs';

async function fixture(){
  const base=await fs.realpath(os.tmpdir()),root=await fs.mkdtemp(path.join(base,'zhezhi-activity-unit-'));
  let current=path.join(root,'one'),storageTail=Promise.resolve();await fs.mkdir(current);
  const storage={runWrite(work){const task=storageTail.catch(()=>{}).then(()=>work({dataDir:current}));storageTail=task;return task;}};
  return{root,storage,get directory(){return current;},async move(){current=path.join(root,'two');await fs.mkdir(current);},async close(){await storageTail.catch(()=>{});assert.equal(path.dirname(root),base);assert.match(path.basename(root),/^zhezhi-activity-unit-/);await fs.rm(root,{recursive:true,force:true});}};
}
test('activity allowlist preserves useful diagnostics and basenames while stripping document, token, path and image content',()=>{
  const token='0123456789abcdef'.repeat(4),raw={action:'import.failed',level:'error',details:{fileName:'C:\\Users\\Alice\\折痕.CP',source:'http://localhost:8787/assets/index.js?token='+token,line:8,column:3,reason:'CP 第 8 行格式无效，文件 C:\\Users\\Alice\\private.CP',token,body:'sensitive project',doc:{name:'full project'},stack:'stack',objects:4,workspace:'edit',sessionId:'df9f57ad-cd20-42cc-bc40-e7bff03ad45e',previous:token,format:'cp',result:'failed'}};
  const safe=sanitizeActivity(raw,[token]),text=JSON.stringify(safe);
  assert.equal(safe.details.fileName,'折痕.CP');assert.equal(safe.details.source,'index.js');assert.equal(safe.details.line,8);assert.equal(safe.details.objects,4);
  assert.match(safe.details.reason,/CP 第 8 行格式无效/);for(const value of [token,'Alice','sensitive project','full project'])assert.ok(!text.includes(value));
  assert.deepEqual(sanitizeActivity(safe,[token]),safe,'persisted diagnostics remain useful after read-time sanitization');
  for(const key of ['token','body','doc','stack'])assert.ok(!Object.hasOwn(safe.details,key));
  assert.equal(sanitizeActivity({action:'test',details:{fileName:'data:image/png;base64,SECRET'}}).details.fileName,'[已过滤内容]');
  assert.throws(()=>sanitizeActivity({...raw,body:'extra'}),/仅接受/);assert.throws(()=>sanitizeActivity({action:'../path'}),/action/);assert.throws(()=>sanitizeActivity({action:'test',level:'debug'}),/级别/);
  assert.equal(sanitizeActivity({action:'test',details:{reason:'x'.repeat(5000),count:Infinity}}).details.reason.length,400);
});
test('concurrent appends remain complete and ordered while rotation bounds three files and reads return recent records',async()=>{
  const f=await fixture();try{
    const log=createActivityLog({storage:f.storage,appVersion:'0.13.25',fileBytes:1024});
    await Promise.all(Array.from({length:30},(_,count)=>log.append({action:'test.event',details:{count,reason:'诊断'.repeat(20)}})));
    const files=await fs.readdir(f.directory);assert.equal(files.length,3);
    const sizes=await Promise.all(files.map(async name=>(await fs.stat(path.join(f.directory,name))).size));assert.ok(sizes.every(size=>size<=1024));assert.ok(sizes.reduce((a,b)=>a+b,0)<=3072);
    for(const name of files)for(const line of (await fs.readFile(path.join(f.directory,name),'utf8')).trim().split('\n'))assert.doesNotThrow(()=>JSON.parse(line));
    const recent=await log.read(2);assert.deepEqual(recent.entries.map(e=>e.details.count),[28,29]);assert.equal(recent.truncated,true);assert.equal(recent.appVersion,'0.13.25');
    const exported=await log.export();assert.equal(exported.format,'zhezhi-activity-log');assert.equal(exported.version,1);assert.equal(exported.entries.at(-1).details.count,29);assert.ok(exported.notes.some(note=>note.includes('轮转')));assert.equal(new Set(exported.entries.map(e=>e.id)).size,exported.entries.length);
  }finally{await f.close();}
});
test('a truncated final NDJSON line cannot swallow a new event, and subsequent writes follow the current storage directory',async()=>{
  const f=await fixture();try{
    await fs.writeFile(path.join(f.directory,'activity.ndjson'),' {"incomplete":');
    const log=createActivityLog({storage:f.storage,appVersion:'test'});await log.append({action:'test.recovered'});
    const before=await log.read();assert.equal(before.entries.length,1);assert.equal(before.entries[0].action,'test.recovered');assert.equal(before.truncated,true);assert.ok(before.notes.some(note=>note.includes('损坏')));
    const old=f.directory;await f.move();await log.append({action:'test.moved'});
    assert.equal((await log.read()).entries[0].action,'test.moved');assert.match(await fs.readFile(path.join(old,'activity.ndjson'),'utf8'),/test.recovered/);assert.ok(!(await fs.readFile(path.join(old,'activity.ndjson'),'utf8')).includes('test.moved'));
  }finally{await f.close();}
});
test('oversized existing logs are read with a bounded tail and failures recover without poisoning the queue',async()=>{
  const f=await fixture();try{
    const log=createActivityLog({storage:f.storage,appVersion:'test',fileBytes:1024});
    await log.append({action:'test.valid'});const original=await fs.readFile(path.join(f.directory,'activity.ndjson'),'utf8');
    await fs.writeFile(path.join(f.directory,'activity.ndjson'),'x'.repeat(5000)+'\n'+original);const limited=await log.read();assert.equal(limited.entries.at(-1).action,'test.valid');assert.equal(limited.truncated,true);
    await fs.rm(path.join(f.directory,'activity.ndjson'));await fs.mkdir(path.join(f.directory,'activity.ndjson'));
    await assert.rejects(log.append({action:'test.failed'}),/日志暂不可用/);await fs.rmdir(path.join(f.directory,'activity.ndjson'));
    await log.append({action:'test.recovered'});assert.equal((await log.read()).entries.at(-1).action,'test.recovered');
    await assert.rejects(log.read(1001),/1 至 1000/);
  }finally{await f.close();}
});
test('flush waits for the final queued desktop close events and a full torn file never grows past its budget',async()=>{
  const f=await fixture();try{
    await fs.writeFile(path.join(f.directory,'activity.ndjson'),'x'.repeat(1024));
    let release;const held=new Promise(resolve=>{release=resolve;});
    f.storage.runWrite(()=>held);
    const log=createActivityLog({storage:f.storage,appVersion:'test',fileBytes:1024});
    const first=log.append({action:'desktop.close.requested'}),last=log.append({action:'desktop.close.confirmed'});
    let drained=false;const flush=log.flush().then(()=>{drained=true;});await Promise.resolve();assert.equal(drained,false);
    release();await flush;await Promise.all([first,last]);
    const recent=await log.read();assert.deepEqual(recent.entries.map(e=>e.action),['desktop.close.requested','desktop.close.confirmed']);
    for(const name of await fs.readdir(f.directory))assert.ok((await fs.stat(path.join(f.directory,name))).size<=1024);
  }finally{await f.close();}
});
