import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm,realpath} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));let child,dataDir,base,token,temp;
const artwork=name=>JSON.stringify({format:'zhezhi-artwork',version:1,editor:{schemaVersion:2,name,paper:{width:100,height:100},segments:[],objects:[]},models:null,diagram:null,simulation:null,construction:{tessellation:{family:'ring'},curve:null}});
const request=async(route,input,authenticate=true)=>{const response=await fetch(base+'/api/'+route,{method:input===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(authenticate?{'X-Zhezhi-Token':token}:{})},...(input===undefined?{}:{body:JSON.stringify(input)})});return {status:response.status,value:await response.json()};};
async function start(){child=spawn(process.env.ZHEZHI_RUST_SERVER || process.execPath, process.env.ZHEZHI_RUST_SERVER ? [] : ['server.mjs'],{cwd:root,windowsHide:true,env:{...process.env,ZHEZHI_PORT:'0',ZHEZHI_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});base=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error(text)),10000);child.stdout.on('data',chunk=>{text+=chunk;const match=text.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});child.stderr.on('data',chunk=>text+=chunk);child.once('exit',code=>{clearTimeout(timer);reject(Error('service exited '+code+' '+text));});});token=(await request('health')).value.token;}
async function stop(){if(child?.exitCode===null&&!child.signalCode){const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done;}}
before(async()=>{temp=await realpath(os.tmpdir());dataDir=await mkdtemp(path.join(temp,'zhezhi-artwork-recovery-'));await start();});
after(async()=>{await stop();assert.equal(path.dirname(dataDir),temp);await rm(dataDir,{recursive:true,force:true});});

test('real recovery endpoints persist independent snapshots and reject unauthenticated writes',async()=>{
  const a=randomUUID(),b=randomUUID();assert.equal((await request('artwork-recovery',{id:a,expectedRevision:null,text:artwork('未授权')},false)).status,403);
  for(const [id,name] of [[a,'窗口A'],[b,'窗口B']])assert.equal((await request('artwork-recovery',{id,expectedRevision:null,text:artwork(name)})).status,200);
  const listed=await request('artwork-recovery');assert.equal(listed.status,200);assert.ok(listed.value.entries.some(entry=>entry.id===a));assert.ok(listed.value.entries.some(entry=>entry.id===b));
  assert.equal(JSON.parse((await request('artwork-recovery/'+a)).value.text).editor.name,'窗口A');
});
test('complete artwork larger than 32 MiB saves and reopens through the real HTTP endpoint',async()=>{
  const id=randomUUID(),raw=JSON.parse(artwork('大作品'));
  raw.editor.metadata={padding:'x'.repeat(32*1024*1024+1)};const text=JSON.stringify(raw);
  const saved=await request('artwork-recovery',{id,expectedRevision:null,text});assert.equal(saved.status,200,JSON.stringify(saved.value));
  assert.ok(saved.value.bytes>32*1024*1024);
  const reopened=await request('artwork-recovery/'+id);assert.equal(reopened.status,200);assert.equal(reopened.value.text,text);assert.equal(reopened.value.summary.revision,saved.value.revision);
});
test('concurrent same-slot saves have one winner and invalid late envelopes preserve disk bytes',async()=>{
  const id=randomUUID(),seed=await request('artwork-recovery',{id,expectedRevision:null,text:artwork('原稿')}),expectedRevision=seed.value.revision;
  const replies=await Promise.all([1,2].map(n=>request('artwork-recovery',{id,expectedRevision,text:artwork('版本'+n)})));assert.deepEqual(replies.map(reply=>reply.status).sort(),[200,409]);
  const latest=(await request('artwork-recovery/'+id)).value,before=await readFile(path.join(dataDir,`artwork-recovery-${id}.json`)),bad=JSON.parse(artwork('无效'));bad.simulation={version:999};
  assert.equal((await request('artwork-recovery',{id,expectedRevision:latest.summary.revision,text:JSON.stringify(bad)})).status,400);assert.deepEqual(await readFile(path.join(dataDir,`artwork-recovery-${id}.json`)),before);
});
test('deletion tombstones survive service restart and reject stale automatic writers',async()=>{
  const id=randomUUID(),seed=await request('artwork-recovery',{id,expectedRevision:null,text:artwork('待删除')});assert.equal((await request(`artwork-recovery/${id}/delete`,{expectedRevision:seed.value.revision})).status,200);
  await stop();await start();assert.equal((await request('artwork-recovery/'+id)).status,404);
  for(const expectedRevision of [null,seed.value.revision])assert.equal((await request('artwork-recovery',{id,expectedRevision,text:artwork('过期重建')})).status,409);
  assert.ok(!(await request('artwork-recovery')).value.entries.some(entry=>entry.id===id));
});
