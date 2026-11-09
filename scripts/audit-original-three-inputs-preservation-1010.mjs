import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const previous=JSON.parse(fs.readFileSync('output/audits/original-extended-function-batch-final-1010.json','utf8'));
const integrationReports=['original-recover-ndsolve','original-woven-area','original-huffman-circle4-direct'].map(name=>`output/parallel/${name}-integrated-1010.json`);
const reports=integrationReports.map(file=>JSON.parse(fs.readFileSync(file,'utf8')));for(const report of reports)assert.equal(report.verified,true);
const allowed=new Set(reports.flatMap(report=>report.files.map(file=>file.file))),preserved=[],changed=[];
for(const row of previous.snapshots){
 assert.equal(hash(path.join(previous.archive,row.file)),row.sha256,`Changed frozen artifact: ${row.file}`);
 if(!/^(src|tests|backend|vendor)\//.test(row.file)&&!['package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs'].includes(row.file))continue;
 assert.ok(fs.existsSync(row.file),row.file);const current=hash(row.file);
 if(current===row.sha256)preserved.push(row);else{assert.ok(allowed.has(row.file),`Unexplained change: ${row.file}`);changed.push({file:row.file,before:row.sha256,after:current});}
}
for(const file of ['src/core/dxf.ts','src/core/cpPathOptimizer.ts','src/core/cpProcessingExport.ts'])assert.ok(preserved.some(row=>row.file===file),file);
fs.writeFileSync('output/original-three-inputs-preservation-1010.json',JSON.stringify({verified:true,previousManifest:'output/audits/original-extended-function-batch-final-1010.json',previousArchiveFilesVerified:previous.snapshots.length,integrationReports,preserved,changed,ordinaryAndOptimizedDXFPreserved:true,completeOrigamicaGoal:false},null,2));
console.log(`Verified ${previous.snapshots.length} old frozen artifacts; ${preserved.length} unchanged files, ${changed.length} explained changes; DXF preserved.`);
