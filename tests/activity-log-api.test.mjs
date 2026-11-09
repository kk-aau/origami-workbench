import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('isolated activity API authenticates reads/exports, sanitizes operations, keeps logging failures separate and follows data migration',async()=>{
  const root=fileURLToPath(new URL('../',import.meta.url)),temp=await fs.realpath(os.tmpdir()),privateRoot=await fs.mkdtemp(path.join(temp,'zhezhi-activity-api-'));
  const bootstrap=path.join(privateRoot,'original'),target=path.join(privateRoot,'dataDir');await fs.mkdir(target);
  const child=spawn(process.execPath,['tests/helpers/storage-api-test-server.mjs'],{cwd:root,windowsHide:true,env:{...process.env,ZHEZHI_PORT:'0',ZHEZHI_DATA_DIR:bootstrap,ZHEZHI_STORAGE_TEST_ROOT:privateRoot},stdio:['ignore','pipe','pipe']});
  let token='';
  try{
    const port=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Activity test server startup timed out')),10000);child.stdout.on('data',chunk=>{output+=String(chunk);const match=/http:\/\/127\.0\.0\.1:(\d+)/.exec(output);if(match){clearTimeout(timer);resolve(Number(match[1]));}});child.stderr.on('data',chunk=>{output+=String(chunk);});child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);reject(Error('Test server exited '+code));});});
    const origin='http://127.0.0.1:'+port;
    const request=async(route,value,authenticate=true)=>{const response=await fetch(origin+route,{method:value===undefined?'GET':'POST',headers:{...(authenticate?{'X-Zhezhi-Token':token}:{}),...(value===undefined?{}:{'Content-Type':'application/json'})},body:value===undefined?undefined:JSON.stringify(value)});return{status:response.status,value:await response.json()};};
    token=(await request('/api/health')).value.token;
    for(const route of ['/api/activity','/api/activity/export'])assert.equal((await request(route,undefined,false)).status,403);
    assert.equal((await request('/api/activity',{action:'test'},false)).status,403);
    const initial=await request('/api/activity');assert.equal(initial.status,200);assert.ok(initial.value.entries.some(e=>e.action==='service.start'));const initialCount=initial.value.entries.length;
    await Promise.all(Array.from({length:30},(_,count)=>request('/api/activity',{action:'import.completed',details:{count,fileName:'C:\\private\\作品.CP',reason:'CP 第 8 行，请核对 /home/private/secret.CP',token,body:'project contents',format:'cp',segments:5,sessionId:'test-session'}}).then(r=>assert.equal(r.status,200))));
    const recent=await request('/api/activity?limit=100');assert.equal(recent.value.entries.length,initialCount+30);assert.equal(new Set(recent.value.entries.map(e=>e.id)).size,recent.value.entries.length);assert.ok(recent.value.entries.every(e=>e.timestamp&&e.appVersion));assert.ok(recent.value.entries.filter(e=>e.action==='import.completed').every(e=>e.details.fileName==='作品.CP'&&e.details.reason.includes('CP 第 8 行')));
    for(let n=0;n<3;n++)await request('/api/activity');assert.equal((await request('/api/activity')).value.entries.length,recent.value.entries.length,'reading activity never logs another activity event');
    assert.equal((await request('/api/activity',{action:'invalid',level:'debug'})).status,400);assert.equal((await request('/api/activity',{action:'invalid',details:{reason:'x'.repeat(17000)}})).status,413);assert.equal((await request('/api/activity?limit=1001')).status,400);
    assert.equal((await request('/api/projects',{doc:{name:'PRIVATE_DOCUMENT',body:token}})).status,400);
    const failed=await request('/api/activity');assert.ok(failed.value.entries.some(e=>e.action==='api.failure'&&e.details.status===400));
    const exportBefore=await request('/api/activity/export');assert.equal(exportBefore.value.format,'zhezhi-activity-log');assert.equal(exportBefore.value.version,1);assert.ok(exportBefore.value.generatedAt);for(const secret of [token,'PRIVATE_DOCUMENT','project contents','C:\\private','/home/private'])assert.ok(!JSON.stringify(exportBefore.value).includes(secret));
    // A broken log destination must neither poison later log writes nor block project saving.
    const logFile=path.join(bootstrap,'activity.ndjson'),kept=path.join(bootstrap,'activity.kept');await fs.rename(logFile,kept);await fs.mkdir(logFile);
    assert.equal((await request('/api/activity',{action:'test.write.failure'})).status,503);
    const doc={name:'logging failure does not block saving',paper:{width:100,height:100},segments:[]};assert.equal((await request('/api/projects',{doc})).status,200);
    await fs.rmdir(logFile);await fs.rename(kept,logFile);assert.equal((await request('/api/activity',{action:'test.write.recovered'})).status,200);
    const oldContent=await fs.readFile(logFile,'utf8'),selection=await request('/api/storage/pick',{kind:'dataDir'});assert.equal(selection.status,200);
    assert.equal((await request('/api/storage/apply',{selections:{dataDir:selection.value.selectionId},migrate:true})).status,200);
    assert.equal((await request('/api/activity',{action:'storage.after-change'})).status,200);
    const exported=await request('/api/activity/export');assert.ok(exported.value.entries.some(e=>e.action==='import.completed'),'existing operation history migrates with dataDir');assert.equal(exported.value.entries.at(-1).action,'storage.after-change');assert.equal(await fs.readFile(logFile,'utf8'),oldContent);assert.match(await fs.readFile(path.join(target,'activity.ndjson'),'utf8'),/storage.after-change/);
  }finally{
    if(child.exitCode===null&&child.signalCode===null){const ended=new Promise(resolve=>child.once('exit',resolve));child.kill();await ended;}
    assert.equal(path.dirname(privateRoot),temp);assert.match(path.basename(privateRoot),/^zhezhi-activity-api-/);await fs.rm(privateRoot,{recursive:true,force:true});
  }
});
