import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const read=file=>fs.readFileSync(file,'utf8'),hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const all=dir=>fs.readdirSync(dir,{recursive:true}).map(file=>path.join(dir,file).replaceAll('\\','/')).filter(file=>fs.statSync(file).isFile()&&!file.includes('__pycache__'));
const run=JSON.parse(read('output/original-helpers-full-run-1010.json'));assert.equal(run.exitCode,0);assert.equal(run.inputsUnchanged,true);
assert.deepEqual(run.tests,{frontend:2761,backend:1257,desktop:7,serverWorker:63});assert.equal(run.inputs.length,1821);
for(const row of run.inputs)assert.equal(hash(row.file),row.sha256,row.file);
assert.equal(Number(read('output/original-helpers-build-1010.log').match(/(\d+) modules transformed/)?.[1]),1014);
const browserRoot='output/original-helpers-browser-final-1010';
const browserPaths=['flasher/browser-tests.log','woven-old/browser-tests.log','woven-old/full-h-browser-tests.log','pot-section-final/browser-tests.log'];
const counts=[34,13,9,58],browsers=browserPaths.map((name,i)=>{const file=browserRoot+'/'+name,data=JSON.parse(read(file).match(/^### Result\r?\n([^\r\n]+)/m)[1]);assert.equal(data.passed,counts[i]);assert.deepEqual(data.errors,[]);return{file,passed:data.passed,bundle:data.bundle};});
assert.ok(browsers.every(b=>b.bundle===browsers[0].bundle));assert.ok(fs.existsSync('dist'+browsers[0].bundle));
const flasher=JSON.parse(read(browserRoot+'/flasher/download-audit.json'));assert.equal(flasher.verified,true);assert.equal(flasher.actualDownloads,8);assert.equal(flasher.downloadChecks,45);
const old=JSON.parse(read(browserRoot+'/woven-old/download-audit.json'));assert.equal(old.verified,true);assert.equal(old.actualDownloads,9);assert.deepEqual(old.ordinaryDXFLineCounts,[64,64]);assert.equal(old.savedDocumentExact,true);
const pot=JSON.parse(read(browserRoot+'/pot-section-final/download-audit.json'));assert.equal(pot.passed,127);assert.equal(pot.actualHelperDownloadFiles,32);assert.equal(pot.constructorDownloadFiles,2);
const preservation=JSON.parse(read('output/original-helpers-preservation-1010.json'));assert.equal(preservation.verified,true);assert.equal(preservation.previousArchiveFilesVerified,2472);assert.equal(preservation.ordinaryAndOptimizedDXFPreserved,true);
const paths=new Set([...all('src'),...all('backend'),...all('tests'),...all('vendor/simulator'),...all('dist'),...all('docs'),...all(browserRoot),...all('output/original-helpers-server-1010/projects'),
 ...fs.readdirSync('scripts').filter(f=>/original.*1010|curve2.*1010|ndsolve.*1010|ring.*1010|huffman.*1010|woven.*1010|linked.*1010|rectangular.*1010|summarize-browser.*1010/.test(f)).map(f=>'scripts/'+f),
 ...fs.readdirSync('output').filter(f=>/original-(helpers|woven-old-root|flasher-all-labels|flasher-wheel).*1010\.(json|log)$/.test(f)).map(f=>'output/'+f),
 ...preservation.integrationReports,'README.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs','output/audits/original-parameter-construct-final-1010.json']);
for(const dir of ['output/original-flasher-all-labels-browser-1010','output/original-flasher-all-labels-browser-final-1010','output/original-woven-old-browser-1010'])for(const f of all(dir))paths.add(f);
const auditBase='output/parallel/woven-old-independent-audit-1010',auditFile=auditBase+'/audit-frozen-final.json',audit=JSON.parse(read(auditFile));
paths.add(auditFile);for(const row of audit.files){const file=auditBase+'/'+row.file;assert.equal(hash(file),row.sha256,file);paths.add(file);}
for(const file of ['output/parallel/original-source-helper-1010/delivery-frozen.json','output/parallel/original-source-helper-1010/delivery/flasher-all-labels.patch','output/parallel/original-source-helper-1010/delivery/integration-manifest.json','output/parallel/original-woven-old-1010/delivery/README.md','output/parallel/original-woven-old-1010/delivery/original-woven-old.patch','output/parallel/original-woven-old-1010/delivery/manifest.json','output/parallel/original-pot-cross-section-1010/pot-cross-section-graphics.patch','output/parallel/original-pot-cross-section-1010/delivery-manifest.json','output/parallel/original-pot-cross-section-1010/README-交付.md'])paths.add(file);
assert.equal(hash('tmp/Origamica-15.0-reference.nb'),'19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9');
const archive='output/audits/original-helpers-artifacts-1010',manifest='output/audits/original-helpers-final-1010.json';assert.ok(!fs.existsSync(archive)&&!fs.existsSync(manifest));fs.mkdirSync(archive,{recursive:true});
const snapshots=[];
for(const file of [...paths].sort()){
 assert.ok(fs.existsSync(file),file);const target=path.join(archive,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target,fs.constants.COPYFILE_EXCL);assert.equal(hash(target),hash(file));snapshots.push({file,sha256:hash(file),bytes:fs.statSync(file).size});
}
const report={verified:true,verifiedAt:new Date().toISOString(),completeOrigamicaGoal:false,scope:['finite original Old d/dd CP construction','original Flasher all Text labels helper','original PotCrossSectionGraphics two-Line helper with seven finite options','explicit full absolute h editing and actual wheel fix'],archive,snapshots,tests:{...run.tests,buildModules:1014,mainAppFocused:114},browsers,bundle:browsers[0].bundle,userButtonExportFiles:41,additionalCapturedHelperHTTPFiles:8,additionalCapturedConstructorHTTPFiles:2,preservation,notVerified:['full original Wolfram expression/interpolation/options/controller/default semantics and all TObj domains','all numerical/layer/collision/physical domains','portable/native EXE, third-party import and machine; not packaged or published','next Ring Log, Unsafe and Courteous batch is still in isolated implementation, excluded from completed scope']};
fs.writeFileSync(manifest,JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({frozen:snapshots.length,tests:report.tests,userButtonExportFiles:41,completeOrigamicaGoal:false}));
