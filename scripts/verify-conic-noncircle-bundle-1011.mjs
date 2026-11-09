import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const json=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const record='output/original-conic-noncircle-bundle-1011.json',runFile='output/original-conic-noncircle-checks-1011.json';
const run=json(runFile);assert.equal(run.exitCode,0);assert.equal(run.inputsUnchanged,true);
if(process.argv[2]==='capture'){
 assert.ok(!fs.existsSync(record));
 const log=fs.readFileSync('output/original-conic-noncircle-checks-1011.log','utf8');
 const names=[...new Set([...log.matchAll(/dist\/assets\/main-[A-Za-z0-9_-]+\.js/g)].map(m=>m[0].slice(4)))];assert.equal(names.length,1);
 assert.ok(fs.readFileSync('dist/index.html','utf8').includes(`src="${names[0]}"`));
 const files=fs.readdirSync('dist',{recursive:true}).map(f=>'dist/'+f.replaceAll('\\','/')).filter(f=>fs.statSync(f).isFile());
 fs.writeFileSync(record,JSON.stringify({capturedAt:new Date().toISOString(),runFile,runSha256:sha(runFile),bundle:names[0],files:files.map(file=>({file,sha256:sha(file)}))},null,2),{flag:'wx'});
 console.log(JSON.stringify({bundle:names[0],files:files.length}));
}else{
 assert.equal(process.argv[2],'verify');const captured=json(record);assert.equal(sha(runFile),captured.runSha256);
 for(const row of captured.files)assert.equal(sha(row.file),row.sha256,row.file);
 const ui=json('output/playwright/original-conic-noncircle-main-1011/downloads-001/browser-checks.json');assert.equal(ui.verified,true);assert.equal(ui.bundle,captured.bundle);assert.deepEqual(ui.errors,[]);
 const target='output/original-conic-noncircle-bundle-verified-1011.json';assert.ok(!fs.existsSync(target));
 fs.writeFileSync(target,JSON.stringify({verified:true,record,recordSha256:sha(record),bundle:captured.bundle,mainAppPassed:ui.passed,actualUserDownloads:ui.downloads.length,unchangedBuiltFiles:captured.files.length},null,2),{flag:'wx'});
 console.log(JSON.stringify({verified:true,bundle:captured.bundle,passed:ui.passed,userDownloads:ui.downloads.length}));
}



