import fs from 'node:fs';
import assert from 'node:assert/strict';
assert.equal(process.env.ZHEZHI_PORT,'8863');
assert.equal(process.env.ZHEZHI_DATA_DIR,'output/original-min-budget-server-1010');
fs.writeFileSync('output/original-min-budget-server-pid-1010.json',JSON.stringify({
  pid:process.pid,port:8863,startedAt:new Date().toISOString(),cwd:process.cwd(),
  freshWorkerAfterBothProductionIntegrations:true,
},null,2),{flag:'wx'});
await import('../server.mjs');
