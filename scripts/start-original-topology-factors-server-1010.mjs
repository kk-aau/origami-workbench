import fs from 'node:fs';
import assert from 'node:assert/strict';
assert.equal(process.env.ZHEZHI_PORT, '8862');
assert.equal(process.env.ZHEZHI_DATA_DIR, 'output/original-topology-factors-server-1010');
fs.writeFileSync('output/original-topology-factors-server-pid-1010.json', JSON.stringify({
  pid:process.pid, port:8862, startedAt:new Date().toISOString(), cwd:process.cwd(),
}, null, 2), {flag:'wx'});
await import('../server.mjs');
