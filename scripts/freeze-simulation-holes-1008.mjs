import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const read=f=>fs.readFileSync(f,'utf8'),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const full=read('output/audits/simulation-holes-full-tests-1008.log');
for(const pass of [2150,7,63])assert.match(full,new RegExp(`ℹ pass ${pass}\\r?\\n`));
assert.match(full,/Ran 1070 tests/);assert.match(full,/\r?\nOK\r?\n/);assert.ok(!full.includes('✖'));
const scope=read('output/audits/simulation-holes-scope-final-1008.log');assert.match(scope,/ℹ pass 41\r?\n/);assert.match(scope,/ℹ fail 0\r?\n/);
const build=read('output/audits/simulation-holes-build-1008.log');assert.match(build,/926 modules/);assert.match(build,/built in/);
const ui=[['browser-final',34],['workspace-regression',45]].map(([name,passed])=>{
  const file=`output/audits/simulation-holes-${name}-1008.log`,text=read(file);assert.match(text,/^### Result\r?\n/);assert.ok(!text.includes('### Error'));
  const r=JSON.parse(text.split(/\r?\n/)[1]);assert.equal(r.passed,passed);assert.ok(!r.errors?.length);return {file,passed};
});
const downloads=JSON.parse(read('output/audits/simulation-holes-download-1008.json'));assert.ok(downloads.verified&&downloads.actualNativeUnchanged&&downloads.ordinaryDXFUnchanged&&downloads.actualGPUCPUIntermediateStates&&downloads.OBJSTLTrianglesAndPositionsMatchFOLD&&downloads.FOLDReparsed);
const previous=JSON.parse(read('output/audits/material-holes-final-1008.json')),preserved=[];
for(const record of previous.snapshots){
  if(!['src/','tests/','backend/'].some(p=>record.file.startsWith(p))&&!['package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs'].includes(record.file))continue;
  if(['src/engine/simmodel.ts','tests/core/materialHoles.test.ts'].includes(record.file))continue;
  assert.equal(hash(record.file),record.sha256,`Unexpected change: ${record.file}`);preserved.push(record);
}
const all=dir=>fs.readdirSync(dir,{recursive:true}).map(f=>path.join(dir,f).replaceAll('\\','/')).filter(f=>fs.statSync(f).isFile()&&!f.includes('__pycache__'));
const files=new Set([...all('src'),...all('tests'),...all('backend'),...all('dist'),...fs.readdirSync('scripts').filter(f=>f.includes('simulation-holes-1008')||f==='verify-simulation-workspace.browser.js').map(f=>'scripts/'+f),...fs.readdirSync('output/audits').filter(f=>f.startsWith('simulation-holes-')&&/\.(json|log)$/.test(f)&&f!=='simulation-holes-final-1008.json').map(f=>'output/audits/'+f),...fs.readdirSync('output/playwright').filter(f=>f.startsWith('simulation-holes-')&&f.includes('1008')).map(f=>'output/playwright/'+f),'README.md','docs/Origamica稳定构造逐项差异-20260927.md','docs/P42-带孔三维模拟与导出验收-20261008.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs']);
const archive='output/audits/simulation-holes-artifacts-1008',manifest='output/audits/simulation-holes-final-1008.json';assert.ok(!fs.existsSync(archive)&&!fs.existsSync(manifest),'Never overwrite frozen history');
fs.mkdirSync(archive,{recursive:true});const snapshots=[];
for(const file of [...files].sort()){const target=path.join(archive,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target,fs.constants.COPYFILE_EXCL);assert.equal(hash(target),hash(file));snapshots.push({file,sha256:hash(file),bytes:fs.statSync(file).size});}
const report={verified:true,status:'goal-active',scope:'Actual multi-ring material triangulation in the existing GPU/CPU simulator, preserving holes and original CP; planar 3D input, intermediate target updates and exports',tests:{unit:2150,backend:1070,desktop:7,serverWorker:63,focused:41,newHolesSimulation:8,buildModules:926,browser:79},browser:ui,downloads,changedExisting:['src/engine/simmodel.ts','tests/core/materialHoles.test.ts'],newProduction:['src/engine/simHoles.ts'],preservedSourceAndTests:preserved,archive,snapshots,coordinateBasis:'Existing simulator normalization and axis conversion retained; simulation exports are not millimeter processing CP',remaining:['Original arbitrary non-flat construction/edit semantics','Free endpoints, rays, closed networks, curved batches, repeated-corner merge and outer-to-hole single bridges','Valid degree >=10 weaving','Mother inputs with holes/disconnected pieces','Full Wolfram symbolic/options/interpolation and unproven domains'],notVerified:['Maximum-scale performance','Portable EXE/native confirmation bridge; release unchanged','Third-party mesh or engraving software import and machine outcomes','Continuous collision-free physical folding or full original equivalence']};
fs.writeFileSync(manifest,JSON.stringify(report,null,2),{flag:'wx'});console.log(`Frozen ${snapshots.length} files; 79 real UI checks, complete tests and actual exports verified; ${preserved.length} earlier source/test hashes preserved. Full goal remains active.`);
