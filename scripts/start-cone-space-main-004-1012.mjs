import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
assert.equal(process.env.ZHEZHI_PORT,'8887');assert.equal(process.env.ZHEZHI_DATA_DIR,"D:/codex/折纸工具/workbench/output/cone-space-main-server-004-1012");
const binding=JSON.parse(fs.readFileSync("D:/codex/折纸工具/workbench/output/parallel/cone-space-main-root-004-1012/binding.json",'utf8')),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
assert.equal(hash(binding.frozenServer),binding.frozenServerSHA256);assert.equal(hash(binding.originalServerPath),binding.originalServerSHA256);
for(const r of binding.staticFiles)assert.equal(hash(r.copy),r.sha256);for(const r of binding.sourceSnapshots)assert.equal(hash(r.snapshot),r.sha256);
process.env.PYTHONDONTWRITEBYTECODE='1';process.env.OPENBLAS_NUM_THREADS='1';process.env.OMP_NUM_THREADS='1';
fs.writeFileSync('output/cone-space-main-pid-004-1012.json',JSON.stringify({pid:process.pid,port:8887,cwd:process.cwd(),data:process.env.ZHEZHI_DATA_DIR,startedAt:new Date().toISOString(),staticRoot:binding.compiledRoot,bindingSHA256:hash("D:/codex/折纸工具/workbench/output/parallel/cone-space-main-root-004-1012/binding.json")},null,2),{flag:'wx'});
await import("file:///D:/codex/%E6%8A%98%E7%BA%B8%E5%B7%A5%E5%85%B7/workbench/output/parallel/cone-space-main-root-004-1012/server.mjs");
