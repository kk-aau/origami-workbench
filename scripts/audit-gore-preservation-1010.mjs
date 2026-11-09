import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const previous=JSON.parse(fs.readFileSync('output/audits/parallel-material-final-1010.json','utf8'));
const integration=JSON.parse(fs.readFileSync('output/parallel/original-gore-integrated-1010.json','utf8'));assert.equal(integration.verified,true);
const allowed=new Set([...integration.files.map(r=>r.file),'src/components/MaterialCurveDialog.tsx','tests/app/tessellation.test.ts','tests/app/tessellationPaperFitParams.test.ts']);
const preserved=[],changed=[];
for(const row of previous.snapshots){assert.equal(hash(path.join(previous.archive,row.file)),row.sha256);if(!/^(src|tests|backend|vendor)\//.test(row.file)&&!['package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs'].includes(row.file))continue;const current=hash(row.file);if(current!==row.sha256){assert.ok(allowed.has(row.file),row.file);changed.push({file:row.file,before:row.sha256,after:current});}else preserved.push(row);}
const report={verified:true,previousManifest:'output/audits/parallel-material-final-1010.json',previousArchiveFilesVerified:previous.snapshots.length,preserved,changed,ordinaryAndOptimizedDXFPreserved:preserved.some(r=>r.file==='src/core/dxf.ts')&&preserved.some(r=>r.file==='src/core/cpPathOptimizer.ts'),completeOrigamicaGoal:false};fs.writeFileSync('output/original-gore-preservation-1010.json',JSON.stringify(report,null,2));console.log(`Verified ${previous.snapshots.length} immutable artifacts; ${preserved.length} unchanged source/test/vendor/config files; ${changed.length} explained changes.`);
