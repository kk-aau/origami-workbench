import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixtures=JSON.parse(await readFile(path.join(root,'tests/fixtures/discrete-curve-cp-20261010.json'),'utf8')).cases;
test('new finite CP route rejects malformed inputs and preserves original raw query semantics',async()=>{
 const out=process.env.DISCRETE_CP_EVIDENCE||path.join(root,'output/playwright/discrete-curve-cp-api');await mkdir(out,{recursive:true});
 const child=spawn(process.execPath,['server.mjs'],{cwd:root,windowsHide:true,
  env:{...process.env,ZHEZHI_PORT:'0',ZHEZHI_DATA_DIR:path.join(out,'owned-data'),PYTHONDONTWRITEBYTECODE:'1'},stdio:['ignore','pipe','pipe']});
 let port=0,output='',exited=false;child.once('exit',()=>{exited=true;});
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(output)),10000);
   child.stdout.on('data',chunk=>{output+=chunk;const m=/http:\/\/127\.0\.0\.1:(\d+)/.exec(output);if(m){port=Number(m[1]);clearTimeout(timer);resolve();}});
   child.stderr.on('data',chunk=>{output+=chunk;});child.once('error',reject);
   child.once('exit',code=>{clearTimeout(timer);if(!port)reject(new Error(`server exit ${code}: ${output}`));});});
  const base=`http://127.0.0.1:${port}`,health=await(await fetch(`${base}/api/health`)).json();
  const post=async(route,json)=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-Zhezhi-Token':health.token},body:JSON.stringify(json),signal:AbortSignal.timeout(65000)});return {status:r.status,value:await r.json()};};
  const checks=[];
  for(const key of ['source','leftWidth','rightWidth','assignments'])for(const value of [null,false,'0.4',{}]){
   const result=await post('/api/tessellate',{family:'discrete-curve-cp',[key]:value});assert.equal(result.status,422,`${key}:${JSON.stringify(value)}`);checks.push({name:`invalid-${key}-${JSON.stringify(value)}`,status:result.status});}
  const badSource=structuredClone(fixtures[0].params.source);badSource.leftRulings[0]=[0,-1];
  assert.equal((await post('/api/tessellate',{family:'discrete-curve-cp',source:badSource})).status,422);
  const response=await post('/api/tessellate',{family:'discrete-curve-cp'});assert.equal(response.status,200);
  const r=response.value;assert.deepEqual([r.stats.vertices,r.stats.edges,r.stats.faces],[9,12,4]);
  assert.equal(r.stats.checks.geometry.status,'passed');assert.equal(r.stats.checks.local.status,'incomplete');assert.equal(r.stats.checks.layerOrder.status,'not_checked');
  const native=await post('/api/tessellation/curved-discretization-generic',r.stats.parameters.source);assert.equal(native.status,200);assert.deepEqual(r.source.nativeDiscretization,native.value);
  assert.equal(native.value.certification.adoptableCreasePattern,false);assert.equal(r.source.staticGlobalIsometryChecked,false);
  for(const c of fixtures){const actual=await post('/api/tessellate',c.params);assert.equal(actual.status,200,c.name);assert.equal(actual.value.stats.checks.local.status,c.response.stats.checks.local.status,c.name);assert.equal(actual.value.stats.checks.lff.status,c.response.stats.checks.lff.status,c.name);}
  checks.push({name:'default-after-rejections',status:200,counts:[9,12,4],originalQueryResultUnchanged:true});
  await writeFile(path.join(out,'api-default-response.json'),JSON.stringify(r,null,2)+'\n');
  await writeFile(path.join(out,'api-checks.json'),JSON.stringify({checks,invalidRequests:17,validCPRequests:5,originalRouteChecks:1},null,2)+'\n');
 }finally{
  if(!exited){const finished=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await Promise.race([finished,new Promise(resolve=>setTimeout(resolve,5000).unref())]);if(!exited)child.kill('SIGKILL');}
  await writeFile(path.join(out,'owned-runtime-cleanup.json'),JSON.stringify({pid:child.pid,exited,ownedOnly:true},null,2)+'\n');
 }
});
