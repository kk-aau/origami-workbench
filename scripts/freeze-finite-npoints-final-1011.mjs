import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const json=f=>JSON.parse(fs.readFileSync(f,'utf8')),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const files=d=>fs.readdirSync(d,{recursive:true}).map(f=>path.join(d,f).replaceAll('\\','/')).filter(f=>fs.statSync(f).isFile()&&!f.includes('__pycache__'));
const run=json('output/original-topology-factors-checks-finite-npoints-1011.json');assert.equal(run.exitCode,0);assert.equal(run.inputsUnchanged,true);for(const r of run.inputs)assert.equal(sha(r.file),r.sha256,r.file);
const report=json('output/original-finite-npoints-report-1011.json');assert.equal(report.verified,true);assert.equal(report.userButtonExportFiles,21);
const previous=json('output/audits/original-constructible-final-1011.json');for(const row of previous.snapshots)assert.equal(sha(previous.archive+'/'+row.file),row.sha256,row.file);
for(const [name,value]of Object.entries(report.preservation.lastSourceHashes))assert.equal(sha(name),value,name);for(const r of report.docChanges)assert.equal(sha(r.file),r.after,r.file);
const paths=new Set([...files('src'),...files('backend'),...files('tests'),...files('vendor/simulator'),...files('desktop'),...files('scripts'),...files('dist'),...files('docs'),
 ...files('output/playwright/original-finite-npoints-final-1011'),...files('output/playwright/original-finite-npoints-failed-category-1011'),...files('output/playwright/original-finite-npoints-failed-library-list-1011'),
 ...files('output/original-finite-n-conic-server-1011/projects'),...files('output/parallel/original-discrete-curve-npoints-independent-review-1010'),
 ...files('output/parallel/original-discrete-npoints-main-acceptance-prepared-1011'),
 ...report.preservation.integrationReports,...report.docChanges.map(r=>r.file),
 ...fs.readdirSync('output').filter(f=>/^original-finite-npoints-.*\.(json|log)$/.test(f)).map(f=>'output/'+f),
 'output/original-topology-factors-checks-finite-npoints-1011.json','output/original-topology-factors-checks-finite-npoints-1011.log',
 'README.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs','tess-worker.mjs','output/audits/original-constructible-final-1011.json']);
const producer='output/parallel/original-discrete-curve-npoints-1010',frozenFile=producer+'/NPOINTS-DELIVERY-FROZEN.json',frozen=json(frozenFile);paths.add(frozenFile);
for(const row of frozen.files){const f=producer+'/'+row.path;assert.equal(sha(f),row.sha256,f);paths.add(f);}
paths.add(producer+'/root-integration-manifest-1011.json');
const archive='output/audits/original-finite-npoints-artifacts-1011',manifest='output/audits/original-finite-npoints-final-1011.json';assert.ok(!fs.existsSync(archive)&&!fs.existsSync(manifest));fs.mkdirSync(archive,{recursive:true});const snapshots=[];
for(const file of [...paths].sort()){assert.ok(fs.existsSync(file),file);const saved=path.join(archive,file);fs.mkdirSync(path.dirname(saved),{recursive:true});fs.copyFileSync(file,saved,fs.constants.COPYFILE_EXCL);assert.equal(sha(saved),sha(file));snapshots.push({file,sha256:sha(file),bytes:fs.statSync(file).size});}
fs.writeFileSync(manifest,JSON.stringify({verified:true,verifiedAt:new Date().toISOString(),archive,snapshots,tests:{...run.tests,mainAppFocused:report.mainAppChecks},bundle:report.bundle,userButtonExportFiles:21,
 independentDownloadChecks:report.independentDownloadChecks,coreReopenChecks:report.coreReopenChecks,previousArchiveFilesVerified:3825,preservation:report.preservation,
 finalBuildAndMainAppSameBundle:true,firstAndSecondFailedUIRunsRetained:true,completeOrigamicaGoal:false,packed:false,published:false,machineVerified:false,
 notVerified:['complete original symbolic/default/numerical/curve domains','Wolfram execution or saved numerical Out','continuous paths/3D/collision/thickness','portable package/third-party cutter/machine'],
},null,2),{flag:'wx'});console.log(JSON.stringify({frozen:snapshots.length,tests:run.tests,mainAppChecks:report.mainAppChecks,userDownloads:21,completeOrigamicaGoal:false}));
