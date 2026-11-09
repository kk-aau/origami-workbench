import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
test('unavailable configured storage keeps the service and recovery picker alive without creating empty source directories',async t=>{
 const temp=await fs.realpath(os.tmpdir()),run=await fs.mkdtemp(path.join(temp,'zhezhi-unavailable-api-')),bootstrap=path.join(run,'bootstrap'),source=path.join(run,'disconnected'),retained=path.join(run,'retained');let child;
 t.after(async()=>{if(child?.exitCode===null&&!child.signalCode){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}assert.equal(path.dirname(run),temp);await fs.rm(run,{recursive:true,force:true});});
 await fs.mkdir(bootstrap);for(const name of ['projects','diagrams','data'])await fs.mkdir(path.join(source,name),{recursive:true});const kinds=['projectsDir','diagramsDir','dataDir'];for(const kind of kinds)await fs.mkdir(path.join(run,kind));
 const id=randomUUID(),doc={name:'重连后的已有工程',paper:{width:100,height:100},segments:[]},project=JSON.stringify({format:'zhezhi-project',version:1,id,updated:'2020-01-01T00:00:00.000Z',doc});await fs.writeFile(path.join(source,'projects',id+'.json'),project);await fs.copyFile(path.join(source,'projects',id+'.json'),path.join(run,'projectsDir',id+'.json'));
 const config={version:1,configured:true,paths:{projectsDir:path.join(source,'projects'),diagramsDir:path.join(source,'diagrams'),dataDir:path.join(source,'data')}};await fs.writeFile(path.join(bootstrap,'storage-locations.json'),JSON.stringify(config));await fs.rename(source,retained);
 child=spawn(process.execPath,['tests/helpers/storage-api-test-server.mjs'],{cwd:root,windowsHide:true,env:{...process.env,ZHEZHI_PORT:'0',ZHEZHI_DATA_DIR:bootstrap,ZHEZHI_STORAGE_TEST_ROOT:run},stdio:['ignore','pipe','pipe']});
 const base=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error(text)),10000);child.stdout.on('data',c=>{text+=c;const match=text.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});child.stderr.on('data',c=>text+=c);child.once('exit',code=>{clearTimeout(timer);reject(Error('server exited '+code+' '+text));});});let token='';
 const request=async(route,input)=>{const r=await fetch(base+'/api/'+route,{method:input===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Zhezhi-Token':token},...(input===undefined?{}:{body:JSON.stringify(input)})});return {status:r.status,value:await r.json()};};
 const health=await request('health');assert.equal(health.status,200);token=health.value.token;
 const initial=(await request('storage')).value;assert.deepEqual(initial.paths,config.paths);assert.equal(initial.unavailable.length,3);
 for(const route of ['projects','projects/'+id,'recovery','storage/preferences?key=zhezhi.theme.v1'])assert.equal((await request(route)).status,503,route);
 assert.equal((await request('projects',{doc})).status,503);assert.equal((await request('storage/apply',{selections:{},migrate:true,recoverUnavailable:true})).status,503);
 await assert.rejects(fs.stat(source),{code:'ENOENT'});assert.deepEqual(JSON.parse(await fs.readFile(path.join(bootstrap,'storage-locations.json'),'utf8')),config);
 const selections={};for(const kind of kinds){const chosen=await request('storage/pick',{kind});assert.equal(chosen.status,200);selections[kind]=chosen.value.selectionId;}
 assert.equal((await request('storage/apply',{selections:{projectsDir:selections.projectsDir},migrate:true,recoverUnavailable:true})).status,503);
 const applied=await request('storage/apply',{selections,migrate:true,recoverUnavailable:true});assert.equal(applied.status,200,JSON.stringify(applied.value));assert.equal(applied.value.unavailable.length,0);
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(bootstrap,'storage-locations.json.bak'),'utf8')),config);assert.equal((await request('projects/'+id)).value.doc.name,doc.name);assert.equal(await fs.readFile(path.join(retained,'projects',id+'.json'),'utf8'),project);await assert.rejects(fs.stat(source),{code:'ENOENT'});
});
