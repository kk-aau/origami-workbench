import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
assert.equal(process.env.ZHEZHI_PORT,'8875');
assert.equal(path.resolve(process.env.ZHEZHI_DATA_DIR??''),path.resolve('output/original-spiral-refold-main-server-1011'));
const files=new Map();
for(const name of ["original-spiral-refold-cp-3980", "original-spiral-refold-root-wiring"]){
 const record=JSON.parse(fs.readFileSync('output/parallel/'+name+'-integrated-1010.json','utf8'));assert.equal(record.verified,true);
 for(const row of record.files)files.set(row.file,row.after);
}
for(const [file,sha]of files)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),sha,file);
assert.ok(fs.existsSync('dist/index.html'));
process.env.PYTHONDONTWRITEBYTECODE='1';process.env.OPENBLAS_NUM_THREADS='1';process.env.OMP_NUM_THREADS='1';
fs.writeFileSync('output/original-spiral-refold-server-pid-1011.json',JSON.stringify({pid:process.pid,port:8875,startedAt:new Date().toISOString(),cwd:process.cwd(),data:process.env.ZHEZHI_DATA_DIR,allIntegratedSourceHashesVerified:true,targets:files.size},null,2),{flag:'wx'});
await import('../server.mjs');
