import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const previous=json('output/original-nonuniform-spiral-final-bundle-1011.json');
const beforeRoot='output/original-nonuniform-spiral-before-parent-fix-1011';
const runFile='output/original-nonuniform-spiral-final-checks-1011.json',run=json(runFile);
assert.equal(run.exitCode,0);assert.equal(run.inputsUnchanged,true);
const deltaFile='output/parallel/original-nonuniform-spiral-parent-spacing-fix-integrated-1010.json',delta=json(deltaFile);
assert.equal(delta.verified,true);assert.equal(delta.files.length,1);const change=delta.files[0];
assert.equal(change.file,'src/components/NonuniformSpiralCP3968Dialog.css');
assert.equal(run.inputs.find(row=>row.file===change.file).sha256,change.before);
for(const row of run.inputs)assert.equal(sha(row.file),row.file===change.file?change.after:row.sha256,row.file);
for(const row of previous.files)assert.equal(sha(beforeRoot+'/'+row.file),row.sha256,row.file);
const oldHtml=fs.readFileSync(beforeRoot+'/dist/index.html','utf8'),newHtml=fs.readFileSync('dist/index.html','utf8');
const asset=(html,ext)=>{const names=[...new Set([...html.matchAll(new RegExp('/assets/main-[A-Za-z0-9_-]+\\.'+ext,'g'))].map(m=>m[0]))];assert.equal(names.length,1);return names[0];};
const functionalBundle=asset(oldHtml,'js'),finalBundle=asset(newHtml,'js'),oldCss=asset(oldHtml,'css'),newCss=asset(newHtml,'css');
assert.equal(functionalBundle,previous.bundle);assert.notEqual(functionalBundle,finalBundle);
let oldJs=fs.readFileSync(beforeRoot+'/dist'+functionalBundle,'utf8'),newJs=fs.readFileSync('dist'+finalBundle,'utf8');
const replacements=[{kind:'main-css-deployment-reference',before:path.basename(oldCss),after:path.basename(newCss)},
 {kind:'own-source-map-comment-reference',before:'sourceMappingURL='+path.basename(functionalBundle)+'.map',after:'sourceMappingURL='+path.basename(finalBundle)+'.map'}];
const occurrences=(text,needle)=>text.split(needle).length-1;
for(const row of replacements){row.beforeOccurrences=occurrences(oldJs,row.before);row.afterOccurrences=occurrences(newJs,row.after);assert.equal(row.beforeOccurrences,row.afterOccurrences);if(row.kind==='own-source-map-comment-reference')assert.ok(row.beforeOccurrences>0,row.kind);
 oldJs=oldJs.replaceAll(row.before,'<'+row.kind+'>');newJs=newJs.replaceAll(row.after,'<'+row.kind+'>');}
assert.equal(oldJs,newJs,'CSS修正后功能JS除了已列部署资源引用必须逐字节一致');
const log=fs.readFileSync('output/original-nonuniform-spiral-parent-build-1011.log','utf8');assert.match(log,/tsc --noEmit && vite build/);assert.match(log,/1045 modules transformed/);assert.match(log,/built in/);
const uiFile='output/playwright/original-nonuniform-spiral-main-1011/browser-checks.json',ui=json(uiFile);
assert.equal(ui.verified,true);assert.equal(ui.passed,true);assert.equal(ui.bundle,functionalBundle);assert.equal(ui.checks,204);assert.equal(ui.downloads.length,52);assert.deepEqual(ui.errors,[]);
const actualFiles=ui.downloads.map(row=>({path:row.path,sha256:sha(row.path)}));
const files=fs.readdirSync('dist',{recursive:true}).map(file=>'dist/'+file.replaceAll('\\','/')).filter(file=>fs.statSync(file).isFile()).map(file=>({file,sha256:sha(file)}));assert.equal(files.length,26);
const ignored=new Set(['dist/index.html','dist'+functionalBundle,'dist'+functionalBundle+'.map','dist'+oldCss]);let unchangedAssets=0;
for(const row of previous.files)if(!ignored.has(row.file)){assert.equal(sha(row.file),row.sha256,row.file);unchangedAssets++;}
const report='output/original-nonuniform-spiral-css-bridge-1011.json';assert.ok(!fs.existsSync(report));
fs.writeFileSync(report,JSON.stringify({verified:true,functionalBundle,finalBundle,onlyCSSSourceChange:true,
 mainJavaScriptEqualAfterAllowedAssetReferenceReplacement:true,normalizedJavaScriptSHA256:crypto.createHash('sha256').update(oldJs).digest('hex'),allowedReplacements:replacements,
 deltaFile,deltaSha256:sha(deltaFile),changedSource:change,finalCheckFile:runFile,finalCheckSha256:sha(runFile),
 oldFunctionalReport:uiFile,oldFunctionalReportSha256:sha(uiFile),oldUserDownloads:52,oldActualMainChecks:204,actualFiles,
 finalTypeBuildPassed:true,unchangedOtherAssets:unchangedAssets,oldBundleAssetsPreserved:26,files,
 finalLayoutRequired:true,finalLayoutPassed:false,finalBundleActualUserDownloads:0,
 scope:'Old 204 actual functional checks and 52 button exports belong to functionalBundle. Final layout must run in a fresh context at finalBundle. The final application JS is byte-identical after only the two exact deployment-reference substitutions listed above; no new-bundle downloads are claimed.'},null,2),{flag:'wx'});
console.log(JSON.stringify({verified:true,functionalBundle,finalBundle,codeEquivalent:true,old52Preserved:true,unchangedAssets}));
