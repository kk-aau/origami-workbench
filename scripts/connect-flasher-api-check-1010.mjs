import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const target='package.json',hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const previous=JSON.parse(fs.readFileSync('output/audits/original-live-construct-final-1010.json','utf8'));
const before=fs.readFileSync(target),beforeSha=hash(before);
assert.equal(beforeSha,previous.snapshots.find(row=>row.file===target).sha256);
const old='node --test tests/server.test.mjs tests/tess-worker.test.mjs';
const text=before.toString('utf8');assert.equal(text.split(old).length,2);
assert.ok(fs.existsSync('tests/flasher-input-contract-api.test.mjs'));
const after=Buffer.from(text.replace(old,old+' tests/flasher-input-contract-api.test.mjs'),'utf8');
const folder='output/parallel/integration-test-entry-1010-before';
assert.ok(!fs.existsSync(folder));fs.mkdirSync(folder,{recursive:true});
fs.writeFileSync(folder+'/package.json',before,{flag:'wx'});
fs.writeFileSync(target,after);
assert.equal(hash(fs.readFileSync(target)),hash(after));
fs.writeFileSync('output/parallel/test-entry-integrated-1010.json',JSON.stringify({
  verified:true,integrationMethod:'root exact test command addition; captured P52 hash checked',
  files:[{file:target,before:beforeSha,after:hash(after),capturedBaseline:beforeSha,alreadyIntegratedExact:false}],
},null,2),{flag:'wx'});
console.log('Connected real HTTP input-contract regression to the existing test:server and npm test commands.');
