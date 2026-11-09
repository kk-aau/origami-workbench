import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {withProjectBaseRevision} from './helpers/project-base-revision.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const doc=name=>({name,paper:{width:200,height:160},segments:[{id:'mountain',a:[0,0],b:[200,160],assignment:'M',angle:-180}],note:'PRIVATE_DOCUMENT_BODY'});

async function fixture(t){
  const temp=await fs.realpath(os.tmpdir()),privateRoot=await fs.mkdtemp(path.join(temp,'zhezhi-project-delete-'));
  const bootstrap=path.join(privateRoot,'original'),control=path.join(privateRoot,'fault.json'),marker=path.join(privateRoot,'blocked'),release=path.join(privateRoot,'release');
  const targets=Object.fromEntries(['projectsDir','diagramsDir','dataDir'].map(kind=>[kind,path.join(privateRoot,kind)]));
  for(const directory of Object.values(targets))await fs.mkdir(directory);
  // Faults live only in this private child process. Production has no test
  // switches or unauthenticated route for changing paths or filesystem calls.
  const preload=path.join(privateRoot,'fault-preload.cjs');
  await fs.writeFile(preload,`
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path');
const {syncBuiltinESMExports}=require('node:module');
const original={rename:fsp.rename,unlink:fsp.unlink,copyFile:fsp.copyFile};
const used=new Set();
const current=()=>{try{return JSON.parse(fs.readFileSync(${JSON.stringify(control)},'utf8'));}catch{return null;}};
async function fault(kind,source,target){
  const input=current();if(!input||used.has(input.mode))return;
  const stage=kind==='rename'&&String(source).endsWith(input.id+'.draft.json')&&String(target).includes('.zhezhi-delete-');
  const cleanup=kind==='unlink'&&path.basename(String(source)).startsWith(input.id+'.draft.json.zhezhi-delete-');
  const save=kind==='rename'&&String(source).endsWith('.tmp')&&path.basename(String(target))===input.id+'.json';
  const migration=kind==='copyFile'&&String(source).includes('.zhezhi-migrate-')&&path.basename(String(target))===input.id+'.json';
  const deleting=kind==='rename'&&path.basename(String(source))===input.id+'.json'&&String(target).includes('.zhezhi-delete-');
  if(!(input.mode==='stage-failure'&&stage||input.mode==='cleanup-failure'&&cleanup||input.mode==='save-gate'&&save||input.mode==='migration-gate'&&migration||input.mode==='delete-gate'&&deleting))return;
  used.add(input.mode);fs.writeFileSync(${JSON.stringify(marker)},input.mode);
  if(input.mode.endsWith('-failure'))throw Object.assign(new Error('Injected private test fault'),{code:'EACCES'});
  const deadline=Date.now()+10000;
  while(!fs.existsSync(${JSON.stringify(release)})){if(Date.now()>deadline)throw Object.assign(new Error('Private gate timed out'),{code:'ETIMEDOUT'});await new Promise(resolve=>setTimeout(resolve,10));}
}
fsp.rename=async(source,target)=>{await fault('rename',source,target);return original.rename(source,target);};
fsp.unlink=async source=>{await fault('unlink',source);return original.unlink(source);};
fsp.copyFile=async(source,target,...rest)=>{await fault('copyFile',source,target);return original.copyFile(source,target,...rest);};
syncBuiltinESMExports();
`);
  let child;
  t.after(async()=>{
    await fs.writeFile(release,'release').catch(()=>{});
    if(child&&child.exitCode===null&&!child.signalCode){
      const ended=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');
      let timer;await Promise.race([ended,new Promise(resolve=>{timer=setTimeout(resolve,5000);})]);clearTimeout(timer);
      if(child.exitCode===null&&!child.signalCode){child.kill('SIGKILL');await ended;}
    }
    assert.equal(path.dirname(privateRoot),temp);assert.match(path.basename(privateRoot),/^zhezhi-project-delete-/);
    await fs.rm(privateRoot,{recursive:true,force:true});
  });
  child=spawn(process.execPath,['--require',preload,'tests/helpers/storage-api-test-server.mjs'],{cwd:root,windowsHide:true,env:{...process.env,ZHEZHI_PORT:'0',ZHEZHI_DATA_DIR:bootstrap,ZHEZHI_STORAGE_TEST_ROOT:privateRoot},stdio:['ignore','pipe','pipe']});
  const base=await new Promise((resolve,reject)=>{
    let output='';const timer=setTimeout(()=>reject(new Error('删除测试服务启动超时：'+output)),10000);
    child.stdout.on('data',chunk=>{output+=chunk;const ready=/http:\/\/127\.0\.0\.1:(\d+)/.exec(output);if(ready){clearTimeout(timer);resolve(ready[0]);}});
    child.stderr.on('data',chunk=>{output+=chunk;});
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);reject(new Error('删除测试服务退出 '+code+'：'+output));});
  });
  let token='';
  const request=(route,{method='GET',json,headers={},authenticate=true}={})=>new Promise((resolve,reject)=>{
    const payload=json===undefined?undefined:JSON.stringify(json);
    const req=http.request(new URL(base+route),{method,headers:{...(authenticate?{'X-Zhezhi-Token':token}:{}),...(payload===undefined?{}:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}),...headers}},response=>{
      let text='';response.setEncoding('utf8');response.on('data',chunk=>{text+=chunk;});response.on('error',reject);
      response.on('end',()=>{try{resolve({status:response.statusCode,value:JSON.parse(text)});}catch(error){reject(error);}});
    });
    req.on('error',reject);req.setTimeout(15000,()=>req.destroy(new Error('删除接口测试超时：'+route)));req.end(payload);
  });
  token=(await request('/api/health')).value.token;
  const post=async(route,json)=>request(route,{method:'POST',json:await withProjectBaseRevision(route,json,request)});
  const remove=id=>request('/api/projects/'+id,{method:'DELETE'});
  const file=(id,suffix='.json')=>path.join(bootstrap,'projects',id+suffix);
  const inject=async(mode,id)=>{await fs.rm(marker,{force:true});await fs.rm(release,{force:true});await fs.writeFile(control,JSON.stringify({mode,id}));};
  const blocked=async()=>{const deadline=Date.now()+5000;while(Date.now()<deadline){try{return await fs.readFile(marker,'utf8');}catch{await delay(10);}}throw new Error('私有文件故障未被触发');};
  const unblock=()=>fs.writeFile(release,'release');
  const selections=async()=>{const chosen={};for(const kind of Object.keys(targets)){const reply=await post('/api/storage/pick',{kind});assert.equal(reply.status,200);chosen[kind]=reply.value.selectionId;}return chosen;};
  return {privateRoot,bootstrap,targets,request,post,remove,file,inject,blocked,unblock,selections};
}

test('删除接口校验当前 token、Origin、Host 和 UUID，不触及其他工程',async t=>{
  const task=await fixture(t),saved=await task.post('/api/projects',{doc:doc('保留工程')}),id=saved.value.id;
  const before=await fs.readFile(task.file(id));
  for(const options of [{authenticate:false},{headers:{'X-Zhezhi-Token':'wrong'}},{headers:{Origin:'https://untrusted.invalid'}},{headers:{Host:'untrusted.invalid'}}])assert.equal((await task.request('/api/projects/'+id,{method:'DELETE',...options})).status,403);
  for(const invalid of ['not-a-uuid','------------------------------------','..%2Foutside',id+'.json',id+'%00'])assert.equal((await task.remove(invalid)).status,400);
  assert.deepEqual(await fs.readFile(task.file(id)),before);
  assert.equal((await task.request('/api/projects/'+id)).status,200);
});

test('删除手动版、草稿、对应备份和匹配恢复稿；重复删除返回明确幂等结果并记录安全日志',async t=>{
  const task=await fixture(t),saved=await task.post('/api/projects',{doc:doc('PRIVATE_DELETED_NAME')}),id=saved.value.id;
  await task.post('/api/projects',{id,doc:doc('PRIVATE_DELETED_UPDATED')});
  await task.post('/api/projects/draft',{id,doc:doc('PRIVATE_DRAFT_NAME')});await task.post('/api/projects/draft',{id,doc:doc('PRIVATE_DRAFT_UPDATED')});
  await task.post('/api/recovery',{projectId:id,doc:doc('PRIVATE_RECOVERY')});await task.post('/api/recovery',{projectId:id,doc:doc('PRIVATE_RECOVERY_UPDATED')});
  const other=(await task.post('/api/projects',{doc:doc('保留文档')})).value.id,otherBytes=await fs.readFile(task.file(other));
  assert.equal((await fs.readdir(path.join(task.bootstrap,'projects'))).filter(name=>name.startsWith(id)).length,4);
  assert.deepEqual(await task.remove(id),{status:200,value:{id,deleted:true}});
  assert.equal((await task.request('/api/projects/'+id)).status,404);assert.equal((await task.request('/api/projects/'+id+'?draft=1')).status,404);
  assert.ok(!(await task.request('/api/projects?library=1')).value.projects.some(project=>project.id===id));
  assert.deepEqual(await fs.readFile(task.file(other)),otherBytes);
  assert.ok(!(await fs.readdir(path.join(task.bootstrap,'projects'))).some(name=>name.startsWith(id)));
  for(const name of ['recovery.json','recovery.json.bak'])await assert.rejects(fs.stat(path.join(task.bootstrap,name)),{code:'ENOENT'});
  assert.deepEqual((await task.request('/api/recovery')).value,{doc:null});
  assert.deepEqual(await task.remove(id),{status:200,value:{id,deleted:false}});
  const logs=(await task.request('/api/activity')).value.entries,events=logs.filter(entry=>entry.action==='project.delete');
  assert.deepEqual(events.map(entry=>entry.details.result),['deleted','already-absent']);assert.equal(events[0].details.files,6);assert.equal(events[0].details.target,id);
  const text=JSON.stringify(logs);for(const secret of ['PRIVATE_DELETED','PRIVATE_DRAFT','PRIVATE_RECOVERY','PRIVATE_DOCUMENT_BODY',task.privateRoot])assert.ok(!text.includes(secret));
});

test('仅草稿和仅备份文档可删除，其他工程恢复稿及无法识别的损坏恢复稿保持原样',async t=>{
  const task=await fixture(t),draft=(await task.post('/api/projects/draft',{doc:doc('仅草稿')})).value.id,other=randomUUID();
  await task.post('/api/recovery',{projectId:other,doc:doc('其他工程恢复稿')});await task.post('/api/recovery',{projectId:other,doc:doc('其他工程新恢复稿')});
  const recovery=path.join(task.bootstrap,'recovery.json'),before=await fs.readFile(recovery),backup=await fs.readFile(recovery+'.bak');
  assert.equal((await task.remove(draft)).value.deleted,true);assert.deepEqual(await fs.readFile(recovery),before);assert.deepEqual(await fs.readFile(recovery+'.bak'),backup);
  const backupOnly=randomUUID();await fs.writeFile(task.file(backupOnly,'.json.bak'),'damaged but explicitly selected project backup');
  await fs.writeFile(recovery+'.bak',JSON.stringify({projectId:backupOnly,doc:doc('删除匹配恢复备份')}));
  assert.equal((await task.remove(backupOnly)).value.deleted,true);assert.deepEqual(await fs.readFile(recovery),before);await assert.rejects(fs.stat(recovery+'.bak'),{code:'ENOENT'});
  const saved=(await task.post('/api/projects',{doc:doc('损坏恢复稿旁的工程')})).value.id;
  await fs.writeFile(recovery,'{');assert.equal((await task.remove(saved)).value.deleted,true);assert.equal(await fs.readFile(recovery,'utf8'),'{');
});

test('文档变体为目录时先拒绝，保留健康主文件且不递归删除目录内容',async t=>{
  const task=await fixture(t),id=(await task.post('/api/projects',{doc:doc('必须保留')})).value.id,before=await fs.readFile(task.file(id));
  await fs.mkdir(task.file(id,'.draft.json'));const sentinel=path.join(task.file(id,'.draft.json'),'keep.txt');await fs.writeFile(sentinel,'unrelated');
  const reply=await task.remove(id);assert.equal(reply.status,409);assert.match(reply.value.error,/非普通文件/);
  assert.deepEqual(await fs.readFile(task.file(id)),before);assert.equal(await fs.readFile(sentinel,'utf8'),'unrelated');
  assert.ok(!(await fs.readdir(path.join(task.bootstrap,'projects'))).some(name=>name.includes('.zhezhi-delete-')));
});

test('第二个文件移动失败时回滚已移动主文件并保留全部原字节，不误报删除成功',async t=>{
  const task=await fixture(t),id=(await task.post('/api/projects',{doc:doc('事务主文件')})).value.id;
  await task.post('/api/projects/draft',{id,doc:doc('事务草稿')});await task.post('/api/recovery',{projectId:id,doc:doc('事务恢复稿')});
  const files=[task.file(id),task.file(id,'.draft.json'),path.join(task.bootstrap,'recovery.json')],before=await Promise.all(files.map(file=>fs.readFile(file)));
  await task.inject('stage-failure',id);const reply=await task.remove(id);assert.equal(await task.blocked(),'stage-failure');assert.equal(reply.status,503);assert.match(reply.value.error,/原文档已恢复/);
  for(const [index,file] of files.entries())assert.deepEqual(await fs.readFile(file),before[index]);
  assert.equal((await task.request('/api/projects/'+id+'?draft=1')).status,200);
  assert.ok(!(await fs.readdir(path.join(task.bootstrap,'projects'))).some(name=>name.includes('.zhezhi-delete-')));
  assert.ok(!(await task.request('/api/activity')).value.entries.some(entry=>entry.action==='project.delete'));
});

test('提交后临时副本清理失败返回已删除及 warning，文档库不复活并记录警告',async t=>{
  const task=await fixture(t),id=(await task.post('/api/projects',{doc:doc('清理故障工程')})).value.id;
  await task.post('/api/projects/draft',{id,doc:doc('保留的临时副本')});await task.inject('cleanup-failure',id);
  const reply=await task.remove(id);assert.equal(await task.blocked(),'cleanup-failure');assert.equal(reply.status,200);assert.equal(reply.value.deleted,true);assert.match(reply.value.warning,/文档已删除/);
  assert.equal((await task.request('/api/projects/'+id+'?draft=1')).status,404);assert.ok(!(await task.request('/api/projects?library=1')).value.projects.some(project=>project.id===id));
  const leftovers=(await fs.readdir(path.join(task.bootstrap,'projects'))).filter(name=>name.startsWith(id));assert.equal(leftovers.length,1);assert.match(leftovers[0],/\.draft\.json\.zhezhi-delete-[a-f0-9-]+\.tmp$/);
  assert.deepEqual((await task.remove(id)).value,{id,deleted:false});
  const event=(await task.request('/api/activity')).value.entries.find(entry=>entry.action==='project.delete'&&entry.level==='warning');assert.equal(event.details.result,'deleted-with-cleanup-warning');
});

test('删除排在同一工程正在写入的保存之后，等待中的读取不会看到已删除工程',async t=>{
  const task=await fixture(t),id=(await task.post('/api/projects',{doc:doc('原文档')})).value.id;
  await task.inject('save-gate',id);const saving=task.post('/api/projects',{id,doc:doc('队列中的新版本')});assert.equal(await task.blocked(),'save-gate');
  const deleting=task.remove(id);await delay(40);const reading=task.request('/api/projects/'+id+'?draft=1');await task.unblock();
  assert.equal((await saving).status,200);assert.equal((await deleting).value.deleted,true);assert.equal((await reading).status,404);
  assert.ok(!(await fs.readdir(path.join(task.bootstrap,'projects'))).some(name=>name.startsWith(id)));
});

test('目录迁移在先时，排队删除使用新目录并保留迁移故意留下的旧来源副本',async t=>{
  const task=await fixture(t),id=(await task.post('/api/projects',{doc:doc('迁移后删除')})).value.id,before=await fs.readFile(task.file(id));
  const selections=await task.selections();await task.inject('migration-gate',id);
  const migrating=task.post('/api/storage/apply',{selections,migrate:true});assert.equal(await task.blocked(),'migration-gate');
  const deleting=task.remove(id);await delay(40);await task.unblock();assert.equal((await migrating).status,200);assert.equal((await deleting).value.deleted,true);
  assert.equal((await task.request('/api/projects/'+id)).status,404);await assert.rejects(fs.stat(path.join(task.targets.projectsDir,id+'.json')),{code:'ENOENT'});assert.deepEqual(await fs.readFile(task.file(id)),before);
});

test('删除在先时，目录迁移等待提交后再复制，不复制已删除文档',async t=>{
  const task=await fixture(t),id=(await task.post('/api/projects',{doc:doc('删除后迁移')})).value.id,selections=await task.selections();
  await task.inject('delete-gate',id);const deleting=task.remove(id);assert.equal(await task.blocked(),'delete-gate');
  const migrating=task.post('/api/storage/apply',{selections,migrate:true});await delay(40);await task.unblock();assert.equal((await deleting).value.deleted,true);assert.equal((await migrating).status,200);
  for(const directory of [path.join(task.bootstrap,'projects'),task.targets.projectsDir])assert.ok(!(await fs.readdir(directory)).some(name=>name.startsWith(id)));
  assert.equal((await task.request('/api/projects/'+id)).status,404);
});
