import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
assert.equal(process.env.ZHEZHI_PORT,'8886');assert.equal(path.resolve(process.env.ZHEZHI_DATA_DIR??''),path.resolve('output/path-array-main-server-1012'));
const index=JSON.parse(fs.readFileSync('output/parallel/path-array-main-root-1012/ROOT-SOURCE-FROZEN.json','utf8'));
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
assert.equal(index.verified,true);for(const r of index.files)assert.equal(hash(r.path),r.sha256,r.path);
for(const r of index.compiledBundleCopies)assert.equal(hash(r.path),r.sha256,r.path);
process.env.PYTHONDONTWRITEBYTECODE='1';process.env.OPENBLAS_NUM_THREADS='1';process.env.OMP_NUM_THREADS='1';
fs.writeFileSync('output/path-array-main-pid-1012.json',JSON.stringify({pid:process.pid,port:8886,cwd:process.cwd(),data:process.env.ZHEZHI_DATA_DIR,startedAt:new Date().toISOString(),verifiedSourceFiles:index.files.length,bundle:index.bundle},null,2),{flag:'wx'});
await import('../server.mjs');
