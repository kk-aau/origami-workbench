import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const target='package.json',hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const previous=JSON.parse(fs.readFileSync('output/audits/original-topology-factors-final-1010.json','utf8'));
const before=fs.readFileSync(target),beforeSha=hash(before);
assert.equal(beforeSha,previous.snapshots.find(row=>row.file===target).sha256);
const old='tsx --test tests/core/*.test.ts tests/app/*.test.ts tests/simulator.test.ts';
const text=before.toString('utf8');assert.equal(text.split(old).length,2);
const after=Buffer.from(text.replace(old,old.replace('tsx --test','tsx --test --test-concurrency=4')),'utf8');
const backup='output/parallel/integration-unit-concurrency-1010-before';
assert.ok(!fs.existsSync(backup));fs.mkdirSync(backup,{recursive:true});
fs.writeFileSync(backup+'/package.json',before,{flag:'wx'});fs.writeFileSync(target,after);
assert.equal(hash(fs.readFileSync(target)),hash(after));
fs.writeFileSync('output/parallel/unit-concurrency-integrated-1010.json',JSON.stringify({
  verified:true,integrationMethod:'same complete unit corpus; bounded Node test process concurrency',
  files:[{file:target,before:beforeSha,after:hash(after),capturedBaseline:beforeSha,alreadyIntegratedExact:false}],
  initialFailure:'output/original-topology-factors-checks-min-budget-1010.log',
  nativeExitCode:3221225477,nativeExitHex:'0xC0000005',
  isolatedRerun:{file:'tests/app/wovenGraphSource.test.ts',testsPassed:4,exitCode:0},
  rootCauseConfirmed:false,productionGeometryChangedByThisRecord:false,
},null,2),{flag:'wx'});
console.log('Bounded test process concurrency at four; complete test corpus and assertions unchanged.');
