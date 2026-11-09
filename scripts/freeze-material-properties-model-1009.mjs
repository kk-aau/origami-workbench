import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const read=f=>fs.readFileSync(f,'utf8'),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const full=read('output/material-properties-model-full-test-1009.log');
for(const n of [2519,7,63])assert.match(full,new RegExp(`ℹ pass ${n}\\r?\\n`));
assert.match(full,/Ran 1101 tests/);assert.match(full,/\r?\nOK\r?\n/);assert.ok(!full.includes('✖')&&!full.includes('FAILED ('));
assert.match(read('output/material-properties-model-focused-1009.log'),/ℹ pass 178\r?\n/);
assert.match(read('output/material-properties-model-build-1009.log'),/965 modules/);assert.match(read('output/material-properties-model-build-1009.log'),/built in/);
const browser=[['browser',65],['direct-browser',8],['pick-browser',12],['move-regression-browser',72],['move-regression-drag-browser',5],['reflect-browser',71],['clipboard-browser',72],['identity-browser',71],['mesh-browser',16]].map(([name,passed])=>{
 const file=`output/material-properties-model-${name}-1009.log`,log=read(file);assert.match(log,/^### Result\r?\n/);assert.ok(!log.includes('### Error'));const result=JSON.parse(log.split(/\r?\n/)[1]);assert.equal(result.passed,passed);assert.deepEqual(result.errors,[]);return {file,passed};
});assert.equal(browser.reduce((sum,b)=>sum+b.passed,0),392);
const downloads=[
 ['output/material-properties-model-download-1009.json','download-final',20],
 ['output/material-properties-model-move-regression-download-1009.json','move-regression-download',17],
 ['output/material-properties-model-reflect-regression-download-1009.json','reflect-download',16],
 ['output/material-properties-model-clipboard-regression-download-1009.json','clipboard-download',20],
 ['output/audits/material-properties-model-identity-regression-download-1009.json','identity-download',16],
 ['output/audits/material-properties-model-mesh-download-1009.json','mesh-download',3]
].map(([file,logName,groups])=>{
 const data=JSON.parse(read(file));assert.equal(data.verified,true);assert.equal(Object.keys(data.cases).length,groups);const log=`output/material-properties-model-${logName}-1009.log`;assert.ok(read(log).startsWith('Verified'));return {file,log,groups};
});assert.equal(downloads.slice(0,-1).reduce((sum,r)=>sum+r.groups,0),89);
const changedProduction=new Set(['src/App.tsx','src/app/editorCommit.ts','src/components/MaterialCurveModelDialog.tsx','src/components/MaterialPieceSelector.tsx','src/components/materialCutDialog.css','src/core/materialCurveModel.ts','src/core/materialFaceCommon.ts','src/core/materialFaceEdit.ts']);
const addedProduction=['src/components/MaterialLinePropertiesDialog.tsx','src/core/materialLineProperties.ts'],addedTests=['tests/core/materialPropertiesModel.test.ts','tests/fixtures/materialPropertiesModel.ts'];
const previous=JSON.parse(read('output/audits/material-location-move-model-final-1009.json')),preserved=[],observed=[];
for(const r of previous.snapshots){
 if(!['src/','tests/','backend/','vendor/'].some(p=>r.file.startsWith(p))&&!['package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs'].includes(r.file))continue;
 if(changedProduction.has(r.file)){assert.notEqual(hash(r.file),r.sha256);observed.push(r.file);}else{assert.equal(hash(r.file),r.sha256,`Unexpected change: ${r.file}`);preserved.push(r);}
}
assert.deepEqual(observed.sort(),[...changedProduction].sort());assert.equal(preserved.length,1652);
const all=dir=>fs.readdirSync(dir,{recursive:true}).map(f=>path.join(dir,f).replaceAll('\\','/')).filter(f=>fs.statSync(f).isFile()&&!f.includes('__pycache__'));
const current=[...all('src'),...all('tests'),...all('backend'),...all('vendor/simulator')],priorFiles=new Set(previous.snapshots.map(r=>r.file));assert.deepEqual(current.filter(f=>!priorFiles.has(f)).sort(),[...addedProduction,...addedTests].sort());
const archive='output/audits/material-properties-model-artifacts-1009',manifest='output/audits/material-properties-model-final-1009.json';assert.ok(!fs.existsSync(archive)&&!fs.existsSync(manifest),'Never overwrite frozen history');
const matches=f=>f.includes('material-properties-model')&&f.includes('1009'),initial=fs.readdirSync('output/playwright').filter(f=>(f.startsWith('material-location-move-model-')||f.startsWith('material-location-copy-identity-regression-')||f.startsWith('material-clipboard-model-')||f.startsWith('material-reflect-model-'))&&f.endsWith('-initial-1009.zhezhi.json')).map(f=>'output/playwright/'+f);
const files=new Set([...current,...all('dist'),...fs.readdirSync('scripts').filter(matches).map(f=>'scripts/'+f),...fs.readdirSync('output').filter(f=>matches(f)&&/\.(json|log)$/.test(f)&&!f.includes('-freeze-')).map(f=>'output/'+f),...fs.readdirSync('output/audits').filter(f=>matches(f)&&/\.(json|log)$/.test(f)&&!f.includes('-final-')&&!f.includes('-freeze-')).map(f=>'output/audits/'+f),...fs.readdirSync('output/playwright').filter(matches).map(f=>'output/playwright/'+f),...initial,'output/audits/material-location-copy-identity-regression-recipes-1009.json','output/playwright/material-topology-model-original-saved-1009.zhezhi.json','README.md','docs/Origamica稳定构造逐项差异-20260927.md','docs/Origamica当前剩余范围-20261009.md','docs/P42-材料折痕属性参数重放-20261009.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs','output/audits/material-location-move-model-final-1009.json']);
fs.mkdirSync(archive,{recursive:true});const snapshots=[];
for(const file of [...files].sort()){const target=path.join(archive,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target,fs.constants.COPYFILE_EXCL);assert.equal(hash(target),hash(file));snapshots.push({file,sha256:hash(file),bytes:fs.statSync(file).size});}
const report={
 verified:true,completeOrigamicaGoal:false,verifiedAt:new Date().toISOString(),scope:'Persistent material line assignment/target-angle/swap edits; original direct controls; source interval replay, unchanged indexed geometry and original FF reconciliation',
 tests:{frontendFull:2519,backendFull:1101,desktop:7,serverWorker:63,newCore:12,focused:178,buildModules:965,browser:392,actualOrdinaryExportGroups:89,simulationMeshGroups:3},browser,downloads,changedProduction:[...changedProduction],addedProduction,addedTests,preservedSourceTestsAndVendor:preserved,archive,snapshots,
 verificationScope:'Full npm test and build cover final production code; later edits are verification scripts/documentation only. Actual browser selection/navigation, original property buttons, angle group reuse, JSON/FOLD parameter reopening, stale/cancel/history/empty/CP-only states and old movement/reflection/clipboard/face identities verified. 89 actual ordinary groups parsed and independently replayed; unknown angles preserved and explicitly rejected for simulation. Three actual mesh sets parsed. 1652 prior source/test/vendor/config hashes preserved, including ordinary formats/DXF, optimizer/preview, assign/swap/refold/movement math, backend/server and simulator. v1-v11 support retained.',
 remainingCategories:8,remainingCountMeaning:'Major gap categories, not function count or completion percentage',
 remaining:['Persistent auxiliary generation/editing and reference-face operations; complex source proof','Continuous semantic anchors across generated segmentation/topology changes','Valid degree >=10 weaving','Curved/touching/intersecting mother holes','Arbitrary analytic/interpolated curves and CP continuation','Arbitrary nonflat construction/editing','Broader visible-color/layer constraints','Complete Mathematica expressions/options/interpolation objects'],
 notVerified:['All parameter/capacity/performance domains','Continuous collision-free folding/thickness/manufacturing','Complete Wolfram Out equivalence','Portable EXE/native interactions; not packaged','Third-party import/machine pressure/speed/accuracy']
};
fs.writeFileSync(manifest,JSON.stringify(report,null,2),{flag:'wx'});
console.log(`Frozen ${snapshots.length} files; ${preserved.length} previous source/test/vendor/config hashes preserved;392 UI checks,89 ordinary groups,3 mesh sets. Full goal active.`);
