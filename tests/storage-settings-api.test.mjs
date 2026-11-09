import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),base=path.join(root,'output/storage-locations-tests-1013');
const doc=name=>({name,paper:{width:100,height:100},segments:[{id:'diagonal',a:[0,0],b:[100,100],assignment:'V',angle:180}]});

test('isolated local API authenticates storage, migrates real files and continues serving projects and preferences from chosen directories',async()=>{
  await fs.mkdir(base,{recursive:true});const privateRoot=await fs.mkdtemp(path.join(base,'storage-api-')),bootstrap=path.join(privateRoot,'original'),targets=Object.fromEntries(['projectsDir','diagramsDir','dataDir'].map(kind=>[kind,path.join(privateRoot,kind)]));for(const folder of Object.values(targets))await fs.mkdir(folder);
  let child,token='',origin='';
  try{
    child=spawn(process.execPath,['tests/helpers/storage-api-test-server.mjs'],{cwd:root,windowsHide:true,env:{...process.env,ZHEZHI_PORT:'0',ZHEZHI_DATA_DIR:bootstrap,ZHEZHI_STORAGE_TEST_ROOT:privateRoot},stdio:['ignore','pipe','pipe']});
    const port=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(new Error('Isolated storage API startup timed out')),10000);child.stdout.on('data',chunk=>{output+=chunk.toString();const match=/http:\/\/127\.0\.0\.1:(\d+)/.exec(output);if(match){clearTimeout(timer);resolve(Number(match[1]));}});child.stderr.on('data',chunk=>{output+=chunk.toString();});child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Isolated service exited ${code}: ${output}`));});});origin=`http://127.0.0.1:${port}`;
    const request=async(route,value,headers={})=>{const response=await fetch(origin+route,{method:value===undefined?'GET':'POST',headers:{'X-Zhezhi-Token':token,...(value===undefined?{}:{'Content-Type':'application/json'}),...headers},body:value===undefined?undefined:JSON.stringify(value)});return {status:response.status,value:await response.json()};};
    const health=await request('/api/health');token=health.value.token;assert.equal(health.value.ok,true);
    assert.equal((await request('/api/storage',undefined,{'X-Zhezhi-Token':'wrong'})).status,403);assert.equal((await request('/api/storage',undefined,{Origin:'https://untrusted.invalid'})).status,403);
    const initial=await request('/api/storage');assert.equal(initial.status,200);assert.equal(initial.value.configured,false);assert.equal(initial.value.paths.dataDir,bootstrap);
    for(const route of ['/api/storage/pick','/api/storage/apply'])assert.equal((await request(route,{padding:'x'.repeat(16*1024)})).status,413);
    const snapshotKey='zhezhi.diagram-library-doc-'+ 'b'.repeat(32)+'.v1';
    assert.equal((await request('/api/storage/preferences',{key:'zhezhi.theme.v1',value:'dark'})).status,200);
    assert.equal((await request('/api/storage/preferences',{key:'zhezhi.theme.v1',value:'x'.repeat(256*1024)})).status,400);
    assert.equal((await request('/api/storage/preferences?key=zhezhi.theme.v1')).value.value,'dark');
    assert.equal((await request('/api/storage/preferences',{key:'zhezhi.diagram-library.v1',value:'library index'})).status,200);
    assert.equal((await request('/api/storage/preferences',{key:'zhezhi.diagram-library.v1',value:'unsafe overwrite'})).status,409);
    const indexWriters=await Promise.all(['branch A','branch B'].map(value=>request('/api/storage/preferences',{key:'zhezhi.diagram-library.v1',expectedValue:'library index',value})));
    assert.deepEqual(indexWriters.map(reply=>reply.status).sort(),[200,409]);
    assert.ok(['branch A','branch B'].includes((await request('/api/storage/preferences?key=zhezhi.diagram-library.v1')).value.value));
    assert.equal((await request('/api/storage/preferences',{key:snapshotKey,value:'saved and draft drawing'})).status,200);
    assert.equal((await request('/api/storage/preferences?key='+encodeURIComponent(snapshotKey))).value.value,'saved and draft drawing');
    assert.equal((await request('/api/storage/preferences',{key:'../escape',value:'forbidden'})).status,400);assert.equal((await request('/api/storage/preferences?key=zhezhi.theme.v1',undefined,{'X-Zhezhi-Token':''})).status,403);
    const saved=await request('/api/projects',{doc:doc('原工程')});assert.equal(saved.status,200);const projectId=saved.value.id;
    assert.equal((await request('/api/recovery',{doc:doc('自动恢复'),projectId})).status,200);
    assert.equal((await request('/api/storage/apply',{selections:{},migrate:true,path:targets.dataDir})).status,400);
    const selections={};for(const kind of Object.keys(targets)){const chosen=await request('/api/storage/pick',{kind});assert.equal(chosen.status,200);assert.equal(chosen.value.path,targets[kind]);selections[kind]=chosen.value.selectionId;}
    const applied=await request('/api/storage/apply',{selections,migrate:true});assert.equal(applied.status,200);assert.equal(applied.value.configured,true);assert.equal(applied.value.retainedSource,true);assert.deepEqual(applied.value.paths,targets);assert.equal(applied.value.busy,false);
    assert.equal((await request('/api/projects')).value.projects[0].id,projectId);assert.equal((await request('/api/projects/'+projectId)).value.doc.name,'原工程');assert.equal((await request('/api/recovery')).value.doc.name,'自动恢复');assert.equal((await request('/api/storage/preferences?key='+encodeURIComponent(snapshotKey))).value.value,'saved and draft drawing');
    await request('/api/projects',{id:projectId,baseRevision:(await request('/api/projects/'+projectId)).value.revision,doc:doc('迁移后修改')});await request('/api/storage/preferences',{key:'zhezhi.theme.v1',value:'light'});
    assert.equal(JSON.parse(await fs.readFile(path.join(targets.projectsDir,projectId+'.json'),'utf8')).doc.name,'迁移后修改');assert.equal(JSON.parse(await fs.readFile(path.join(bootstrap,'projects',projectId+'.json'),'utf8')).doc.name,'原工程');assert.equal(JSON.parse(await fs.readFile(path.join(targets.dataDir,'preferences.json'),'utf8'))['zhezhi.theme.v1'],'light');assert.equal(JSON.parse(await fs.readFile(path.join(bootstrap,'preferences.json'),'utf8'))['zhezhi.theme.v1'],'dark');
    assert.equal((await request('/api/storage/apply',{selections,migrate:true})).status,400);
    // Escaping can make the HTTP envelope much larger than the document string.
    const escaped='\0'.repeat(9_000_000);assert.ok(Buffer.byteLength(JSON.stringify({key:snapshotKey,value:escaped}))>8_500_000*6);
    assert.equal((await request('/api/storage/preferences',{key:snapshotKey,value:escaped})).status,200);assert.equal((await request('/api/storage/preferences?key='+encodeURIComponent(snapshotKey))).value.value.length,escaped.length);
    assert.equal((await request('/api/storage/preferences',{key:snapshotKey,value:'x'.repeat(8_500_001)})).status,200);assert.equal((await request('/api/storage/preferences?key='+encodeURIComponent(snapshotKey))).value.value.length,8_500_001);
    const large=await request('/api/projects',{doc:{...doc('大文件'),metadata:{note:'x'.repeat(32*1024*1024+4097)}}});assert.equal(large.status,200);assert.equal((await request('/api/projects/'+large.value.id)).value.doc.metadata.note.length,32*1024*1024+4097);assert.equal((await request('/api/projects/'+projectId)).value.doc.name,'迁移后修改');
  }finally{
    if(child&&child.exitCode===null&&child.signalCode===null){const closed=new Promise(resolve=>child.once('exit',resolve));child.kill();await closed;}
    assert.equal(path.dirname(privateRoot),base);assert.match(path.basename(privateRoot),/^storage-api-/);await fs.rm(privateRoot,{recursive:true,force:true});
  }
});
