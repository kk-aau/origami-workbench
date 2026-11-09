import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const recordFile='output/original-live-construct-continuation-1010.json',logFile='output/original-live-construct-continuation-1010.log';
assert.ok(!fs.existsSync(recordFile)&&!fs.existsSync(logFile));
const run=JSON.parse(fs.readFileSync('output/original-live-construct-full-run-1010.json','utf8'));
assert.equal(run.exitCode,null);
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const row of run.inputs)assert.equal(hash(row.file),row.sha256,row.file);
const initial=fs.readFileSync('output/original-live-construct-full-test-1010.log','utf8');
assert.deepEqual([...initial.matchAll(/ℹ pass (\d+)/g)].map(m=>Number(m[1])),[2785,7]);
assert.ok(!/^✖|^FAILED|^ERROR:|^FAIL:/m.test(initial));
const record={pid:process.pid,startedAt:new Date().toISOString(),initialLogRetained:true,initialFrontend:2785,initialDesktop:7,
 inputs:run.inputs.length,exitCode:null,stages:[]};
const save=()=>fs.writeFileSync(recordFile,JSON.stringify(record,null,2));save();
const descriptor=fs.openSync(logFile,'wx');
try{
 for(const name of ['test:tessellation','test:goldberg-saved-layer','test:p39-layer','test:p37-two-uniform','test:server']){
  const stage={name,startedAt:new Date().toISOString(),pid:null,exitCode:null};record.stages.push(stage);save();
  fs.writeSync(descriptor,`\n=== Remaining check ${name} ===\n`);
  const child=spawn(process.env.ComSpec??'cmd.exe',['/d','/s','/c',`npm.cmd run ${name}`],{cwd:process.cwd(),windowsHide:true,stdio:['ignore',descriptor,descriptor]});
  stage.pid=child.pid??null;save();
  const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve(code??(signal?1:0)));});
  stage.exitCode=exitCode;stage.finishedAt=new Date().toISOString();save();
  if(exitCode!==0){record.exitCode=exitCode;throw Error(`${name} failed with ${exitCode}`);}
 }
 for(const row of run.inputs)assert.equal(hash(row.file),row.sha256,row.file);
 record.exitCode=0;record.inputsUnchanged=true;record.finishedAt=new Date().toISOString();save();
}catch(error){record.exitCode=record.exitCode??1;record.error=String(error);record.finishedAt=new Date().toISOString();save();process.exitCode=1;}
finally{fs.closeSync(descriptor);}
