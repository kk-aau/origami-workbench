import fs from 'node:fs';
import assert from 'node:assert/strict';
assert.equal(process.env.ZHEZHI_PORT,'8860');assert.equal(process.env.ZHEZHI_DATA_DIR,'output/original-helpers-server-1010');
fs.writeFileSync('output/original-helpers-server-pid-1010.json',JSON.stringify({pid:process.pid,port:8860,startedAt:new Date().toISOString(),cwd:process.cwd()},null,2));
await import('../server.mjs');
