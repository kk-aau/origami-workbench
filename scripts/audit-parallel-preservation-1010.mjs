import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const previous=JSON.parse(fs.readFileSync('output/audits/material-reference-model-final-1010.json','utf8'));
const allowed=new Set([
 'src/App.tsx','src/app/editorCommit.ts','src/components/MaterialCurveModelDialog.tsx','src/components/MaterialPieceSelector.tsx','src/components/materialCutDialog.css','src/core/materialCurveModel.ts','src/core/materialFaceCommon.ts','src/core/materialFaceEdit.ts','src/core/formats.ts',
 'tests/core/materialClipboardModel.test.ts','tests/core/materialNetworkModel.test.ts','tests/core/materialTopologyModel.test.ts','tests/core/materialTraceModel.test.ts','backend/test_tessellation_woven_graph.py',
]);
for(const file of ['high-even-integrated-1010','continuous-sources-integrated-1010','curve-holes-integrated-1010','flasher-r4-integrated-1010','continuous-nodes-integrated-1010','straight-mother-integrated-1010']){
 const report=JSON.parse(fs.readFileSync(`output/parallel/${file}.json`,'utf8'));assert.equal(report.verified,true);for(const row of report.files)allowed.add(row.file);
}
const preserved=[],changed=[],archiveVerified=[];
for(const row of previous.snapshots){
 assert.equal(hash(path.join(previous.archive,row.file)),row.sha256,`Frozen artifact changed: ${row.file}`);archiveVerified.push(row.file);
 if(!/^(src|tests|backend|vendor)\//.test(row.file)&&!['package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs'].includes(row.file))continue;
 const current=hash(row.file);if(current!==row.sha256){assert.ok(allowed.has(row.file),`Unexplained source change: ${row.file}`);changed.push({file:row.file,before:row.sha256,after:current});}else preserved.push(row);
}
const report={verified:true,previousManifest:'output/audits/material-reference-model-final-1010.json',verifiedAt:new Date().toISOString(),archivedArtifactsVerified:archiveVerified.length,preservedSourceTestVendorConfigCount:preserved.length,preserved,changed,ordinaryAndOptimizedDXFPreserved:preserved.some(r=>r.file==='src/core/dxf.ts')&&preserved.some(r=>r.file.includes('cpPathOptimizer')),completeOrigamicaGoal:false};
fs.writeFileSync('output/parallel-preservation-audit-1010.json',JSON.stringify(report,null,2));console.log(`Verified ${archiveVerified.length} frozen artifacts; ${preserved.length} unchanged source/test/vendor/config files; ${changed.length} explained changes.`);
