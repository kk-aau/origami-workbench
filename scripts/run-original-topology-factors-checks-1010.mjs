import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

const runTag=process.argv[2]??'1010';
assert.match(runTag,/^[a-z0-9-]+$/);
const recordFile=`output/original-topology-factors-checks-${runTag}.json`;
const logFile=`output/original-topology-factors-checks-${runTag}.log`;
assert.ok(!fs.existsSync(recordFile) && !fs.existsSync(logFile));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files=directory=>fs.readdirSync(directory,{recursive:true})
  .map(file=>path.join(directory,file).replaceAll('\\','/'))
  .filter(file=>fs.statSync(file).isFile()&&!file.includes('__pycache__'));
const inputs=[...new Set([
  ...files('src'), ...files('backend'), ...files('tests'), ...files('vendor/simulator'),
  ...files('desktop'), ...files('scripts'),
  'package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs','tess-worker.mjs',
])].sort().map(file=>({file,sha256:hash(file)}));
const record={pid:process.pid,startedAt:new Date().toISOString(),inputs,exitCode:null,stages:[]};
const save=()=>fs.writeFileSync(recordFile,JSON.stringify(record,null,2));
save();
const descriptor=fs.openSync(logFile,'wx');
try {
  for(const name of ['test:unit','test:desktop','test:tessellation','test:goldberg-saved-layer',
    'test:p39-layer','test:p37-two-uniform','test:server','build']) {
    const stage={name,startedAt:new Date().toISOString(),pid:null,exitCode:null};
    record.stages.push(stage); save();
    fs.writeSync(descriptor,`\n=== Project check ${name} ===\n`);
    const child=spawn(process.env.ComSpec??'cmd.exe',['/d','/s','/c',`npm.cmd run ${name}`],{
      cwd:process.cwd(),windowsHide:true,stdio:['ignore',descriptor,descriptor],
    });
    stage.pid=child.pid??null; save();
    stage.exitCode=await new Promise((resolve,reject)=>{
      child.once('error',reject);
      child.once('exit',(code,signal)=>resolve(code??(signal?1:0)));
    });
    stage.finishedAt=new Date().toISOString(); save();
    assert.equal(stage.exitCode,0,`${name} failed`);
  }
  for(const row of inputs)assert.equal(hash(row.file),row.sha256,row.file);
  const log=fs.readFileSync(logFile,'utf8');
  const passes=[...log.matchAll(/ℹ pass (\d+)/g)].map(match=>Number(match[1]));
  assert.equal(passes.length,3);
  const backend=Number(log.match(/Ran (\d+) tests/)?.[1]);
  assert.ok(backend>1273);
  record.tests={frontend:passes[0],desktop:passes[1],backend,serverWorker:passes[2],
    buildModules:Number(log.match(/(\d+) modules transformed/)?.[1])};
  assert.ok(record.tests.buildModules>=1022);
  record.exitCode=0; record.inputsUnchanged=true;
} catch(error) {
  record.exitCode=1; record.error=String(error); process.exitCode=1;
} finally {
  record.finishedAt=new Date().toISOString(); save(); fs.closeSync(descriptor);
}
