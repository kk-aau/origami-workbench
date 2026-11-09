import fs from 'node:fs';
import assert from 'node:assert/strict';
// Reuse the existing independent file verifiers and preserve their frozen
// reports byte for byte. Fresh results belong to this batch's own artifacts.
for(const name of ['material-curves','material-curves-across','material-open-curves']){
 const original=`output/audits/${name}-download-1009.json`,saved=fs.readFileSync(original);
 try{
  await import(`./verify-${name}-download-1009.ts`);
  const fresh=fs.readFileSync(original);assert.equal(JSON.parse(fresh.toString()).verified,true);
  fs.writeFileSync(`output/audits/material-weak-cp-regression-${name}-download-1009.json`,fresh);
 }finally{fs.writeFileSync(original,saved);}
 assert.deepEqual(fs.readFileSync(original),saved);
}
console.log('Reused three independent export verifiers; preserved all previous audit reports exactly.');
