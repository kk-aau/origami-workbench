import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
assert.equal(process.env.ZHEZHI_PORT,'8870');
assert.equal(path.resolve(process.env.ZHEZHI_DATA_DIR??''),path.resolve('output/original-planar-ruled-main-server-1011'));
const files=new Map();
for(const name of ['original-planar-ruled-cp-4040','original-planar-ruled-root-wiring','original-conic-noncircle-compact-ux']){
 const record=JSON.parse(fs.readFileSync('output/parallel/'+name+'-integrated-1010.json','utf8'));assert.equal(record.verified,true);
 for(const row of record.files)files.set(row.file,row.after);
}
for(const [file,sha]of files)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),sha,file);
assert.ok(fs.existsSync('dist/index.html'));
process.env.PYTHONDONTWRITEBYTECODE='1';process.env.OPENBLAS_NUM_THREADS='1';process.env.OMP_NUM_THREADS='1';
fs.writeFileSync('output/original-planar-ruled-server-pid-1011.json',JSON.stringify({pid:process.pid,port:8870,startedAt:new Date().toISOString(),cwd:process.cwd(),data:process.env.ZHEZHI_DATA_DIR,allIntegratedSourceHashesVerified:true,targets:files.size},null,2),{flag:'wx'});
await import('../server.mjs');
