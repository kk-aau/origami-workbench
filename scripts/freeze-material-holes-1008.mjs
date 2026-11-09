import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read=file=>fs.readFileSync(file,'utf8');
const result=file=>{
  const text=read(file);assert.match(text,/^### Result\r?\n/);assert.ok(!text.includes('### Error'));
  const r=JSON.parse(text.split(/\r?\n/)[1]);assert.ok(!r.errors?.length);return r;
};
const uiNames=[['final-browser',24],['extra-browser',10],['face-regression',35],['trace-regression',30],['cut-regression',20],['join-regression',26],['copy-regression',28],['move-regression',38],['clipboard-regression',32],['frame-regression',8],['tools-regression',40],['ordinary-tools-regression',49],['batch-regression',28],['batch-slit-regression',7],['reflect-regression',37]];
const ui=uiNames.map(([name,passed])=>{const file=`output/audits/material-holes-${name}-1008.log`;assert.equal(result(file).passed,passed);return {file,passed};});
assert.equal(ui.reduce((n,r)=>n+r.passed,0),412);
const full=read('output/audits/material-holes-full-tests-1008.log');
for(const n of [2136,7,63])assert.match(full,new RegExp(`ℹ pass ${n}\\r?\\n`));
assert.ok(full.includes('Ran 1070 tests'));assert.match(full,/\r?\nOK\r?\n/);assert.ok(!full.includes('✖'));
for(const [name,pass] of [['final-unit',2142],['final-scope',116]]){
  const text=read(`output/audits/material-holes-${name}-1008.log`);assert.match(text,new RegExp(`ℹ pass ${pass}\\r?\\n`));assert.match(text,/ℹ fail 0\r?\n/);assert.ok(!text.includes('✖'));
}
const build=read('output/audits/material-holes-final-build-1008.log');assert.match(build,/925 modules/);assert.match(build,/built in/);
const downloads=JSON.parse(read('output/audits/material-holes-download-1008.json'));
for(const key of ['verified','trueFaceHoleSchemaV2','noHelperCPDXFEdges','completeRemoveAndMTraceReplay','cancelUndoRedoExact','actualFOLDCPFFRootsExact','frontBackRegionsOrdered','annulusArea80000','ordinaryR12LineMillimetersExact'])assert.equal(downloads[key],true);
for(const [name,lines] of [['final',16],['M-final',22],['insert-final',22],['batch-final',28],['copy-final',32]])assert.equal(downloads.cases[name].dxfLines,lines);
const legacy=['holes','face','trace','cut','join','copy','move','clipboard','clipboard-frame','tools','batch','reflect'];
for(const name of legacy){const text=read(`output/audits/material-holes-${name}-download-regression-1008.log`);assert.match(text,/verified/i);assert.ok(!text.includes('AssertionError'));assert.ok(!text.includes('ERR_'));}
const baseline=JSON.parse(read('output/audits/material-holes-baseline-1008.json'));
const unchanged=new Set(['src/app/flatFoldSettings.ts','src/core/materialReflect.ts','src/core/cpPathOptimizer.ts','src/core/cpProcessingExport.ts','src/components/CPProcessingExportDialog.tsx']);
const preserved=[],changed=[];
for(const [file,sha256] of Object.entries(baseline)){
  if(unchanged.has(file)){assert.equal(hash(file),sha256);preserved.push({file,sha256});}
  else {assert.notEqual(hash(file),sha256);changed.push({file,before:sha256,after:hash(file)});}
}
assert.equal(preserved.length,5);assert.equal(changed.length,19);
const additionalExisting=['src/components/MaterialBatchDialog.tsx','src/components/ModelComparisonPane.tsx','src/components/ModelShadows.tsx','src/app/modelShadowBoundaries.ts','src/app/modelRegionBoundaries.ts','src/app/foldedModelSVG.ts','src/engine/simmodel.ts'];
const additionalNew=['src/core/materialRings.ts','src/core/materialHoleTriangles.ts','src/core/materialHoleSplit.ts','src/app/modelRings.ts','src/components/IndexedFaceShape.tsx'];
const allFiles=dir=>fs.readdirSync(dir,{recursive:true}).map(f=>path.join(dir,f).replaceAll('\\','/')).filter(f=>fs.statSync(f).isFile()&&!f.includes('__pycache__'));
const files=new Set([
  ...allFiles('src'),...allFiles('tests'),...allFiles('backend'),...allFiles('dist'),
  ...fs.readdirSync('scripts').filter(f=>f.includes('material-')&&/100[78]/.test(f)).map(f=>'scripts/'+f),
  ...fs.readdirSync('output/audits').filter(f=>f.startsWith('material-holes-')&&/\.(json|log)$/.test(f)&&f!=='material-holes-final-1008.json').map(f=>'output/audits/'+f),
  ...fs.readdirSync('output/playwright').filter(f=>f.startsWith('material-holes-')&&f.includes('1008')).map(f=>'output/playwright/'+f),
  'README.md','docs/Origamica稳定构造逐项差异-20260927.md','docs/P42-带孔面合并与统一流程验收-20261008.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs',
]);
const archive='output/audits/material-holes-artifacts-1008';
assert.ok(!fs.existsSync(archive),'Never overwrite frozen history');
assert.ok(!fs.existsSync('output/audits/material-holes-final-1008.json'),'Never overwrite frozen manifest');
fs.mkdirSync(archive,{recursive:true});const snapshots=[];
for(const file of [...files].sort()){
  const target=path.join(archive,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target,fs.constants.COPYFILE_EXCL);assert.equal(hash(target),hash(file));snapshots.push({file,sha256:hash(file),bytes:fs.statSync(file).size});
}
const report={verified:true,status:'goal-active',scope:'True simple multi-ring material faces: merge, single and batch straight-line subdivision, cut/join/copy/clipboard, 2D folding and front/back rendering, actual exports; no helper CP lines',tests:{fullSuiteUnit:2136,finalUnit:2142,backend:1070,desktop:7,serverWorker:63,focused:116,newHoles:15,buildModules:925,browser:412},browser:ui,downloads,legacyDownloads:legacy,preserved,intentionallyChangedBaseline:changed,additionalExisting,additionalNew,archive,snapshots,intermediateFailure:{file:'output/audits/material-holes-intermediate-v2-unit-1008.log',cause:'v2 candidate constructor returned hardcoded v1; corrected and final suites pass'},remaining:['Self-touching/repeated-corner merge and non-separating outer-to-hole single bridge topology','Arbitrary free interior endpoints, rays, closed networks and curved batch inputs','Non-flat intermediate folding and holed 3D simulation','Valid degree >=10 woven topology','Mother inputs with their own holes/disconnected pieces','Full Wolfram symbolic/options/interpolation and unproven domains'],notVerified:['Actual Wolfram execution or global equivalence','Arbitrary operation/root combinations or maximum-scale performance','Portable EXE and native confirmation bridge; release remains 0.13.5','External consumers of extended FOLD hole fields','Final holed 3D browser flow; input rejection tested in unit suite','Continuous collision-free folding','Engraving software import, machine trial or speed gains']};
fs.writeFileSync('output/audits/material-holes-final-1008.json',JSON.stringify(report,null,2),{flag:'wx'});
console.log(`Frozen ${snapshots.length} files; 412 real UI checks, final tests and 5 actual export cases verified. Full goal remains active; release unchanged.`);
