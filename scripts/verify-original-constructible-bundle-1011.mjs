import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const json=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const record='output/original-constructible-bundle-1011.json';
const runFile='output/original-constructible-editor-checks-1011.json';
const run=json(runFile);assert.equal(run.exitCode,0);assert.equal(run.inputsUnchanged,true);
if(process.argv[2]==='capture'){
 assert.ok(!fs.existsSync(record));
 const log=fs.readFileSync('output/original-constructible-editor-checks-1011.log','utf8');
 const bundles=[...new Set([...log.matchAll(/dist\/assets\/main-[A-Za-z0-9_-]+\.js/g)].map(m=>m[0].slice(4)))];
 assert.equal(bundles.length,1);
 const index=fs.readFileSync('dist/index.html','utf8');assert.ok(index.includes(`src="${bundles[0]}"`));
 const files=fs.readdirSync('dist',{recursive:true}).map(f=>'dist/'+f.replaceAll('\\','/')).filter(f=>fs.statSync(f).isFile());
 fs.writeFileSync(record,JSON.stringify({capturedAt:new Date().toISOString(),buildRun:runFile,buildRunSha256:sha(runFile),bundle:bundles[0],files:files.map(file=>({file,sha256:sha(file)}))},null,2),{flag:'wx'});
 console.log(JSON.stringify({bundle:bundles[0],files:files.length}));
}else{
 assert.equal(process.argv[2],'verify');
 const captured=json(record);assert.equal(sha(runFile),captured.buildRunSha256);
 for(const r of captured.files)assert.equal(sha(r.file),r.sha256,r.file);
 const cases=['min-total','flasher','gore','across','discrete'];
 for(const name of cases){const ui=json(`output/playwright/original-constructible-final-1010/${name}/browser-checks.json`);assert.equal(ui.verified,true);assert.equal(ui.bundle,captured.bundle,name);}
 const report='output/original-constructible-bundle-verified-1011.json';assert.ok(!fs.existsSync(report));
 fs.writeFileSync(report,JSON.stringify({verified:true,verifiedAt:new Date().toISOString(),record,recordSha256:sha(record),buildRun:runFile,bundle:captured.bundle,actualMainAppCases:cases,unchangedBuiltFiles:captured.files.length},null,2),{flag:'wx'});
 console.log(JSON.stringify({verified:true,bundle:captured.bundle,mainAppCases:cases.length}));
}
