import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const previous=JSON.parse(fs.readFileSync('output/audits/original-function-batch-final-1010.json','utf8'));
const names=['original-resample-higher','original-system-graphics','original-ring-index','original-frenet-plot','original-independent-systems','original-woven-recovery','original-curve2-styled','original-ndsolve-step'];
const integrationReports=names.map(name=>`output/parallel/${name}-integrated-1010.json`);
if(fs.existsSync('output/parallel/original-ring-angle-if-integrated-1010.json'))integrationReports.push('output/parallel/original-ring-angle-if-integrated-1010.json');
const integrations=integrationReports.map(file=>JSON.parse(fs.readFileSync(file,'utf8')));
for(const report of integrations)assert.equal(report.verified,true);
const allowed=new Set(integrations.flatMap(report=>report.files.map(file=>file.file)));
const ringCount=JSON.parse(fs.readFileSync('output/original-ring-count-source-fix-1010.json','utf8'));allowed.add(ringCount.file);
const preserved=[],changed=[];
for(const row of previous.snapshots){
  assert.equal(hash(path.join(previous.archive,row.file)),row.sha256,`Changed frozen artifact: ${row.file}`);
  if(!/^(src|tests|backend|vendor)\//.test(row.file)&&!['package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs'].includes(row.file))continue;
  assert.ok(fs.existsSync(row.file),`Removed existing file: ${row.file}`);
  const current=hash(row.file);
  if(current===row.sha256)preserved.push(row);
  else{assert.ok(allowed.has(row.file),`Unexplained production change: ${row.file}`);changed.push({file:row.file,before:row.sha256,after:current});}
}
for(const file of ['src/core/dxf.ts','src/core/cpPathOptimizer.ts','src/core/cpProcessingExport.ts'])assert.ok(preserved.some(row=>row.file===file),file);
const report={verified:true,previousManifest:'output/audits/original-function-batch-final-1010.json',previousArchiveFilesVerified:previous.snapshots.length,integrationReports,preserved,changed,ordinaryAndOptimizedDXFPreserved:true,completeOrigamicaGoal:false};
fs.writeFileSync('output/original-extended-functions-preservation-1010.json',JSON.stringify(report,null,2));
console.log(`Verified ${previous.snapshots.length} frozen artifacts; ${preserved.length} unchanged files; ${changed.length} explained changes. Ordinary and optimized DXF preserved.`);
