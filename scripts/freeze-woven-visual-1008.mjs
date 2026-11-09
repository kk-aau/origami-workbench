import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const read=f=>fs.readFileSync(f,'utf8');
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const full=read('output/audits/woven-visual-full-tests-1008.log');
for(const pass of [2161,7,63])assert.match(full,new RegExp(`ℹ pass ${pass}\\r?\\n`));
assert.match(full,/Ran 1076 tests/);assert.match(full,/\r?\nOK\r?\n/);
assert.ok(!full.includes('✖')&&!full.includes('FAILED ('));
const unit=read('output/audits/woven-visual-unit-latest-1008.log');
assert.match(unit,/ℹ pass 2161\r?\n/);assert.match(unit,/ℹ fail 0\r?\n/);
const build=read('output/audits/woven-visual-build-latest-1008.log');
assert.match(build,/929 modules/);assert.match(build,/built in/);
const browser=[['browser',60],['independent-regression',93],['merit-regression',29],['period-regression',28]].map(([name,count])=>{
 const file=`output/audits/woven-visual-${name}-latest-1008.log`,log=read(file);
 assert.match(log,/^### Result\r?\n/);assert.ok(!log.includes('### Error'));
 const result=JSON.parse(log.split(/\r?\n/)[1]);assert.equal(result.passed,count);assert.deepEqual(result.errors,[]);
 return {file,passed:count};
});
const downloads=JSON.parse(read('output/audits/woven-visual-download-1008.json'));
for(const key of ['verified','actualPublicReplayMatches','preciseMotherCoordinatesPreserved','noStaleGeometryBindings','nativeLineInputAndDerivedMotherSeparate','actualNativeFOLDReopenAndLayerSolved','ordinaryR12LinesMillimetersExact'])assert.equal(downloads[key],true);
assert.equal(downloads.cases.manual.dxfLines,64);assert.equal(downloads.cases.native.dxfLines,32);
assert.equal(downloads.cases.manual.ordinaryFOLDRebuildRoundoff,0);
assert.ok(downloads.cases.native.ordinaryFOLDRebuildRoundoff<1e-10);
for(const name of ['download','independent-download','merit-download','period-download']){
 const log=read(`output/audits/woven-visual-${name}-latest-1008.log`);
 assert.match(log,/verified/i);assert.ok(!log.includes('AssertionError'));
}
const changedProduction=['src/components/WovenGraphDialog.tsx','src/components/WovenGraphDialog.css'];
const addedProduction=['src/app/wovenGraphEdit.ts','src/components/WovenGraphCanvas.tsx','src/components/WovenGraphEditor.tsx'];
const previous=JSON.parse(read('output/audits/woven-independent-final-1008.json')),preserved=[];
for(const record of previous.snapshots){
 if(!['src/','tests/','backend/'].some(p=>record.file.startsWith(p))&&!['package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs'].includes(record.file))continue;
 if(changedProduction.includes(record.file)){assert.notEqual(hash(record.file),record.sha256);continue;}
 assert.equal(hash(record.file),record.sha256,`Unexpected source change: ${record.file}`);preserved.push(record);
}
const all=dir=>fs.readdirSync(dir,{recursive:true}).map(f=>path.join(dir,f).replaceAll('\\','/')).filter(f=>fs.statSync(f).isFile()&&!f.includes('__pycache__'));
const files=new Set([
 ...all('src'),...all('tests'),...all('backend'),...all('dist'),
 ...fs.readdirSync('scripts').filter(f=>f.includes('1008')&&(f.includes('woven-visual')||f.includes('woven-independent'))).map(f=>'scripts/'+f),
 ...fs.readdirSync('output/audits').filter(f=>f.startsWith('woven-visual-')&&/\.(json|log)$/.test(f)&&f!=='woven-visual-final-1008.json').map(f=>'output/audits/'+f),
 ...fs.readdirSync('output/playwright').filter(f=>(f.startsWith('woven-visual-')||f.startsWith('woven-independent-'))&&f.includes('1008')).map(f=>'output/playwright/'+f),
 'README.md','docs/Origamica稳定构造逐项差异-20260927.md','docs/P42-母图可视点边编辑与验收-20261008.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs'
]);
const archive='output/audits/woven-visual-artifacts-1008',manifest='output/audits/woven-visual-final-1008.json';
assert.ok(!fs.existsSync(archive)&&!fs.existsSync(manifest),'Never overwrite frozen history');
fs.mkdirSync(archive,{recursive:true});const snapshots=[];
for(const file of [...files].sort()){
 const target=path.join(archive,file);fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.copyFileSync(file,target,fs.constants.COPYFILE_EXCL);assert.equal(hash(target),hash(file));
 snapshots.push({file,sha256:hash(file),bytes:fs.statSync(file).size});
}
const report={verified:true,status:'goal-active',scope:'Visual editing and construction of finite woven mothers and native line inputs, preserving source precision, indices and public-engine adoption gates',tests:{fullUnit:2161,finalUnit:2161,backend:1076,desktop:7,serverWorker:63,newUnit:6,buildModules:929,browser:210},browser,downloads,changedProduction,addedProduction,addedTests:['tests/app/wovenGraphEdit.test.ts'],preservedSourceAndTests:preserved,archive,snapshots,remaining:['Mother inputs with their own holes','Valid degree >=10 weaving','Arbitrary original material free endpoints, rays, closed networks and curved batches','Repeated-corner slit merges and outer-to-hole bridges','Original arbitrary non-flat construction/editing','Full Wolfram symbolic/options/interpolation and unproven domains'],notVerified:['Maximum-scale performance and multi-touch','Actual Wolfram/global equivalence','Portable EXE/native pointer and confirmation bridge; release unchanged','External FOLD/engraving import or machine outcomes','Continuous collision-free physical folding'],verificationScope:'Full project suite preceded final UI history/pan/snap fixes; final complete frontend suite, build, real UI regressions and actual file readback verify final component state. Backend and previous existing source/test hashes preserved.'};
fs.writeFileSync(manifest,JSON.stringify(report,null,2),{flag:'wx'});
console.log(`Frozen ${snapshots.length} files; 210 real UI checks and ${preserved.length} preserved source/test hashes. Full goal remains active.`);
