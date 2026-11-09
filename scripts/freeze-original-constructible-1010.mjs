import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files=directory=>fs.readdirSync(directory,{recursive:true}).map(file=>path.join(directory,file).replaceAll('\\','/')).filter(file=>fs.statSync(file).isFile()&&!file.includes('__pycache__'));
const run=json('output/original-topology-factors-checks-constructible-final-1010.json');assert.equal(run.exitCode,0);assert.equal(run.inputsUnchanged,true);
for(const row of run.inputs)assert.equal(hash(row.file),row.sha256,row.file);
const report=json('output/original-constructible-report-1010.json');assert.equal(report.verified,true);assert.ok(report.mainAppChecks>45&&report.userButtonExportFiles>28);
const previous=json('output/audits/original-topology-factors-final-1010.json');for(const row of previous.snapshots)assert.equal(hash(previous.archive+'/'+row.file),row.sha256,row.file);
const latest=report.preservation.lastSourceHashes;for(const [file,sha] of Object.entries(latest))assert.equal(hash(file),sha,file);
for(const row of report.docChanges)assert.equal(hash(row.file),row.after,row.file);
const paths=new Set([
 ...files('src'),...files('backend'),...files('tests'),...files('vendor/simulator'),...files('desktop'),...files('scripts'),...files('dist'),...files('docs'),
 ...files('output/playwright/original-constructible-final-1010'),...files('output/playwright/original-min-budget-final-1010'),
 ...files('output/original-constructible-server-1010/projects'),...files('output/original-min-budget-server-1010/projects'),
 ...files('output/parallel/original-min-total-pleat-1010/root-acceptance/evidence'),
 ...files('output/parallel/original-min-budget-independent-review-1010'),
 ...files('output/parallel/original-discrete-curve-cp-1010/delivery'),...files('output/parallel/original-discrete-curve-cp-1010/rebased-delivery'),
 ...files('output/parallel/original-across-2d-cp-1010/delivery'),
 ...files('output/parallel/original-multiple-gore-cp-1010/delivery-v2'),
 ...report.preservation.integrationReports,...report.docChanges.map(r=>r.file),
 ...fs.readdirSync('output').filter(file=>/^(original-constructible-|original-min-budget-|original-topology-factors-checks-min-budget-).*\.(json|log)$/.test(file)).map(file=>'output/'+file),
 'README.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs','tess-worker.mjs',
 'output/audits/original-topology-factors-final-1010.json',
]);
for(const file of [
 'output/parallel/original-min-total-pleat-1010/root-integration-manifest.json',
 'output/parallel/original-min-total-pleat-1010/delivery/min-total-pleat.patch',
 'output/parallel/original-flasher-rotation-budget-1010/root-integration-manifest.json',
 'output/parallel/original-flasher-rotation-budget-1010/rotation-manifest.json',
 'output/parallel/original-flasher-rotation-budget-1010/rotation-freeze.json',
 'output/parallel/original-flasher-rotation-budget-1010/original-flasher-rotation-budget.patch',
 'output/parallel/original-flasher-rotation-patch-check-failure-1010.json',
 'output/parallel/original-multiple-gore-cp-1010/root-integration-manifest.json',
 'output/parallel/original-multiple-gore-cp-1010/manifest.json',
 'output/parallel/original-multiple-gore-cp-1010/freeze.json',
 'output/parallel/original-multiple-gore-cp-1010/original-multiple-gore-cp-v2.patch',
 'output/parallel/original-multiple-gore-cp-1010/source-contract.json',
 'output/parallel/original-multiple-gore-cp-1010/patch-application-contract.json',
 'output/parallel/original-across-2d-cp-1010/root-integration-manifest.json',
 'output/parallel/original-across-2d-cp-1010/across-2d-cp.patch',
 'output/parallel/original-discrete-curve-cp-1010/root-integration-manifest.json',
 'output/parallel/original-discrete-curve-cp-1010/root-combined.patch',
 'output/parallel/original-discrete-curve-cp-1010/DISCRETE-CURVE-CP-DELIVERY-FROZEN.json',
 'output/parallel/original-discrete-curve-cp-1010/DISCRETE-CURVE-CP-REBASED-FROZEN.json',
])paths.add(file);
for(const directory of process.argv.slice(2)){
 assert.ok(directory.startsWith('output/parallel/')&&!directory.includes('..'));
 assert.ok(fs.existsSync(directory),directory);for(const file of files(directory))paths.add(file);
}
const archive='output/audits/original-constructible-artifacts-1010',manifest='output/audits/original-constructible-final-1010.json';
assert.ok(!fs.existsSync(archive)&&!fs.existsSync(manifest));fs.mkdirSync(archive,{recursive:true});const snapshots=[];
for(const file of [...paths].sort()){
 assert.ok(fs.existsSync(file),file);const saved=path.join(archive,file);fs.mkdirSync(path.dirname(saved),{recursive:true});fs.copyFileSync(file,saved,fs.constants.COPYFILE_EXCL);assert.equal(hash(saved),hash(file));
 snapshots.push({file,sha256:hash(file),bytes:fs.statSync(file).size});
}
fs.writeFileSync(manifest,JSON.stringify({verified:true,verifiedAt:new Date().toISOString(),completeOrigamicaGoal:false,archive,snapshots,
 tests:{...run.tests,mainAppFocused:report.mainAppChecks},bundle:report.bundle,userButtonExportFiles:report.userButtonExportFiles,
 integrationRecords:report.preservation.integrationReports,preservation:report.preservation,previousArchiveFilesVerified:3257,
 finalBuildAndMainAppSameBundle:true,initialFailedAndPreliminaryRunsRetained:true,
 scope:['finite original MinTotalPleat and LP optimum/common fit certificate','Flasher rotation order actual-face-budget expansion',
 'independent original multiple Gore material CP','finite discrete curve CP with explicit assignments and genuine layer gate',
 'bounded intrinsic AcrossRight2D circle CP and explicit auxiliary processing choices','current source/CP/FF/mm-document adoption consistency'],
 notVerified:['complete Wolfram symbolic/default/controller/interpolation semantics and all numerical/curve/layer domains',
 'global continuous paths/collision/physical validity or gluing all Gore materials',
 'portable EXE/third-party cutter import/machine; not packaged or published'],packed:false,published:false,machineVerified:false,
},null,2),{flag:'wx'});
console.log(JSON.stringify({frozen:snapshots.length,tests:run.tests,mainAppChecks:report.mainAppChecks,userButtonExportFiles:report.userButtonExportFiles,completeOrigamicaGoal:false}));
