import fs from 'node:fs';
import assert from 'node:assert/strict';
assert.equal(process.env.ZHEZHI_PORT,'8865');
assert.equal(process.env.ZHEZHI_DATA_DIR,'output/original-finite-n-conic-server-1011');
fs.writeFileSync('output/original-finite-npoints-server-pid-1011.json',JSON.stringify({pid:process.pid,port:8865,startedAt:new Date().toISOString(),cwd:process.cwd(),freshWorkerAfterFiniteNIntegration:true},null,2),{flag:'wx'});
await import('../server.mjs');
