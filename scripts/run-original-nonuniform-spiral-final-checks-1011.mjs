import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const baseFile='output/original-nonuniform-spiral-checks-1011.json',base=json(baseFile);
assert.equal(base.exitCode,0);assert.equal(base.inputsUnchanged,true);assert.equal(base.stages.length,8);assert.ok(base.stages.every(s=>s.exitCode===0));
const names=['original-nonuniform-spiral-cp-3968','original-nonuniform-spiral-root-wiring','original-nonuniform-spiral-preview-performance','original-nonuniform-spiral-readable-rulers'];
const latest=new Map(),deltas=new Map();
for(const [i,name]of names.entries()){
 const r=json('output/parallel/'+name+'-integrated-1010.json');assert.equal(r.verified,true);
 for(const row of r.files){
  if(latest.has(row.file))assert.equal(row.before,latest.get(row.file),row.file);
  latest.set(row.file,row.after);if(i<2)assert.equal(base.inputs.find(x=>x.file===row.file)?.sha256,row.after,row.file);else deltas.set(row.file,row.after);
 }
}
assert.equal(latest.size,7);assert.equal(deltas.size,3);
for(const [file,hash]of latest)assert.equal(sha(file),hash,file);
for(const row of base.inputs)assert.equal(sha(row.file),deltas.get(row.file)??row.sha256,row.file);
const files=directory=>fs.readdirSync(directory,{recursive:true}).map(file=>path.join(directory,file).replaceAll('\\','/')).filter(file=>fs.statSync(file).isFile()&&!file.includes('__pycache__'));
const inputs=[...new Set([...files('src'),...files('backend'),...files('tests'),...files('vendor/simulator'),...files('desktop'),...files('scripts'),
 'package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs','tess-worker.mjs'])].sort().map(file=>({file,sha256:sha(file)}));
const report='output/original-nonuniform-spiral-final-checks-1011.json',logFile='output/original-nonuniform-spiral-final-checks-1011.log';
assert.ok(!fs.existsSync(report)&&!fs.existsSync(logFile));
const record={pid:process.pid,startedAt:new Date().toISOString(),baseFile,baseSha256:sha(baseFile),baseEightStagesPassed:true,
 baseTests:base.tests,inputs,integrationReports:names.map(name=>'output/parallel/'+name+'-integrated-1010.json'),
 postEightChangedFiles:[...deltas].map(([file,sha256])=>({file,sha256})),stages:[],exitCode:null,
 reason:'Rerun the entire frontend suite and type/build for the private source-owned preview performance path and readable SVG labels; all other previously passing stage inputs stay byte-identical.'};
const save=()=>fs.writeFileSync(report,JSON.stringify(record,null,2));save();const descriptor=fs.openSync(logFile,'wx');
try{
 for(const name of ['test:unit','build']){
  const stage={name,exitCode:null,startedAt:new Date().toISOString()};record.stages.push(stage);save();fs.writeSync(descriptor,`\n=== Final change check ${name} ===\n`);
  const child=spawn(process.env.ComSpec??'cmd.exe',['/d','/s','/c',`npm.cmd run ${name}`],{cwd:process.cwd(),windowsHide:true,stdio:['ignore',descriptor,descriptor]});stage.pid=child.pid;save();
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve(code??(signal?1:0)));});assert.equal(code,0,name);
  stage.exitCode=0;stage.finishedAt=new Date().toISOString();save();
 }
 for(const row of inputs)assert.equal(sha(row.file),row.sha256,row.file);
 const text=fs.readFileSync(logFile,'utf8'),passed=[...text.matchAll(/ℹ pass (\d+)/g)].map(m=>Number(m[1]));assert.equal(passed.length,1);
 record.tests={...base.tests,frontend:passed[0],buildModules:Number(text.match(/(\d+) modules transformed/)?.[1])};assert.ok(record.tests.frontend>=2937&&record.tests.buildModules>=1045);
 record.exitCode=0;record.inputsUnchanged=true;record.unchangedOtherEightStageInputs=true;
}catch(error){record.exitCode=1;record.error=String(error);process.exitCode=1;}
finally{record.finishedAt=new Date().toISOString();save();fs.closeSync(descriptor);}
