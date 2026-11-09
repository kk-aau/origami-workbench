import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

const [attempt] = process.argv.slice(2);
assert.match(attempt, /^\d{3}$/);
const root=process.cwd(),tag=attempt+'-1012',folder=path.join(root,'output/parallel/strained-designs-check-snapshot-'+tag),work=path.join(folder,'work');
const report=path.join(root,'output/strained-designs-build-'+tag+'.json'),log=path.join(root,'output/strained-designs-build-'+tag+'.log');
assert.ok(!fs.existsSync(report)&&!fs.existsSync(log));
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const inputs=JSON.parse(fs.readFileSync(path.join(folder,'inputs.json'),'utf8')).files.map(({file,sha256})=>({file,sha256}));
for(const r of inputs)assert.equal(hash(path.join(work,r.file)),r.sha256,r.file);
const result={verified:false,startedAt:new Date().toISOString(),inputs,isolatedWorkingCopy:work,scope:'Fixed-input TypeScript/Vite build for concurrent real UI acceptance; complete test suite reported separately.',fullTestSuiteVerifiedByThisRecord:false,exitCode:null};
const fd=fs.openSync(log,'wx');
try {
 const child=spawn(process.env.ComSpec??'cmd.exe',['/d','/s','/c','npm.cmd run build'],{cwd:work,windowsHide:true,stdio:['ignore',fd,fd]});
 result.pid=child.pid;
 result.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
 assert.equal(result.exitCode,0);
 for(const r of inputs)assert.equal(hash(path.join(work,r.file)),r.sha256,r.file);
 result.inputsUnchanged=true;result.verified=true;
 result.buildModules=Number(fs.readFileSync(log,'utf8').match(/(\d+) modules transformed/)?.[1]);
} catch(error) {result.error=String(error.stack??error);result.exitCode??=1;process.exitCode=1;}
finally {fs.closeSync(fd);result.finishedAt=new Date().toISOString();fs.writeFileSync(report,JSON.stringify(result,null,2));}
console.log(JSON.stringify({verified:result.verified,exitCode:result.exitCode,buildModules:result.buildModules}));
