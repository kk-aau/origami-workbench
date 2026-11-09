import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,realpath,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readProjectFile} from '../../src/app/importFile';
import {exportDocument} from '../../src/core/formats';
import {validateDoc,type Doc} from '../../src/core/types';

test('client-valid imported long titles survive project and recovery storage without truncation; rejected writes retain both copies',async()=>{
  const root=fileURLToPath(new URL('../../',import.meta.url)),tempRoot=await realpath(os.tmpdir());
  const dataRoot=await mkdtemp(path.join(tempRoot,'zhezhi-project-name-'));
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,windowsHide:true,
    env:{...process.env,ZHEZHI_PORT:'0',ZHEZHI_DATA_DIR:dataRoot},stdio:['ignore','pipe','pipe']});
  try{
    const port=await new Promise<number>((resolve,reject)=>{
      let output='';const timeout=setTimeout(()=>reject(Error('Isolated name-storage server did not start: '+output)),10000);
      child.stdout.on('data',chunk=>{output+=String(chunk);const ready=/http:\/\/127\.0\.0\.1:(\d+)/.exec(output);if(ready){clearTimeout(timeout);resolve(Number(ready[1]));}});
      child.stderr.on('data',chunk=>{output+=String(chunk);});
      child.once('error',error=>{clearTimeout(timeout);reject(error);});
      child.once('exit',code=>{clearTimeout(timeout);reject(Error(`Isolated name-storage server exited ${code}: ${output}`));});
    });
    const origin=`http://127.0.0.1:${port}`;
    const health=await (await fetch(origin+'/api/health')).json();
    async function request(route:string,value?:unknown){
      const response=await fetch(origin+'/api/'+route,{method:value===undefined?'GET':'POST',
        headers:value===undefined?{}:{'Content-Type':'application/json','X-Zhezhi-Token':health.token},
        body:value===undefined?undefined:JSON.stringify(value),signal:AbortSignal.timeout(10000)});
      return {status:response.status,value:await response.json()};
    }

    let projectId='',latest:Doc|undefined;
    for(const length of [121,5000])for(const format of ['json','fold'] as const){
      const name='长'.repeat(length)+' 🦢 <>&';
      const source:Doc={schemaVersion:2,name,paper:{width:200,height:200},objects:[],segments:[
        {id:'edge',a:[0,0],b:[200,0],assignment:'B',angle:0},
      ]};
      const file=new File([exportDocument(source,format).text],`long-title.${format}`,{type:'application/json'});
      const imported=(await readProjectFile(file)).doc;
      validateDoc(imported);assert.equal(imported.name,name);
      const saved=await request('projects',{doc:imported});
      assert.equal(saved.status,200,JSON.stringify(saved.value));projectId=saved.value.id;latest=imported;
      assert.deepEqual((await request('projects/'+projectId)).value.doc,imported);
      const listed=await request('projects');
      assert.equal(listed.status,200);assert.equal(listed.value.projects.find((entry:{id:string})=>entry.id===projectId).name,name);
      const recovery=await request('recovery',{doc:imported,projectId});
      assert.equal(recovery.status,200,JSON.stringify(recovery.value));
      const restored=await request('recovery');
      assert.deepEqual(restored.value.doc,imported);assert.equal(restored.value.projectId,projectId);
    }

    const projectFile=path.join(dataRoot,'projects',projectId+'.json'),recoveryFile=path.join(dataRoot,'recovery.json');
    const previousProject=await readFile(projectFile,'utf8'),previousRecovery=await readFile(recoveryFile,'utf8');
    for(const invalid of [{...latest,name:null},{...latest,name:42},
      {...latest,paper:{width:Infinity,height:200}}]){
      assert.equal((await request('projects',{id:projectId,doc:invalid})).status,400);
      assert.equal((await request('recovery',{projectId,doc:invalid})).status,400);
      assert.equal(await readFile(projectFile,'utf8'),previousProject);
      assert.equal(await readFile(recoveryFile,'utf8'),previousRecovery);
    }
    assert.deepEqual((await request('projects/'+projectId)).value.doc,latest);
    assert.deepEqual((await request('recovery')).value.doc,latest);
  }finally{
    if(child.exitCode===null&&child.signalCode===null){const closed=new Promise(resolve=>child.once('exit',resolve));child.kill();await closed;}
    // Delete only the exact temporary directory created for this test.
    assert.equal(path.dirname(path.resolve(dataRoot)),tempRoot);assert.match(path.basename(dataRoot),/^zhezhi-project-name-/);
    await rm(dataRoot,{recursive:true,force:true});
  }
});
