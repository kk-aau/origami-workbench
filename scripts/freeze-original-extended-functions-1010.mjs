import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const read=file=>fs.readFileSync(file,'utf8');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const all=dir=>fs.readdirSync(dir,{recursive:true}).map(file=>path.join(dir,file).replaceAll('\\','/')).filter(file=>fs.statSync(file).isFile()&&!file.includes('__pycache__'));
const run=JSON.parse(read('output/original-extended-full-run-1010.json'));
assert.equal(run.exitCode,0);
for(const row of run.inputs)assert.equal(hash(row.file),row.sha256,`Changed during full checks: ${row.file}`);
const full=read('output/original-extended-full-test-1010.log');
assert.ok(!/^✖|^FAILED|^ERROR:|^FAIL:/m.test(full));
const passes=[...full.matchAll(/ℹ pass (\d+)/g)].map(match=>Number(match[1]));
assert.equal(passes.length,3);assert.equal(passes[1],7);assert.equal(passes[2],63);
const python=Number(full.match(/Ran (\d+) tests/)?.[1]);assert.ok(python>=1160);
const modules=Number(read('output/original-extended-build-1010.log').match(/(\d+) modules transformed/)?.[1]);assert.ok(modules>=997);
const browserPaths=[
 'output/original-higher-browser-1010/browser-tests.log',
 'output/original-graphics-browser-1010/browser-tests.log',
 'output/original-ring-browser-1010/browser-tests-fixed.log',
 'output/original-frenet-browser-1010/browser-tests.log',
 'output/original-frenet-browser-1010/forged-browser-tests.log',
 'output/original-independent-browser-1010/browser-tests-fixed2.log',
 'output/original-curve2-styled-browser-1010/browser-tests.log',
 'output/original-curve2-styled-browser-1010/forged-browser-tests.log',
 'output/original-ndsolve-browser-1010/browser-tests.log'
];
if(fs.existsSync('output/original-ring-angle-browser-1010/browser-tests.log'))browserPaths.push('output/original-ring-angle-browser-1010/browser-tests.log');
const browsers=browserPaths.map(file=>{const match=read(file).match(/^### Result\r?\n(\{[^\r\n]+\})/m);assert.ok(match,file);const data=JSON.parse(match[1]);assert.ok(data.passed>0);assert.deepEqual(data.errors,[]);return{file,passed:data.passed};});
const reportPaths=[
 'output/original-higher-browser-1010/download-readback-report.json',
 'output/original-higher-browser-1010/inherited-server-report.json',
 'output/original-graphics-browser-1010/download-audit.json',
 'output/original-ring-browser-1010/download-audit.json',
 'output/original-frenet-browser-1010/download-audit.json',
 'output/original-independent-browser-1010/download-audit.json',
 'output/original-curve2-styled-browser-1010/download-audit.json',
 'output/original-ndsolve-browser-1010/download-audit.json',
 'output/original-ndsolve-browser-1010/inherited-server-report.json',
 'output/original-ring-angle-browser-1010/download-audit.json'
];
for(const file of reportPaths)assert.ok(JSON.parse(read(file)));
const wovenManifest='output/parallel/woven-main-acceptance-1010/acceptance-manifest.json';
const woven=JSON.parse(read(wovenManifest));
assert.equal(woven.verified,true);assert.equal(woven.uiChecks,43);assert.equal(woven.actualDownloads,6);
assert.equal(woven.downloadChecks,30);assert.equal(woven.httpRegressionCases,8);assert.equal(woven.httpRejectionCases,5);
for(const row of woven.files)assert.equal(hash(row.file),row.sha256,`Changed woven acceptance evidence: ${row.file}`);
const wovenDownloads=JSON.parse(read(woven.primaryEvidence+'/download-audit.json'));
assert.equal(wovenDownloads.verified,true);assert.equal(wovenDownloads.sourceUnchangedDuringTests,true);
assert.equal(wovenDownloads.bundle,woven.bundle);assert.ok(fs.existsSync('dist'+woven.bundle));
const latestWovenSnapshot=JSON.parse(read(woven.primaryEvidence+'/production-snapshot-final-before.json'));
assert.equal(latestWovenSnapshot.bundle,woven.bundle);
for(const row of latestWovenSnapshot.files)assert.equal(hash(row.file),row.sha256,`Changed woven tested production file: ${row.file}`);
const sourceAuditManifest='output/parallel/source-input-contract-audit-1010/audit-manifest.json';
const sourceAudit=JSON.parse(read(sourceAuditManifest));
assert.equal(sourceAudit.verified,true);assert.equal(sourceAudit.uiChecks,31);assert.equal(sourceAudit.actualOrdinaryJsonFiles,6);
for(const row of sourceAudit.files)assert.equal(hash(row.file),row.sha256,`Changed source audit evidence: ${row.file}`);
const preservation=JSON.parse(read('output/original-extended-functions-preservation-1010.json'));
assert.equal(preservation.verified,true);assert.equal(preservation.previousArchiveFilesVerified,1897);assert.equal(preservation.ordinaryAndOptimizedDXFPreserved,true);
const paths=new Set([...all('src'),...all('backend'),...all('tests'),...all('vendor/simulator'),...all('dist'),...all('docs'),
 ...fs.readdirSync('scripts').filter(file=>/original.*1010|curve2.*1010|ndsolve.*1010|ring.*1010/.test(file)).map(file=>'scripts/'+file),
 ...fs.readdirSync('output').filter(file=>/original-.*1010\.(json|log)$/.test(file)).map(file=>'output/'+file),
 ...preservation.integrationReports,...woven.files.map(row=>row.file),wovenManifest,...sourceAudit.files.map(row=>row.file),sourceAuditManifest,
 'README.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs',
 'output/audits/original-function-batch-final-1010.json']);
for(const dir of ['output/original-higher-browser-1010','output/original-graphics-browser-1010','output/original-ring-browser-1010','output/original-frenet-browser-1010','output/original-independent-browser-1010','output/original-curve2-styled-browser-1010','output/original-ndsolve-browser-1010','output/original-ring-angle-browser-1010'])if(fs.existsSync(dir))for(const file of all(dir))paths.add(file);
const archive='output/audits/original-extended-function-batch-artifacts-1010',manifest='output/audits/original-extended-function-batch-final-1010.json';
assert.ok(!fs.existsSync(archive)&&!fs.existsSync(manifest));fs.mkdirSync(archive,{recursive:true});
const snapshots=[];
for(const file of [...paths].sort()){
  assert.ok(fs.existsSync(file),file);const target=path.join(archive,file);fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(file,target,fs.constants.COPYFILE_EXCL);assert.equal(hash(target),hash(file));snapshots.push({file,sha256:hash(file),bytes:fs.statSync(file).size});
}
const result={verified:true,completeOrigamicaGoal:false,verifiedAt:new Date().toISOString(),archive,snapshots,tests:{frontend:passes[0],backend:python,desktop:passes[1],serverWorker:passes[2],buildModules:modules,mainAppFocused:browsers.reduce((n,b)=>n+b.passed,0)+woven.uiChecks+sourceAudit.uiChecks},browsers,wovenAcceptance:{manifest:wovenManifest,uiChecks:43,actualDownloads:6,downloadChecks:30,httpRegressionCases:8,httpRejectionCases:5,bundle:woven.bundle},sourceInputAudit:{manifest:sourceAuditManifest,sourceEntries:3,uiChecks:31,actualOrdinaryJsonFiles:6},downloadReports:reportPaths,preservation,notVerified:['full Wolfram expression/interpolation/solver/defaults semantics','whole CP, layer and continuous physical parameter domains','portable/native EXE and third-party import/machine; not packaged or published']};
fs.writeFileSync(manifest,JSON.stringify(result,null,2),{flag:'wx'});
console.log(JSON.stringify({frozen:snapshots.length,tests:result.tests,completeOrigamicaGoal:false}));
