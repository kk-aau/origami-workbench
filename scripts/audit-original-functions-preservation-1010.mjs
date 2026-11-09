import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const previous=JSON.parse(fs.readFileSync('output/audits/parallel-material-final-1010.json','utf8'));
const names=['original-gore','original-resample','original-vertex','original-pleat','original-planar','original-curve-systems','original-halfplane'];
const integrations=names.map(n=>JSON.parse(fs.readFileSync(`output/parallel/${n}-integrated-1010.json`,'utf8')));for(const item of integrations)assert.equal(item.verified,true);
const allowed=new Set([...integrations.flatMap(r=>r.files.map(f=>f.file)),
 'src/app/api.ts','tests/app/apiWhenIdle.test.ts','src/components/MaterialCurveDialog.tsx','tests/app/tessellation.test.ts','tests/app/tessellationPaperFitParams.test.ts']);
const preserved=[],changed=[];
for(const row of previous.snapshots){
 assert.equal(hash(path.join(previous.archive,row.file)),row.sha256,`Immutable prior artifact ${row.file}`);
 if(!/^(src|tests|backend|vendor)\//.test(row.file)&&!['package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs'].includes(row.file))continue;
 const current=hash(row.file);if(current===row.sha256)preserved.push(row);else{assert.ok(allowed.has(row.file),`Unexplained production change ${row.file}`);changed.push({file:row.file,before:row.sha256,after:current});}
}
for(const file of ['src/core/dxf.ts','src/core/cpPathOptimizer.ts','src/core/cpProcessingExport.ts'])assert.ok(preserved.some(r=>r.file===file),file);
const report={verified:true,previousManifest:'output/audits/parallel-material-final-1010.json',previousArchiveFilesVerified:previous.snapshots.length,preserved,changed,ordinaryAndOptimizedDXFPreserved:true,completeOrigamicaGoal:false};
fs.writeFileSync('output/original-functions-preservation-1010.json',JSON.stringify(report,null,2));
console.log(`Verified ${previous.snapshots.length} immutable artifacts; ${preserved.length} unchanged production/test/config files, ${changed.length} explained changes.`);
