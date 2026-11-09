import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,readdir,rm,realpath} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {validateDoc} from '../src/core/projectValidation.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));let child,dataDir,base,token,temp;
const doc=(name='并发测试')=>({name,paper:{width:200,height:160},segments:[{id:'line',a:[0,0],b:[200,160],assignment:'M',angle:-180}]});
const request=async(route,input,method=input===undefined?'GET':'POST')=>{const response=await fetch(base+'/api/'+route,{method,headers:{'Content-Type':'application/json','X-Zhezhi-Token':token},...(input===undefined?{}:{body:JSON.stringify(input)})});return {status:response.status,value:await response.json()};};
async function start(){child=spawn(process.env.ZHEZHI_RUST_SERVER || process.execPath, process.env.ZHEZHI_RUST_SERVER ? [] : ['server.mjs'],{cwd:root,windowsHide:true,env:{...process.env,ZHEZHI_PORT:'0',ZHEZHI_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});base=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error(text)),10000);child.stdout.on('data',chunk=>{text+=chunk;const match=text.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});child.stderr.on('data',c=>text+=c);child.once('exit',code=>{clearTimeout(timer);reject(Error('service exited '+code+' '+text));});});token=(await request('health')).value.token;}
async function stop(){if(child?.exitCode===null&&!child.signalCode){const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done;}}
before(async()=>{temp=await realpath(os.tmpdir());dataDir=await mkdtemp(path.join(temp,'zhezhi-project-conflict-'));await start();});
after(async()=>{await stop();assert.equal(path.dirname(dataDir),temp);await rm(dataDir,{recursive:true,force:true});});
test('stale saved and automatic drafts cannot overwrite another session; a copy preserves both',async()=>{
 const saved=await request('projects',{doc:doc('共同基础')}),id=saved.value.id,baseRevision=saved.value.revision;
 assert.match(baseRevision,/^[a-f0-9]{64}$/);
 const a=await request('projects',{id,baseRevision,doc:doc('A已保存')}),before=await readFile(path.join(dataDir,'projects',id+'.json'));
 assert.equal(a.status,200);assert.notEqual(a.value.revision,baseRevision);
 for(const route of ['projects','projects/draft'])for(const revision of [baseRevision,null,undefined]){
  const stale=await request(route,{id,doc:doc('B旧稿'),...(revision===undefined?{}:{baseRevision:revision})});assert.equal(stale.status,409);assert.equal(stale.value.code,'project_conflict');assert.deepEqual(await readFile(path.join(dataDir,'projects',id+'.json')),before);
 }
 const copy=await request('projects',{doc:doc('B旧稿'),baseRevision:null});assert.equal(copy.status,200);assert.notEqual(copy.value.id,id);assert.equal((await request('projects/'+id)).value.doc.name,'A已保存');assert.equal((await request('projects/'+copy.value.id)).value.doc.name,'B旧稿');
});
test('saved and draft writes share one revision and concurrent writers have one winner',async()=>{
 const seed=await request('projects',{doc:doc()}),id=seed.value.id,baseRevision=seed.value.revision;
 const replies=await Promise.all(['projects','projects/draft'].map((route,i)=>request(route,{id,baseRevision,doc:doc('分支'+i)})));
 assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);const opened=await request('projects/'+id+'?draft=1');assert.equal(opened.value.revision,replies.find(r=>r.status===200).value.revision);
 const renamed=await request('projects/'+id+'/rename',{name:'已重命名',baseRevision:opened.value.revision});assert.equal(renamed.status,200);assert.notEqual(renamed.value.revision,opened.value.revision);
 assert.equal((await request('projects',{id,baseRevision:opened.value.revision,doc:doc('旧名称')})).status,409);
});
test('durable tombstones reject stale updates, no-revision recreation and recovery after service restart',async()=>{
 const saved=await request('projects',{doc:doc('稍后删除')}),id=saved.value.id;
 assert.equal((await request('projects/'+id,undefined,'DELETE')).status,200);await stop();await start();
 for(const route of ['projects','projects/draft'])for(const baseRevision of [saved.value.revision,null,undefined])assert.equal((await request(route,{id,doc:doc('不得复活'),...(baseRevision===undefined?{}:{baseRevision})})).status,409);
 assert.equal((await request('recovery',{projectId:id,doc:doc('不得恢复删除')})).status,409);assert.equal((await request('projects/'+id+'?draft=1')).status,404);
 assert.equal((await request('projects',{doc:doc('允许独立另存')})).status,200);
});
test('legacy files get stable revisions without a read rewriting them',async()=>{
 const id=randomUUID(),file=path.join(dataDir,'projects',id+'.json'),legacy=JSON.stringify({format:'zhezhi-project',version:1,id,updated:'2020-01-01T00:00:00.000Z',doc:doc('旧工程')});await writeFile(file,legacy);
 const a=await request('projects/'+id),b=await request('projects/'+id+'?draft=1');assert.equal(a.status,200);assert.equal(a.value.revision,b.value.revision);assert.equal(await readFile(file,'utf8'),legacy);
 assert.equal((await request('projects',{id,baseRevision:a.value.revision,doc:doc('兼容更新')})).status,200);
});
test('the same shared validator rejects invalid replacements before touching project, backup or recovery bytes',async()=>{
 const original=doc('有效内容'),seed=await request('projects',{doc:original}),id=seed.value.id;
 await request('recovery',{doc:original,projectId:id,baseRevision:seed.value.revision});
 const projectFile=path.join(dataDir,'projects',id+'.json'),recoveryFile=path.join(dataDir,'recovery.json'),before=await readFile(projectFile),recoveryBefore=await readFile(recoveryFile);
 const patches=[d=>d.segments.push({...d.segments[0]}),d=>d.paper.width=1_000_001,d=>d.segments[0].a=[1_000_001,0],d=>d.segments[0].angle=180,d=>{d.segments[0].assignment='B';d.segments[0].angle=30;},d=>d.segments[0].id=''];
 for(const patch of patches){const invalid=structuredClone(original);patch(invalid);assert.throws(()=>validateDoc(invalid));for(const route of ['projects','projects/draft','recovery']){const response=await request(route,{id,projectId:id,baseRevision:seed.value.revision,doc:invalid});assert.equal(response.status,400);assert.deepEqual(await readFile(projectFile),before);assert.deepEqual(await readFile(recoveryFile),recoveryBefore);}}
 assert.ok(!(await readdir(path.dirname(projectFile))).includes(id+'.json.bak'));
});
