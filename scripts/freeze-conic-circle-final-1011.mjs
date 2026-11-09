import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const json=f=>JSON.parse(fs.readFileSync(f,'utf8')),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const files=d=>fs.readdirSync(d,{recursive:true}).map(f=>path.join(d,f).replaceAll('\\','/')).filter(f=>fs.statSync(f).isFile()&&!f.includes('__pycache__'));
const run=json('output/original-conic-circle-checks-1011.json');assert.equal(run.exitCode,0);assert.equal(run.inputsUnchanged,true);assert.equal(run.backendInputsUnchanged,true);
for(const r of run.inputs)assert.equal(sha(r.file),r.sha256,r.file);
const report=json('output/original-conic-circle-report-1011.json');assert.equal(report.verified,true);assert.equal(report.userButtonExportFiles,13);
const previous=json('output/audits/original-finite-npoints-final-1011.json');
for(const row of previous.snapshots)assert.equal(sha(previous.archive+'/'+row.file),row.sha256,row.file);
for(const [name,value]of Object.entries(report.preservation.lastSourceHashes))assert.equal(sha(name),value,name);
for(const r of report.docChanges)assert.equal(sha(r.file),r.after,r.file);
const paths=new Set([...files('src'),...files('backend'),...files('tests'),...files('vendor/simulator'),...files('desktop'),...files('scripts'),...files('dist'),...files('docs'),
 ...files('output/playwright/original-conic-circle-main-1011'),...files('output/original-conic-circle-main-server-1011/projects'),
 ...report.preservation.integrationReports,...report.docChanges.map(r=>r.file),...files('output/original-conic-circle-docs-before-1011'),
 ...fs.readdirSync('output').filter(f=>/^original-conic-circle-.*\.(json|log|py)$/.test(f)).map(f=>'output/'+f),
 'README.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs','tess-worker.mjs','tmp/Origamica-15.0-reference.nb','output/audits/original-finite-npoints-final-1011.json']);
function addFrozen(base,index){
 const file=base+'/'+index,frozen=json(file);paths.add(file);
 for(const row of frozen.files){const f=base+'/'+(row.file??row.path);assert.equal(sha(f),row.sha256,f);paths.add(f);}
}
const producer='output/parallel/original-conic-circle-cp-1010';
addFrozen(producer,'freeze.json');addFrozen(producer,'rebased-delivery-002/freeze.json');
paths.add(producer+'/root-integration-manifest-1011.json');
const prepared='output/parallel/original-conic-circle-main-acceptance-prepared-1011';addFrozen(prepared,'freeze.json');
for(const f of fs.readdirSync(prepared).filter(f=>f.startsWith('owned-main-start-')&&f.endsWith('.json')))paths.add(prepared+'/'+f);
addFrozen('output/parallel/original-conic-circle-independent-main-review-1011','freeze.json');
const fixed='output/parallel/original-conic-circle-dxf-audit-fix-1011';addFrozen(fixed,'freeze.json');
const archive='output/audits/original-conic-circle-artifacts-1011',manifest='output/audits/original-conic-circle-final-1011.json';
assert.ok(!fs.existsSync(archive)&&!fs.existsSync(manifest));fs.mkdirSync(archive,{recursive:true});const snapshots=[];
for(const file of [...paths].sort()){
 assert.ok(fs.existsSync(file),file);const saved=path.join(archive,file);fs.mkdirSync(path.dirname(saved),{recursive:true});
 fs.copyFileSync(file,saved,fs.constants.COPYFILE_EXCL);assert.equal(sha(saved),sha(file));snapshots.push({file,sha256:sha(file),bytes:fs.statSync(file).size});
}
fs.writeFileSync(manifest,JSON.stringify({verified:true,verifiedAt:new Date().toISOString(),archive,snapshots,tests:{...run.tests,mainAppFocused:report.mainAppChecks},bundle:report.bundle,
 userButtonExportFiles:13,independentDownloadChecks:report.independentDownloadChecks,previousArchiveFilesVerified:23899,preservation:report.preservation,
 finalBuildAndMainAppSameBundle:true,failedBusyResponseAndR12AuditAssumptionRetained:true,freezeUsesOnlyListedIsolatedFiles:true,
 completeOrigamicaGoal:false,packed:false,published:false,machineVerified:false,
 notVerified:['complete original symbolic/default/numerical/curve domains','Wolfram execution or saved Out','continuous paths/3D/collision/thickness','portable package/third-party cutter/machine']},null,2),{flag:'wx'});
console.log(JSON.stringify({frozen:snapshots.length,mainAppChecks:report.mainAppChecks,userDownloads:13,completeOrigamicaGoal:false}));
