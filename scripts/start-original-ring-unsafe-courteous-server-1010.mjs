import fs from 'node:fs';
import assert from 'node:assert/strict';
assert.equal(process.env.ZHEZHI_PORT,'8861');
assert.equal(process.env.ZHEZHI_DATA_DIR,'output/original-ring-unsafe-courteous-server-1010');
fs.writeFileSync('output/original-ring-unsafe-courteous-server-pid-1010.json',JSON.stringify({pid:process.pid,port:8861,startedAt:new Date().toISOString(),cwd:process.cwd()},null,2));
await import('../server.mjs');
