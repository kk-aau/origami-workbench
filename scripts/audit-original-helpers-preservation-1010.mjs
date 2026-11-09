import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const previousFile='output/audits/original-parameter-construct-final-1010.json';
const previous=JSON.parse(fs.readFileSync(previousFile,'utf8'));
const integrationReports=['original-flasher-all-labels','original-flasher-wheel','original-woven-old','original-pot-cross-section'].map(name=>`output/parallel/${name}-integrated-1010.json`);
const expected=new Map();
for(const file of integrationReports){
 const report=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(report.verified,true);
 for(const row of report.files){if(expected.has(row.file))assert.equal(row.before,expected.get(row.file),`Unexplained intermediate mutation: ${row.file}`);expected.set(row.file,row.after);}
}
for(const [file,sha256]of expected)assert.equal(hash(file),sha256,`Changed integrated file: ${file}`);
const preserved=[],changed=[];
for(const row of previous.snapshots){
 assert.equal(hash(path.join(previous.archive,row.file)),row.sha256,`Changed immutable archive: ${row.file}`);
 if(!/^(src|tests|backend|vendor)\//.test(row.file)&&!['package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs'].includes(row.file))continue;
 assert.ok(fs.existsSync(row.file),row.file);const current=hash(row.file);
 if(current===row.sha256)preserved.push(row);else{assert.ok(expected.has(row.file),`Unexplained source change: ${row.file}`);changed.push({file:row.file,before:row.sha256,after:current});}
}
for(const file of ['src/core/dxf.ts','src/core/cpPathOptimizer.ts','src/core/cpProcessingExport.ts'])assert.ok(preserved.some(row=>row.file===file),file);
const auditBase='output/parallel/woven-old-independent-audit-1010';
const audit=JSON.parse(fs.readFileSync(auditBase+'/audit-frozen-final.json','utf8'));
assert.equal(audit.independentLiteralChecks,50);assert.equal(audit.rawAndCPGuards,64);assert.equal(audit.fullDefaultResponseCases,38);
for(const row of audit.files)assert.equal(hash(auditBase+'/'+row.file),row.sha256,row.file);
for(const [file,sha256]of Object.entries(audit.sourceFiles))assert.equal(hash(file),sha256,file);
const output='output/original-helpers-preservation-1010.json';assert.ok(!fs.existsSync(output));
fs.writeFileSync(output,JSON.stringify({verified:true,previousManifest:previousFile,previousArchiveFilesVerified:previous.snapshots.length,integrationReports,preserved,changed,ordinaryAndOptimizedDXFPreserved:true,independentOldLiteralChecks:50,independentOldGuardChecks:64,independentOldDefaultCases:38,completeOrigamicaGoal:false},null,2),{flag:'wx'});
console.log(`Verified ${previous.snapshots.length} immutable artifacts; ${preserved.length} unchanged inputs, ${changed.length} explained changes; 50/64/38 Old independent checks match integrated hashes; DXF cores preserved.`);
