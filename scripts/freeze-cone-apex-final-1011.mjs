import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const json=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const root=process.cwd();
function files(directory){const result=[];function visit(current){for(const entry of fs.readdirSync(current,{withFileTypes:true})){const file=path.join(current,entry.name);if(entry.name==='__pycache__'||entry.isSymbolicLink())continue;if(entry.isDirectory())visit(file);else if(entry.isFile())result.push(file.replaceAll('\\','/'));}}visit(directory);return result;}
const report=json('output/original-cone-four-plane-apex-report-1011.json'),run=json('output/original-cone-four-plane-apex-checks-1011.json');
assert.equal(report.verified,true);assert.equal(report.finalMainAppChecks,287);assert.equal(report.finalLayoutChecks,323);assert.equal(report.userButtonExportFiles,82);
const delta=json('output/parallel/original-cone-four-plane-apex-parent-spacing-fix-integrated-1010.json').files[0];
assert.equal(run.exitCode,0);assert.equal(run.inputsUnchanged,true);assert.equal(run.backendInputsUnchanged,true);
for(const row of run.inputs)assert.equal(sha(row.file),row.file===delta.file?delta.after:row.sha256,row.file);
const previous=json('output/audits/original-cone-four-plane-final-1011.json');assert.equal(previous.snapshots.length,3462);
for(const row of previous.snapshots)assert.equal(sha(`${previous.archive}/${row.file}`),row.sha256,row.file);
for(const [file,value]of Object.entries(report.preservation.lastSourceHashes))assert.equal(sha(file),value,file);
for(const row of report.docChanges)assert.equal(sha(row.file),row.after,row.file);
const finalBundle=json('output/original-cone-four-plane-apex-final-bundle-1011.json');
for(const row of finalBundle.files)assert.equal(sha(row.file),row.sha256,row.file);
const paths=new Set([
 ...files('src'),...files('backend'),...files('tests'),...files('vendor/simulator'),...files('desktop'),...files('scripts'),...files('dist'),...files('docs'),
 ...files('output/playwright/original-cone-four-plane-apex-main-1011'),
 ...files('output/playwright/original-cone-four-plane-apex-main-final-1011'),
 ...files('output/original-cone-four-plane-apex-main-server-1011/projects'),
 ...files('output/original-cone-four-plane-apex-before-layout-rebuild-1011'),
 ...files('output/original-cone-four-plane-apex-docs-before-1011'),
 ...report.preservation.integrationReports,...report.docChanges.map(row=>row.file),
 ...fs.readdirSync('output').filter(file=>/^original-cone-four-plane-apex-.*\.(json|log|py|mjs)$/.test(file)).map(file=>'output/'+file),
 'README.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs','tess-worker.mjs','tmp/Origamica-15.0-reference.nb',
 'output/audits/original-cone-four-plane-final-1011.json',
 'output/parallel/original-cone-four-plane-apex-cp-1011/root-integration-manifest-1011.json',
]);
const frozenIndexes=[];
for(const ref of report.frozenIndexes){const index=ref.base+'/'+ref.index;assert.equal(sha(index),ref.sha256,index);const frozen=json(index);assert.equal(frozen.files.length,ref.files,index);paths.add(index);
 for(const row of frozen.files){const file=path.resolve(ref.rowBase??ref.base,row.file??row.path);assert.ok(file.startsWith(root+path.sep));assert.equal(sha(file),row.sha256,file);paths.add(path.relative(root,file).replaceAll('\\','/'));}
 frozenIndexes.push({file:index,sha256:sha(index),files:frozen.files.length});
}
const archive='output/audits/original-cone-four-plane-apex-artifacts-1011',output='output/audits/original-cone-four-plane-apex-final-1011.json';
assert.ok(!fs.existsSync(archive)&&!fs.existsSync(output));fs.mkdirSync(archive,{recursive:true});const snapshots=[];
for(const file of [...paths].sort()){const absolute=path.resolve(file);assert.ok(absolute.startsWith(root+path.sep));assert.ok(fs.statSync(file).isFile());const saved=path.join(archive,file);fs.mkdirSync(path.dirname(saved),{recursive:true});fs.copyFileSync(file,saved,fs.constants.COPYFILE_EXCL);assert.equal(sha(saved),sha(file),file);snapshots.push({file,sha256:sha(file),bytes:fs.statSync(file).size});}
fs.writeFileSync(output,JSON.stringify({verified:true,verifiedAt:new Date().toISOString(),archive,snapshots,frozenIndexes,
 tests:{...report.tests,finalMainApp:287,finalParentLayout:323,layoutUserFilePreservation:283},bundle:report.bundle,
 userButtonExportFiles:82,coreImports:60,processingPairs:5,independentDownloadChecks:434092,actualCoreChecks:7719,actualAffine80Checks:158201,
 previousArchiveFilesVerified:3462,preservation:report.preservation,finalSaved:report.finalSaved,
 postEightCheckSourceChange:report.postEightCheckSourceChange,finalTypeBuildMainFilesLayoutAllVerified:true,
 old82And26AssetsPreserved:true,allFailedDraftAndLayoutEvidenceRetained:true,auditorDescriptionCorrectionRetained:true,
 freezeUsesOnlyListedIsolatedFiles:true,junctionsNotTraversed:true,completeOrigamicaGoal:false,packed:false,published:false,machineVerified:false,
 notVerified:['complete original symbolic/default/numerical/curve domains','In3968 true finite CP construction now under source review','Wolfram execution or saved Out','continuous curves/nonflat rigid 3D/whole layers/collision/thickness','portable package/third-party cutter/machine'],
},null,2),{flag:'wx'});
console.log(JSON.stringify({frozen:snapshots.length,sourceTargets:5,mainApp:287,parentLayout:323,actualUserFiles:82,completeOrigamicaGoal:false}));
