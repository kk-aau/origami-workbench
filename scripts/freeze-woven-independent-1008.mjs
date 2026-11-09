import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const read=f=>fs.readFileSync(f,'utf8'),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const full=read('output/audits/woven-independent-full-tests-final-1008.log');
for(const pass of [2154,7,63])assert.match(full,new RegExp(`ℹ pass ${pass}\\r?\\n`));
assert.match(full,/Ran 1076 tests/);assert.match(full,/\r?\nOK\r?\n/);assert.ok(!full.includes('✖'));assert.ok(!full.includes('FAILED ('));
const unit=read('output/audits/woven-independent-unit-verified-1008.log');assert.match(unit,/ℹ pass 2155\r?\n/);assert.match(unit,/ℹ fail 0\r?\n/);
const python=read('output/audits/woven-independent-python-final-1008.log');assert.match(python,/Ran 6 tests/);assert.match(python,/\r?\nOK\r?\n/);
const build=read('output/audits/woven-independent-build-verified-1008.log');assert.match(build,/926 modules/);assert.match(build,/built in/);
const ui=[['browser-latest',93],['merit-regression-complete',29],['period-regression-complete',28]].map(([name,passed])=>{
 const file=`output/audits/woven-independent-${name}-1008.log`,text=read(file);assert.match(text,/^### Result\r?\n/);assert.ok(!text.includes('### Error'));const result=JSON.parse(text.split(/\r?\n/)[1]);assert.equal(result.passed,passed);assert.ok(!result.errors?.length);return {file,passed};
});
const downloads=JSON.parse(read('output/audits/woven-independent-download-1008.json'));
for(const key of ['verified','sixPublicResponsesAndActualFiles','originalIndicesAndFFExact','sourceParametersExact','nativeFOLDReopenAndLayerSolved','noInterComponentCreases','ordinaryR12LinesMillimetersExact'])assert.equal(downloads[key],true);
assert.equal(Object.keys(downloads.cases).length,6);assert.equal(downloads.cases['merit-cut-pair'].materials,6);assert.equal(downloads.cases['merit-cut-pair'].dxfLines,32);
for(const name of ['merit','period']){const text=read(`output/audits/woven-independent-${name}-download-regression-1008.log`);assert.match(text,/verified/i);assert.ok(!text.includes('AssertionError'));}
assert.match(read('output/audits/woven-independent-simulation-dxf-recheck-1008.log'),/Verified/);
const highEven=['root','chart','embedding','embedding-root'].map(name=>{
 const file=`output/audits/woven-high-even-${name}-probe-1008.json`,cases=JSON.parse(read(file));
 assert.ok(cases.length>0);const high=cases.filter(c=>(c.degree??0)>=10);assert.ok(high.every(c=>c.status==='not-certified'));
 return {file,scenarios:cases.length,highScenarios:high.length,calibrationGenerated:cases.filter(c=>c.status==='generated'&&c.degree<10).length};
});
assert.deepEqual(highEven.map(r=>r.highScenarios),[96,192,6,128]);
const changedProduction=new Set(['backend/tessellation_woven_graph.py','backend/tessellation_woven.py','src/app/wovenGraph.ts','src/app/wovenCutTopology.ts','src/app/tessellation.ts','src/app/wovenMaterialDocument.ts','src/app/tessellationFlatGeometry.ts','src/app/wovenParams.ts','src/components/WovenControls.tsx']);
const changedTest=new Set(['tests/core/simulationHoles.test.ts']);
const previous=JSON.parse(read('output/audits/simulation-holes-final-1008.json')),preserved=[];
for(const record of previous.snapshots){
 if(!['src/','tests/','backend/'].some(p=>record.file.startsWith(p))&&!['package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs'].includes(record.file))continue;
 if(changedProduction.has(record.file)||changedTest.has(record.file)){assert.notEqual(hash(record.file),record.sha256);continue;}
 assert.equal(hash(record.file),record.sha256,`Unexpected source change: ${record.file}`);preserved.push(record);
}
const all=dir=>fs.readdirSync(dir,{recursive:true}).map(f=>path.join(dir,f).replaceAll('\\','/')).filter(f=>fs.statSync(f).isFile()&&!f.includes('__pycache__'));
const files=new Set([...all('src'),...all('tests'),...all('backend'),...all('dist'),...fs.readdirSync('scripts').filter(f=>f.includes('woven-independent')&&f.includes('1008')||f.startsWith('probe-woven-high-even-')&&f.includes('1008')||f==='verify-simulation-holes-download-1008.ts').map(f=>'scripts/'+f),...fs.readdirSync('output/audits').filter(f=>(f.startsWith('woven-independent-')||f.startsWith('woven-high-even-'))&&/\.(json|log)$/.test(f)&&f!=='woven-independent-final-1008.json').map(f=>'output/audits/'+f),...fs.readdirSync('output/playwright').filter(f=>f.startsWith('woven-independent-')&&f.includes('1008')).map(f=>'output/playwright/'+f),'README.md','docs/Origamica稳定构造逐项差异-20260927.md','docs/P42-独立母图构造与高偶度核查-20261008.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs']);
const archive='output/audits/woven-independent-artifacts-1008',manifest='output/audits/woven-independent-final-1008.json';assert.ok(!fs.existsSync(archive)&&!fs.existsSync(manifest),'Never overwrite frozen history');fs.mkdirSync(archive,{recursive:true});const snapshots=[];
for(const file of [...files].sort()){const target=path.join(archive,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target,fs.constants.COPYFILE_EXCL);assert.equal(hash(target),hash(file));snapshots.push({file,sha256:hash(file),bytes:fs.statSync(file).size});}
const report={verified:true,status:'goal-active',scope:'Actual independently bounded mother components: common original solve, separate original FF roots, native material adoption, complete inset/period/cut composition and exports',tests:{fullUnit:2154,finalUnit:2155,backend:1076,desktop:7,serverWorker:63,newIndependentTS:5,newIndependentPython:6,buildModules:926,browser:150},browser:ui,downloads,highEvenDiagnostics:highEven,changedProduction:[...changedProduction],changedExistingTest:[...changedTest],correctedVerification:'Previous simulation tests incorrectly used exportDocument for dxf; now use exportDXF. Actual independent DXFs independently parsed. Export production code unchanged.',preservedSourceAndTests:preserved,archive,snapshots,remaining:['Visual vertex/edge editing of finite mothers; current numbered inspection and JSON input retained','Mother inputs with their own holes','Valid degree >=10 weaving; 422 higher-degree diagnostic scenarios not certified, public gate unchanged','Arbitrary free endpoints, rays, closed networks, curved batches, repeated-corner merges and outer-to-hole bridges','Original arbitrary non-flat construction/editing','Full Wolfram symbolic/options/interpolation and unproven domains'],notVerified:['Arbitrary roots/operations/period combinations or maximum-scale performance','Actual Wolfram/global equivalence','Portable EXE/native confirmation bridge; release unchanged','External FOLD/engraving import or machine outcomes','Continuous collision-free physical folding']};fs.writeFileSync(manifest,JSON.stringify(report,null,2),{flag:'wx'});console.log(`Frozen ${snapshots.length} files; 150 real UI checks, six exact actual export groups, complete tests and ${preserved.length} preserved source/test hashes. Full goal remains active; high degree still incomplete.`);
