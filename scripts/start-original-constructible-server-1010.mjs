import fs from 'node:fs';
import assert from 'node:assert/strict';
assert.equal(process.env.ZHEZHI_PORT,'8864');
assert.equal(process.env.ZHEZHI_DATA_DIR,'output/original-constructible-server-1010');
fs.writeFileSync('output/original-constructible-server-pid-1010.json',JSON.stringify({
 pid:process.pid,port:8864,startedAt:new Date().toISOString(),cwd:process.cwd(),
 freshWorkerAfterFinalConstructibleIntegrations:true,
},null,2),{flag:'wx'});
await import('../server.mjs');
