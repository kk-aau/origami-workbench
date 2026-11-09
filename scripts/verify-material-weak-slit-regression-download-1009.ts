import fs from 'node:fs';
import assert from 'node:assert/strict';
for(const name of ['material-weak-cp','material-curves','material-curves-across','material-open-curves']){
 const report=`output/audits/${name}-download-1009.json`,saved=fs.readFileSync(report);
 try{await import(`./verify-${name}-download-1009.ts`);const fresh=fs.readFileSync(report);assert.equal(JSON.parse(fresh.toString()).verified,true);fs.writeFileSync(`output/audits/material-weak-slit-regression-${name}-download-1009.json`,fresh);}finally{fs.writeFileSync(report,saved);}
 assert.deepEqual(fs.readFileSync(report),saved);
}
console.log('Verified 31 previous actual export groups with original independent verifiers; previous reports preserved byte for byte.');
