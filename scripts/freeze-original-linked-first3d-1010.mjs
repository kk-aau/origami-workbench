import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const read=file=>fs.readFileSync(file,'utf8');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const all=dir=>fs.readdirSync(dir,{recursive:true}).map(file=>path.join(dir,file).replaceAll('\\','/')).filter(file=>fs.statSync(file).isFile()&&!file.includes('__pycache__'));
const run=JSON.parse(read('output/original-linked-first3d-full-run-1010.json'));assert.equal(run.exitCode,0);assert.equal(run.inputsUnchanged,true);
for(const row of run.inputs)assert.equal(hash(row.file),row.sha256,`Changed tested source: ${row.file}`);
const full=read('output/original-linked-first3d-full-test-1010.log');assert.deepEqual([...full.matchAll(/ℹ pass (\d+)/g)].map(m=>Number(m[1])),[2722,7,63]);assert.equal(Number(full.match(/Ran (\d+) tests/)?.[1]),1226);
assert.equal(Number(read('output/original-linked-first3d-build-1010.log').match(/(\d+) modules transformed/)?.[1]),1005);
const browser='output/original-linked-first3d-browser-1010/browser-tests.log';
const match=read(browser).match(/^### Result\r?\n(\{[^\r\n]+\})/m);assert.ok(match);
const result=JSON.parse(match[1]);assert.equal(result.passed,67);assert.deepEqual(result.errors,[]);
const download='output/original-linked-first3d-browser-1010/independent-download-evidence.json';
const back=JSON.parse(read(download));assert.equal(back.passed,10);assert.equal(back.actualFilesRead,30);
const preservationFile='output/original-linked-first3d-preservation-1010.json',preservation=JSON.parse(read(preservationFile));
assert.equal(preservation.verified,true);assert.equal(preservation.previousArchiveFilesVerified,2399);assert.equal(preservation.ordinaryAndOptimizedDXFPreserved,true);
const paths=new Set([...all('src'),...all('backend'),...all('tests'),...all('vendor/simulator'),...all('dist'),...all('docs'),
 ...fs.readdirSync('scripts').filter(file=>/original.*1010|curve2.*1010|ndsolve.*1010|ring.*1010|huffman.*1010|woven.*1010|linked.*1010/.test(file)).map(file=>'scripts/'+file),
 ...fs.readdirSync('output').filter(file=>/original-.*1010\.(json|log)$/.test(file)).map(file=>'output/'+file),
 ...preservation.integrationReports,'README.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs',
 'output/audits/original-three-inputs-final-1010.json',...all('output/original-linked-first3d-browser-1010')]);
const archive='output/audits/original-linked-first3d-artifacts-1010',manifest='output/audits/original-linked-first3d-final-1010.json';
assert.ok(!fs.existsSync(archive)&&!fs.existsSync(manifest));fs.mkdirSync(archive,{recursive:true});
const snapshots=[];
for(const file of [...paths].sort()){assert.ok(fs.existsSync(file),file);const target=path.join(archive,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target,fs.constants.COPYFILE_EXCL);assert.equal(hash(target),hash(file));snapshots.push({file,sha256:hash(file),bytes:fs.statSync(file).size});}
const report={verified:true,completeOrigamicaGoal:false,verifiedAt:new Date().toISOString(),archive,snapshots,
 tests:{frontend:2722,backend:1226,desktop:7,serverWorker:63,buildModules:1005,mainAppFocused:67},actualDownloads:30,browser,download,preservation,
 notVerified:['full Wolfram controller/options/defaults/interpolation objects','whole CP/layer/collision/physical domain','portable/native EXE and third-party software or machine; not packaged or published']};
fs.writeFileSync(manifest,JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({frozen:snapshots.length,tests:report.tests,actualDownloads:30,completeOrigamicaGoal:false}));
