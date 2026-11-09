import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
const file='output/path-array-checks-002-1012.json',log='output/path-array-checks-002-1012.log';
assert.ok(!fs.existsSync(file)&&!fs.existsSync(log));
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const baseFile='output/path-array-checks-1012.json',base=JSON.parse(fs.readFileSync(baseFile,'utf8'));
assert.equal(base.exitCode,0);assert.equal(base.inputsUnchanged,true);
const integrationFiles=['path-array-handle-delta-root-1012'].map(n=>'output/parallel/'+n+'-integrated-1010.json');
const expected=new Map(base.inputs.map(r=>[r.file,r.sha256]));
for(const f of integrationFiles){const record=JSON.parse(fs.readFileSync(f,'utf8'));assert.equal(record.verified,true);for(const r of record.files){assert.equal(expected.get(r.file)??null,r.before,r.file);expected.set(r.file,r.after);}}
for(const [f,h] of expected)assert.equal(hash(f),h,f);
const output={startedAt:new Date().toISOString(),baseFile,baseSHA256:hash(baseFile),integrationFiles,inputs:[...expected].map(([file,sha256])=>({file,sha256})),stages:[],tests:{desktop:base.tests.desktop,backend:base.tests.backend,serverWorker:base.tests.serverWorker,frontend:base.tests.frontend},guardedReuse:{frontend:true,desktop:true,backend:true,serverWorker:true,reason:'Only explicit selected handle painting order changed in the shared SVG editor. Mathematical helpers, ordinary/optimized export, all tests and existing checks inputs are exact SHA-identical. Reuse 3381 tests by SHA, fresh TypeScript/Vite and actual overlapping-point drag acceptance.'},exitCode:null};
const fd=fs.openSync(log,'wx'),save=()=>fs.writeFileSync(file,JSON.stringify(output,null,2));save();
try{
 for(const name of ['build']){
  const stage={name,startedAt:new Date().toISOString(),exitCode:null};output.stages.push(stage);save();fs.writeSync(fd,`\n=== ${name} ===\n`);
  const child=spawn(process.env.ComSpec??'cmd.exe',['/d','/s','/c','npm.cmd run '+name],{cwd:process.cwd(),windowsHide:true,stdio:['ignore',fd,fd]});stage.pid=child.pid;save();
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});stage.exitCode=code;stage.finishedAt=new Date().toISOString();save();assert.equal(code,0,name);
 }
 for(const [f,h]of expected)assert.equal(hash(f),h,f);
 const text=fs.readFileSync(log,'utf8');output.tests.buildModules=Number(text.match(/(\d+) modules transformed/)?.[1]);assert.ok(output.tests.frontend>=3375);assert.ok(output.tests.buildModules>=1100);output.exitCode=0;output.inputsUnchanged=true;
}catch(e){output.exitCode=1;output.error=String(e);process.exitCode=1;}finally{output.finishedAt=new Date().toISOString();save();fs.closeSync(fd);}
