import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const previousFile='output/audits/original-linked-first3d-final-1010.json';
const previous=JSON.parse(fs.readFileSync(previousFile,'utf8'));
const integrationReports=['original-circle4-entry-label','original-woven-cell-hole-area','original-huffman-parabola-direct','original-parabola-entry-label','original-rectangular-repeat-panels'].map(name=>`output/parallel/${name}-integrated-1010.json`);
const reports=integrationReports.map(file=>JSON.parse(fs.readFileSync(file,'utf8'))),expected=new Map();
for(const report of reports){assert.equal(report.verified,true);for(const row of report.files)expected.set(row.file,row.after);}
for(const [file,after] of expected)assert.equal(hash(file),after,`Changed delivered file after integration: ${file}`);
const preserved=[],changed=[];
for(const row of previous.snapshots){
 assert.equal(hash(path.join(previous.archive,row.file)),row.sha256,`Changed frozen artifact: ${row.file}`);
 if(!/^(src|tests|backend|vendor)\//.test(row.file)&&!['package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs'].includes(row.file))continue;
 assert.ok(fs.existsSync(row.file),row.file);const current=hash(row.file);
 if(current===row.sha256)preserved.push(row);else{assert.ok(expected.has(row.file),`Unexplained change: ${row.file}`);changed.push({file:row.file,before:row.sha256,after:current});}
}
for(const file of ['src/core/dxf.ts','src/core/cpPathOptimizer.ts','src/core/cpProcessingExport.ts'])assert.ok(preserved.some(row=>row.file===file),file);
fs.writeFileSync('output/original-parameter-construct-preservation-1010.json',JSON.stringify({verified:true,previousManifest:previousFile,previousArchiveFilesVerified:previous.snapshots.length,integrationReports,preserved,changed,ordinaryAndOptimizedDXFPreserved:true,completeOrigamicaGoal:false},null,2));
console.log(`Verified ${previous.snapshots.length} old frozen artifacts; ${preserved.length} unchanged files, ${changed.length} explained changes; all latest delivery hashes match; DXF preserved.`);
