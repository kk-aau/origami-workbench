import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files=directory=>fs.readdirSync(directory,{recursive:true})
  .map(file=>path.join(directory,file).replaceAll('\\','/'))
  .filter(file=>fs.statSync(file).isFile()&&!file.includes('__pycache__'));
const run=json('output/original-topology-factors-checks-retry-1010.json');
assert.equal(run.exitCode,0);assert.equal(run.inputsUnchanged,true);
for(const row of run.inputs)assert.equal(hash(row.file),row.sha256,row.file);
const report=json('output/original-topology-factors-report-1010.json');
assert.equal(report.verified,true);assert.equal(report.mainAppChecks,89);assert.equal(report.userButtonExportFiles,46);
const previous=json('output/audits/original-live-construct-final-1010.json');
for(const row of previous.snapshots)assert.equal(hash(previous.archive+'/'+row.file),row.sha256,row.file);
const integrationRecords=['original-flasher-factors','original-dual-faces','original-courteous-graph',
  'flasher-input-contract','flagstone-dual-faces','dual-faces-area-guard','test-entry','shared-tolerance-guard']
  .map(name=>'output/parallel/'+name+'-integrated-1010.json');
const latest=new Map();
for(const file of integrationRecords){
  const record=json(file);assert.equal(record.verified,true);
  for(const row of record.files){if(latest.has(row.file))assert.equal(latest.get(row.file),row.before,row.file);latest.set(row.file,row.after);}
}
for(const [file,sha] of latest)assert.equal(hash(file),sha,file);
for(const row of report.docChanges)assert.equal(hash(row.file),row.after,row.file);
const paths=new Set([
  ...files('src'),...files('backend'),...files('tests'),...files('vendor/simulator'),
  ...files('desktop'),...files('scripts'),...files('dist'),...files('docs'),
  ...files('output/playwright/original-topology-factors-main-1010'),
  ...files('output/playwright/original-topology-factors-final-1010'),
  ...files('output/parallel/courteous-graph-root-review-1010/root-main-8862'),
  ...files('output/parallel/courteous-graph-root-review-1010/root-final-8862'),
  ...files('output/original-topology-factors-server-1010/projects'),
  ...files('output/flasher-input-contract-api'),
  ...files('output/parallel/flasher-input-contract-1010/evidence/root-preservation-review'),
  ...fs.readdirSync('output').filter(file=>/^original-topology-factors-.*\.(json|log)$/.test(file)).map(file=>'output/'+file),
  ...integrationRecords,...report.docChanges.map(row=>row.file),
  'README.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs','tess-worker.mjs',
  'output/audits/original-live-construct-final-1010.json',
]);
for(const file of [
  'output/parallel/original-flasher-factors-1010/FLASHER-FACTORS-FROZEN.json',
  'output/parallel/original-flasher-factors-1010/patch-manifest.json',
  'output/parallel/original-flasher-factors-1010/flasher-factors-incremental.patch',
  'output/parallel/original-flasher-factors-patch-check-failure-1010.json',
  'output/parallel/original-dual-faces-1010/DELIVERY-FROZEN.json',
  'output/parallel/original-dual-faces-1010/evidence/resume-manifest.json',
  'output/parallel/original-dual-faces-1010/implementation.patch',
  'output/parallel/original-courteous-graph-1010/delivery-manifest.json',
  'output/parallel/original-courteous-graph-1010/courteous-graph.patch',
  'output/parallel/flasher-input-contract-1010/delivery/manifest.json',
  'output/parallel/flasher-input-contract-1010/delivery/flasher-input-contract.patch',
  'output/parallel/dual-faces-root-review-1010/flagstone-manifest.json',
  'output/parallel/dual-faces-root-review-1010/flagstone-dual-faces.patch',
  'output/parallel/dual-faces-root-review-1010/area-guard-delivery/area-guard-manifest.json',
  'output/parallel/dual-faces-root-review-1010/area-guard-delivery/dual-faces-area-guard.patch',
])paths.add(file);
const archive='output/audits/original-topology-factors-artifacts-1010';
const manifest='output/audits/original-topology-factors-final-1010.json';
assert.ok(!fs.existsSync(archive)&&!fs.existsSync(manifest));fs.mkdirSync(archive,{recursive:true});
const snapshots=[];
for(const file of [...paths].sort()){
  assert.ok(fs.existsSync(file),file);
  const saved=path.join(archive,file);fs.mkdirSync(path.dirname(saved),{recursive:true});
  fs.copyFileSync(file,saved,fs.constants.COPYFILE_EXCL);assert.equal(hash(saved),hash(file));
  snapshots.push({file,sha256:hash(file),bytes:fs.statSync(file).size});
}
fs.writeFileSync(manifest,JSON.stringify({
  verified:true,verifiedAt:new Date().toISOString(),completeOrigamicaGoal:false,archive,snapshots,
  tests:{...run.tests,mainAppFocused:89},bundle:report.bundle,userButtonExportFiles:46,
  integrationRecords,preservation:report.preservation,previousArchiveFilesVerified:2489,
  initialFailedRunRetained:true,finalBuildAndMainAppSameBundle:true,
  scope:['finite original Courteous Graph and actual woven CP','additional finite Flasher factors and strict input contract',
    'original ordered DualFaces including both flagstone branches','shared rigid-quad tolerance compatibility and controlled area errors'],
  notVerified:['complete original Wolfram symbolic/default/interpolation/controller semantics and all numerical domains',
    'MinTotalPleat and Flasher rotation budget beyond 16 are next isolated deliveries, not integrated in this cut',
    'global continuous paths/collision/physical validity','portable EXE/third-party cutter import/machine; not packaged or published'],
},null,2),{flag:'wx'});
console.log(JSON.stringify({frozen:snapshots.length,tests:run.tests,mainAppChecks:89,userButtonExportFiles:46,completeOrigamicaGoal:false}));
