import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const baseFile='output/original-uniform-helix-general-checks-1011.json';
const recordFile='output/original-uniform-helix-general-checks-1011.json',logFile='output/original-uniform-helix-general-checks-1011.log';
assert.ok(!fs.existsSync(recordFile)&&!fs.existsSync(logFile));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files=directory=>fs.readdirSync(directory,{recursive:true}).map(file=>path.join(directory,file).replaceAll('\\','/')).filter(file=>fs.statSync(file).isFile()&&!file.includes('__pycache__'));
const base=JSON.parse(fs.readFileSync(baseFile,'utf8'));assert.equal(base.exitCode,0);assert.equal(base.inputsUnchanged,true);assert.ok(base.stages.every(s=>s.exitCode===0));
const integrationRecords=["original-uniform-helix-general-cp-3951", "original-uniform-helix-general-root-wiring"].map(name=>JSON.parse(fs.readFileSync('output/parallel/'+name+'-integrated-1010.json','utf8')));
assert.ok(integrationRecords.every(r=>r.verified===true));assert.equal(integrationRecords[0].files.length,5);assert.equal(integrationRecords[1].files.length,2);
const integration={files:integrationRecords.flatMap(r=>r.files)};
const baseline=new Map(base.inputs.map(row=>[row.file,row.sha256])),mapped=new Map();
for(const row of integration.files){assert.equal(baseline.get(row.file)??null,row.before,row.file);baseline.set(row.file,row.after);mapped.set(row.file,row);}
for(const row of mapped.values())assert.equal(hash(row.file),row.after,row.file);
const protectedInputs=base.inputs.filter(row=>(row.file.startsWith('backend/')||row.file.startsWith('tests/fixtures/')||['scripts/test-tessellation.mjs','server.mjs','tess-worker.mjs','package.json','package-lock.json'].includes(row.file))&&!mapped.has(row.file));
for(const row of protectedInputs)assert.equal(hash(row.file),row.sha256,row.file);
const originalBackend=base.inputs.filter(row=>row.file.startsWith('backend/')).map(row=>row.file).sort();assert.deepEqual(files('backend').sort(),originalBackend);
const packageJson=JSON.parse(fs.readFileSync('package.json','utf8')),prefix='node scripts/test-tessellation.mjs && ';
assert.ok(packageJson.scripts['test:tessellation'].startsWith(prefix));
const planarChecks=packageJson.scripts['test:tessellation'].slice(prefix.length).split(' && ').map(command=>{
 const match=command.match(/^tsx (scripts\/[a-zA-Z0-9_-]+\.ts)$/);assert.ok(match,command);return match[1];
});
const inputs=[...new Set([...files('src'),...files('backend'),...files('tests'),...files('vendor/simulator'),...files('desktop'),...files('scripts'),
 'package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs','tess-worker.mjs'])].sort().map(file=>({file,sha256:hash(file)}));
const record={pid:process.pid,startedAt:new Date().toISOString(),inputs,exitCode:null,stages:[],
 reusedBackend:{record:baseFile,recordSha256:hash(baseFile),testCount:base.tests.backend,unchangedInputs:protectedInputs,
 reason:'Only the general uniform In3951 principal source branch finite CP, private preview/dialog, one fixture/test and explicit App/panel entries changed. Existing backend algorithms and pre-existing fixtures remain byte-identical to the completed P63 eight stages; backend1337 is reused by protected SHA. All planar scripts are rerun. General source and finite material interface limits are distinct, and engineering error estimates are not interval certificates. Source56 and public-review29 were independently frozen before integration. Actual App exports and geometry require separate independent audits; gamma outside the selected source branch and removable singularity continuation remain unimplemented. No finite rigid3D/FF/device/packaged result is implied.'}};
const save=()=>fs.writeFileSync(recordFile,JSON.stringify(record,null,2));save();const descriptor=fs.openSync(logFile,'wx');
const command=async(name,args)=>{
 fs.writeSync(descriptor,`\n=== Check command ${name} ===\n`);
 const child=spawn(process.execPath,args,{cwd:process.cwd(),windowsHide:true,stdio:['ignore',descriptor,descriptor]});
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve(code??(signal?1:0)));});assert.equal(code,0,name);
};
try{
 for(const name of ['test:unit','test:desktop','test:tessellation','test:goldberg-saved-layer','test:p39-layer','test:p37-two-uniform','test:server','build']){
  const stage={name,startedAt:new Date().toISOString(),exitCode:null};record.stages.push(stage);save();
  fs.writeSync(descriptor,`\n=== Final project check ${name} ===\n`);
  if(name==='test:tessellation'){
   stage.pythonBackendPreviouslyPassedSameInputs=base.tests.backend;stage.planarScriptsRerun=planarChecks;
   for(const script of planarChecks)await command(script,['node_modules/tsx/dist/cli.mjs',script]);
  }else{
   const child=spawn(process.env.ComSpec??'cmd.exe',['/d','/s','/c',`npm.cmd run ${name}`],{cwd:process.cwd(),windowsHide:true,stdio:['ignore',descriptor,descriptor]});stage.pid=child.pid;save();
   const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve(code??(signal?1:0)));});assert.equal(code,0,name);
  }
  stage.exitCode=0;stage.finishedAt=new Date().toISOString();save();
 }
 for(const row of inputs)assert.equal(hash(row.file),row.sha256,row.file);
 for(const row of protectedInputs)assert.equal(hash(row.file),row.sha256,row.file);
 const log=fs.readFileSync(logFile,'utf8'),passes=[...log.matchAll(/ℹ pass (\d+)/g)].map(match=>Number(match[1]));assert.equal(passes.length,3);
 record.tests={frontend:passes[0],desktop:passes[1],backend:base.tests.backend,serverWorker:passes[2],buildModules:Number(log.match(/(\d+) modules transformed/)?.[1])};
 assert.ok(record.tests.frontend>=base.tests.frontend&&record.tests.backend>=1337&&record.tests.buildModules>=1054);
 record.exitCode=0;record.inputsUnchanged=true;record.backendInputsUnchanged=true;
}catch(error){record.exitCode=1;record.error=String(error);process.exitCode=1;}
finally{record.finishedAt=new Date().toISOString();save();fs.closeSync(descriptor);}

