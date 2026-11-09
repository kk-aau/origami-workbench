import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const target='output/original-cone-four-plane-apex-final-bundle-1011.json';
if(process.argv[2]==='capture'){
 assert.ok(!fs.existsSync(target));
 const run=json('output/original-cone-four-plane-apex-checks-1011.json');assert.equal(run.exitCode,0);assert.equal(run.inputsUnchanged,true);
 const fix=json('output/parallel/original-cone-four-plane-apex-parent-spacing-fix-integrated-1010.json');assert.equal(fix.verified,true);assert.equal(fix.files.length,1);
 const changed=fix.files[0];assert.equal(changed.file,'src/components/ConeFourPlaneCP4039Dialog.css');assert.equal(sha(changed.file),changed.after);
 for(const row of run.inputs)assert.equal(sha(row.file),row.file===changed.file?changed.after:row.sha256,row.file);
 assert.equal(run.inputs.find(row=>row.file===changed.file).sha256,changed.before);
 const old=json('output/original-cone-four-plane-apex-bundle-1011.json');
 for(const row of old.files)assert.equal(sha('output/original-cone-four-plane-apex-before-layout-rebuild-1011/'+row.file),row.sha256,row.file);
 const log=fs.readFileSync('output/original-cone-four-plane-apex-layout-rebuild-1011.log','utf8');assert.ok(log.includes('1042 modules transformed'));assert.ok(log.includes('built in'));
 const html=fs.readFileSync('dist/index.html','utf8'),bundle=html.match(/src="(\/assets\/main-[A-Za-z0-9_-]+\.js)"/)?.[1];assert.ok(bundle);
 const files=fs.readdirSync('dist',{recursive:true}).map(f=>'dist/'+f.replaceAll('\\','/')).filter(f=>fs.statSync(f).isFile());assert.equal(files.length,26);
 fs.writeFileSync(target,JSON.stringify({verified:true,capturedAt:new Date().toISOString(),bundle,files:files.map(file=>({file,sha256:sha(file)})),originalEightChecks:'output/original-cone-four-plane-apex-checks-1011.json',originalChecksSha256:sha('output/original-cone-four-plane-apex-checks-1011.json'),originalTests:run.tests,onlySourceDifferenceAfterEightChecks:changed,preservedPriorBuiltFiles:26,finalTypeAndBuildPassed:true,actualFinalMainAppStillRequired:true},null,2),{flag:'wx'});
 console.log(JSON.stringify({verified:true,bundle,files:files.length,onlySourceDifference:changed.file}));
}else{
 assert.equal(process.argv[2],'verify');const captured=json(target);
 assert.equal(sha(captured.originalEightChecks),captured.originalChecksSha256);
 for(const row of captured.files)assert.equal(sha(row.file),row.sha256,row.file);
 const ui=json('output/playwright/original-cone-four-plane-apex-main-final-1011/browser-checks.json');
 assert.equal(ui.verified,true);assert.equal(ui.passed,true);assert.equal(ui.checks,287);assert.equal(ui.downloads.length,82);assert.deepEqual(ui.errors,[]);assert.equal(ui.bundle,captured.bundle);
 const file='output/original-cone-four-plane-apex-final-bundle-verified-1011.json';assert.ok(!fs.existsSync(file));
 fs.writeFileSync(file,JSON.stringify({verified:true,bundle:captured.bundle,capturedRecord:target,capturedSha256:sha(target),unchangedFinalBuiltFiles:26,actualMainChecks:287,actualUserDownloads:82,onlyPostTestSourceDifference:captured.onlySourceDifferenceAfterEightChecks,allOtherSourceAndTestInputsUnchanged:true,finalTypeAndBuildPassed:true,wholeOrigamicaComplete:false},null,2),{flag:'wx'});
 console.log(JSON.stringify({verified:true,bundle:captured.bundle,actualMainChecks:287,actualUserDownloads:82}));
}
