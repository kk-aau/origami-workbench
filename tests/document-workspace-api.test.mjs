import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tempRoot=path.join(root,'.toolchain/tmp/document-workspace-api');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
let processHandle,directory,origin,token;
const source=name=>({name,paper:{width:100,height:100},segments:[{id:'m',a:[0,0],b:[100,100],assignment:'M',angle:-180}],metadata:{preserve:name,values:[1,2,3]}});
async function request(route,{owner,body,method=body===undefined?'GET':'POST'}={}){
  const response=await fetch(origin+'/api/'+route,{method,headers:{'X-Zhezhi-Token':token,...(owner?{'X-Zhezhi-Document':owner}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json()};
}
before(async()=>{
  await mkdir(tempRoot,{recursive:true});directory=await mkdtemp(path.join(tempRoot,'case-'));
  const executable=process.env.ZHEZHI_RUST_SERVER||path.join(root,'src-tauri/target/debug',process.platform==='win32'?'zhezhi-server.exe':'zhezhi-server');
  processHandle=spawn(executable,[],{cwd:root,windowsHide:true,env:{...process.env,ZHEZHI_PORT:'0',ZHEZHI_TAURI_HOME:directory,ZHEZHI_DATA_DIR:path.join(directory,'data')},stdio:['ignore','pipe','pipe']});
  let text='';await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Isolated Rust service did not start')),30000);processHandle.once('error',reject);processHandle.once('exit',code=>reject(Error('Rust service exited '+code+' '+text)));processHandle.stdout.on('data',chunk=>{text+=chunk;const ready=text.match(/ZHEZHI_RUST_READY ([^\s]+)/);if(ready){clearTimeout(timer);origin='http://'+ready[1];resolve();}});processHandle.stderr.on('data',chunk=>{text+=chunk;});});
  token=(await(await fetch(origin+'/api/health')).json()).token;
});
after(async()=>{
  if(processHandle&&processHandle.exitCode===null){const stopped=new Promise(resolve=>processHandle.once('exit',resolve));processHandle.kill();await stopped;}
  if(directory){const resolved=path.resolve(directory);assert(resolved.startsWith(tempRoot+path.sep));await rm(resolved,{recursive:true,force:true});}
});
test('workspace HTTP drafts are separate while the shared project head and CAS remain authoritative',async()=>{
  const shared=await request('projects',{owner:A,body:{doc:source('正式原稿')}});assert.equal(shared.status,200);const{id,revision}=shared.body;
  const drafts=await Promise.all([request('projects/draft',{owner:A,body:{id,baseRevision:revision,doc:source('甲稿')}}),request('projects/draft',{owner:B,body:{id,baseRevision:revision,doc:source('乙稿')}})]);
  for(const draft of drafts){assert.equal(draft.status,200);assert.equal(draft.body.revision,revision);}
  assert.deepEqual((await request('projects/'+id+'?draft=1',{owner:A})).body.doc,source('甲稿'));
  assert.deepEqual((await request('projects/'+id+'?draft=1',{owner:B})).body.doc,source('乙稿'));
  assert.deepEqual((await request('projects/'+id+'?draft=1')).body.doc,source('正式原稿'));
  const saved=await request('projects',{owner:A,body:{id,baseRevision:revision,doc:source('甲正式版')}});assert.equal(saved.status,200);
  const stale=await request('projects',{owner:B,body:{id,baseRevision:revision,doc:source('乙旧稿')}});assert.equal(stale.status,409);
  const current=await request('projects/'+id+'?draft=1',{owner:B});assert.equal(current.body.workspaceDraftConflict,true);assert.deepEqual(current.body.doc,source('甲正式版'));
});
test('a private-only HTTP draft opens and renames without pretending it has a shared saved revision',async()=>{
  const draft=await request('projects/draft',{owner:A,body:{doc:source('仅甲未保存')}});assert.equal(draft.status,200);assert.equal(draft.body.revision,null);const id=draft.body.id;
  assert.equal((await request('projects/'+id+'?draft=1',{owner:B})).status,404);
  const renamed=await request('projects/'+id+'/rename',{owner:A,body:{name:'甲私有新名称',baseRevision:null}});assert.equal(renamed.status,200);assert.equal(renamed.body.revision,null);
  const opened=await request('projects/'+id+'?draft=1',{owner:A});assert.equal(opened.body.workspaceDraft,true);assert.equal(opened.body.revision,null);assert.equal(opened.body.doc.name,'甲私有新名称');
});
test('two document scopes can run full real tessellation independently',async()=>{
  const results=await Promise.all([request('tessellate',{owner:A,body:{family:'twist',sides:4,angle:36,scale:.5}}),request('tessellate',{owner:B,body:{family:'twist',sides:4,angle:27,scale:.5}})]);
  for(const result of results){assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.stats.checks.geometry.status,'passed');}
});
test('invalid calculation/document headers fail before allocating an owner or writing data',async()=>{
  const result=await request('projects/draft',{owner:'../another-document',body:{doc:source('不应写入')}});assert.equal(result.status,400);
});
