import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const read=file=>fs.readFileSync(file,'utf8'),hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const all=dir=>fs.readdirSync(dir,{recursive:true}).map(file=>path.join(dir,file).replaceAll('\\','/')).filter(file=>fs.statSync(file).isFile()&&!file.includes('__pycache__'));
const run=JSON.parse(read('output/original-parameter-construct-full-run-1010.json'));assert.equal(run.exitCode,0);assert.equal(run.inputsUnchanged,true);assert.equal(run.inputs.length,1804);assert.deepEqual(run.tests,{frontend:2740,backend:1243,desktop:7,serverWorker:63});
for(const row of run.inputs)assert.equal(hash(row.file),row.sha256,`Changed tested input: ${row.file}`);
assert.equal(Number(read('output/original-parameter-construct-build-1010.log').match(/(\d+) modules transformed/)?.[1]),1007);
const folders=['output/original-huffman-parabola-browser-1010','output/original-woven-cell-hole-browser-1010','output/original-rectangular-repeat-browser-1010'];
const expected=[20,23,39],browsers=folders.map((dir,i)=>{const file=dir+'/browser-tests.log',match=read(file).match(/^### Result\r?\n([^\r\n]+)/m);assert.ok(match,file);const data=JSON.parse(match[1]);assert.equal(data.passed,expected[i]);assert.deepEqual(data.errors,[]);return{file,passed:data.passed};});
const parabola=JSON.parse(read(folders[0]+'/download-audit.json'));assert.equal(parabola.verified,true);assert.equal(parabola.actualDownloads,6);assert.equal(parabola.downloadChecks,35);assert.equal(parabola.bundle,'/assets/main-8sDQDN6x.js');assert.ok(fs.existsSync('dist'+parabola.bundle));assert.equal(JSON.parse(read(folders[0]+'/http-audit.json')).passed,10);
const hole=JSON.parse(read(folders[1]+'/download-audit.json'));assert.equal(hole.verified,true);assert.equal(hole.actualDownloads,18);for(const key of ['CPVoidEmpty','CPAndFFCoordinatesExact','reopenedLayersSolved','isolatedSavedDocumentsExact','normalDXFGeometryAndCountsExact'])assert.equal(hole[key],true);
const rectangular=JSON.parse(read(folders[2]+'/independent-download-evidence.json'));assert.equal(rectangular.passed,2);assert.equal(rectangular.actualFilesRead,8);
const preservationFile='output/original-parameter-construct-preservation-1010.json',preservation=JSON.parse(read(preservationFile));assert.equal(preservation.verified,true);assert.equal(preservation.previousArchiveFilesVerified,2382);assert.equal(preservation.ordinaryAndOptimizedDXFPreserved,true);
const paths=new Set([...all('src'),...all('backend'),...all('tests'),...all('vendor/simulator'),...all('dist'),...all('docs'),
 ...fs.readdirSync('scripts').filter(file=>/original.*1010|curve2.*1010|ndsolve.*1010|ring.*1010|huffman.*1010|woven.*1010|linked.*1010|rectangular.*1010/.test(file)).map(file=>'scripts/'+file),
 ...fs.readdirSync('output').filter(file=>/original-.*1010\.(json|log)$/.test(file)).map(file=>'output/'+file),...preservation.integrationReports,
 'README.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs','output/audits/original-linked-first3d-final-1010.json',...all('output/original-parameter-construct-server-1010/projects')]);
for(const dir of folders)for(const file of all(dir))paths.add(file);
const archive='output/audits/original-parameter-construct-artifacts-1010',manifest='output/audits/original-parameter-construct-final-1010.json';assert.ok(!fs.existsSync(archive)&&!fs.existsSync(manifest));fs.mkdirSync(archive,{recursive:true});
const snapshots=[];for(const file of [...paths].sort()){assert.ok(fs.existsSync(file),file);const target=path.join(archive,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target,fs.constants.COPYFILE_EXCL);assert.equal(hash(target),hash(file));snapshots.push({file,sha256:hash(file),bytes:fs.statSync(file).size});}
const report={verified:true,completeOrigamicaGoal:false,verifiedAt:new Date().toISOString(),archive,snapshots,tests:{...run.tests,buildModules:1007,mainAppFocused:82},browsers,actualDownloads:32,additionalActualPublicApi:10,bundle:parabola.bundle,preservation,notVerified:['original Old woven independent contract and pending help returns','full Wolfram expression/interpolation/options/controller/default semantics','whole numerical/layer/collision/physical domain','portable/native EXE, third-party import and machine; not packaged or published']};
fs.writeFileSync(manifest,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({frozen:snapshots.length,tests:report.tests,actualDownloads:32,completeOrigamicaGoal:false}));
