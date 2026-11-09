import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cases=JSON.parse(await readFile(path.join(root,'tests/fixtures/flasher-input-contract-20261010.json'),'utf8'));

test('real HTTP worker rejects explicit malformed inputs and recovers with unchanged default geometry',async()=>{
  const evidence=path.resolve(process.env.FLASHER_CONTRACT_EVIDENCE||path.join(root,'output/flasher-input-contract-api'));
  const data=path.join(evidence,'owned-server-data');
  await mkdir(data,{recursive:true});
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,windowsHide:true,
    env:{...process.env,ZHEZHI_PORT:'0',ZHEZHI_DATA_DIR:data,PYTHONDONTWRITEBYTECODE:'1'},
    stdio:['ignore','pipe','pipe']});
  let output='';let port=0;let exitObserved=false;
  child.once('exit',()=>{exitObserved=true;});
  try{
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error(`server did not start: ${output}`)),10000);
      child.stdout.on('data',chunk=>{output+=chunk;const match=/http:\/\/127\.0\.0\.1:(\d+)/.exec(output);
        if(match){port=Number(match[1]);clearTimeout(timer);resolve();}});
      child.stderr.on('data',chunk=>{output+=chunk;});
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('exit',code=>{clearTimeout(timer);if(!port)reject(new Error(`server exited ${code}: ${output}`));});
    });
    const base=`http://127.0.0.1:${port}`;
    const health=await (await fetch(`${base}/api/health`)).json();
    const post=async(text)=>{
      const response=await fetch(`${base}/api/tessellate`,{method:'POST',
        headers:{'Content-Type':'application/json','X-Zhezhi-Token':health.token},body:text,
        signal:AbortSignal.timeout(65000)});
      return {status:response.status,value:await response.json()};
    };
    const checks=[];
    for(const c of cases.invalid){
      const result=await post(JSON.stringify(c.input));
      assert.equal(result.status,422,`${c.name}: ${JSON.stringify(result.value)}`);
      assert.equal(typeof result.value.error,'string',c.name);
      assert.equal('fold' in result.value,false,c.name);
      checks.push({name:c.name,status:result.status,error:result.value.error});
    }
    for(const c of cases.raw){
      const result=await post(c.text);
      assert.equal(result.status,c.expected===null?422:200,c.name);
      if(c.expected!==null){
        assert.deepEqual(result.value.stats.parameters,c.expected,c.name);
        checks.push({name:c.name,status:result.status,parameters:result.value.stats.parameters});
      }else checks.push({name:c.name,status:result.status,error:result.value.error});
    }
    const omitted=await post('{"family":"flasher"}');
    const explicit=await post(JSON.stringify(cases.default));
    assert.equal(omitted.status,200);assert.equal(explicit.status,200);
    const stable=r=>{const copy=structuredClone(r);delete copy.stats.elapsedMs;return copy;};
    assert.deepEqual(stable(omitted.value),stable(explicit.value));
    assert.deepEqual(omitted.value.stats.parameters,cases.default);
    assert.equal(omitted.value.stats.checks.geometry.status,'passed');
    assert.equal(omitted.value.source.staticGlobalIsometryChecked,true);
    assert.equal(omitted.value.stats.checks.layerOrder.status,'not_checked');
    checks.push({name:'default-after-invalid-worker-recovery',status:200,
      counts:['vertices','edges','faces'].map(k=>omitted.value.stats[k]),completeResponsesEqualExceptElapsedMs:true});
    await writeFile(path.join(evidence,'api-checks.json'),JSON.stringify({checks,invalidRequests:cases.invalid.length,rawRequests:cases.raw.length},null,2)+'\n');
    await writeFile(path.join(evidence,'default-http-response.json'),JSON.stringify(omitted.value,null,2)+'\n');
  }finally{
    if(!exitObserved){
      const exited=new Promise(resolve=>child.once('exit',resolve));
      child.kill('SIGTERM');
      await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,5000).unref())]);
      if(!exitObserved)child.kill('SIGKILL');
    }
    await writeFile(path.join(evidence,'owned-runtime-cleanup.json'),JSON.stringify({pid:child.pid,exitObserved,port,ownedOnly:true},null,2)+'\n');
  }
});
