import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const previousFile='output/audits/original-helpers-final-1010.json',previous=JSON.parse(fs.readFileSync(previousFile,'utf8'));
const integrationReports=['original-unsafe-twist-range','original-ring-log-early-adoption','original-ring-log','original-courteous-anarchy','original-paraboloidal-x'].map(name=>`output/parallel/${name}-integrated-1010.json`);
const expected=new Map();
for(const file of integrationReports){const report=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(report.verified,true);for(const row of report.files){if(expected.has(row.file))assert.equal(row.before,expected.get(row.file),`Unexplained intermediate change: ${row.file}`);expected.set(row.file,row.after);}}
for(const [file,sha256]of expected)assert.equal(hash(file),sha256,`Changed integrated target: ${file}`);
const preserved=[],changed=[];
for(const row of previous.snapshots){
 assert.equal(hash(path.join(previous.archive,row.file)),row.sha256,`Changed immutable archive: ${row.file}`);
 if(!/^(src|tests|backend|vendor)\//.test(row.file)&&!['package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs'].includes(row.file))continue;
 assert.ok(fs.existsSync(row.file),row.file);const current=hash(row.file);
 if(current===row.sha256)preserved.push(row);else{assert.ok(expected.has(row.file),`Unexplained current source change: ${row.file}`);changed.push({file:row.file,before:row.sha256,after:current});}
}
for(const file of ['src/core/dxf.ts','src/core/cpPathOptimizer.ts','src/core/cpProcessingExport.ts'])assert.ok(preserved.some(row=>row.file===file),file);
const intervalFile='output/original-ring-log-independent-interval-alias-1010.json',interval=JSON.parse(fs.readFileSync(intervalFile,'utf8'));
assert.equal(interval.verified,true);assert.equal(interval.independentValueAndDerivativeChecks,16900);assert.equal(hash('backend/tessellation_ring_log_interval.py'),interval.sourceSha256);
const output='output/original-live-construct-preservation-1010.json';assert.ok(!fs.existsSync(output));
fs.writeFileSync(output,JSON.stringify({verified:true,previousManifest:previousFile,previousArchiveFilesVerified:previous.snapshots.length,integrationReports,preserved,changed,ordinaryAndOptimizedDXFPreserved:true,independentRingIntervalEvidence:intervalFile,independentRingValueAndDerivativeChecks:16900,completeOrigamicaGoal:false},null,2),{flag:'wx'});
console.log(`Verified ${previous.snapshots.length} immutable artifacts; ${preserved.length} unchanged inputs, ${changed.length} explained changes; exact final Log helper matches 16900 independent checks; DXF preserved.`);
