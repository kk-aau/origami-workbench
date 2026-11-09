import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
assert.equal(process.env.ZHEZHI_PORT,'8886');assert.equal(process.env.ZHEZHI_DATA_DIR,'D:/codex/折纸工具/workbench/output/tube-strip-main-server-002-1012');
const binding=JSON.parse(fs.readFileSync('output/parallel/tube-strip-runtime-002-1012/binding.json','utf8')),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
assert.equal(hash(binding.frozenServer),binding.frozenServerSHA256);assert.equal(hash('server.mjs'),binding.originalServerSHA256);
for(const r of binding.staticFiles)assert.equal(hash(r.copy),r.sha256);for(const r of binding.sourceSnapshots)assert.equal(hash(r.snapshot),r.sha256);
process.env.PYTHONDONTWRITEBYTECODE='1';process.env.OPENBLAS_NUM_THREADS='1';process.env.OMP_NUM_THREADS='1';
fs.writeFileSync('output/tube-strip-main-pid-002-1012.json',JSON.stringify({pid:process.pid,port:8886,cwd:process.cwd(),data:process.env.ZHEZHI_DATA_DIR,startedAt:new Date().toISOString(),staticRoot:binding.compiledRoot,bindingSHA256:hash('output/parallel/tube-strip-runtime-002-1012/binding.json')},null,2),{flag:'wx'});
await import('../output/parallel/tube-strip-runtime-002-1012/server.mjs');
