import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const root = process.cwd();
const indexes = [
  ['output/parallel/original-reflection-neighbor-source-gap-1011', 'SOURCE-CONTRACT-FROZEN.json', 19],
  ['output/parallel/original-reflection-neighbor-source-gap-1011/supplement-001', 'SUPPLEMENT-FROZEN.json', 9],
  ['output/parallel/original-cone-four-plane-independent-review-1011', 'SOURCE-PHASE-FROZEN.json', 30],
  ['output/parallel/original-cone-four-plane-native-zero-domain-1011', 'freeze.json', 1],
];
const verifiedIndexes = [];
for (const [base, name, count] of indexes) {
  const file = `${base}/${name}`;
  const frozen = json(file);
  assert.equal(frozen.files.length, count);
  for (const row of frozen.files) {
    const current = path.resolve(base, row.file ?? row.path);
    assert.ok(current.startsWith(root + path.sep));
    assert.equal(sha(current), row.sha256, current);
  }
  verifiedIndexes.push({ base, index: name, files: count, sha256: sha(file) });
}
assert.equal(sha('tmp/Origamica-15.0-reference.nb'), '19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9');
const previous = json('output/audits/original-planar-ruled-final-1011.json');
for (const [file, value] of Object.entries(previous.preservation.lastSourceHashes)) assert.equal(sha(file), value, file);
const zero = json('output/parallel/original-cone-four-plane-native-zero-domain-1011/native-zero-domain-readback.json');
assert.equal(zero.verified, true);
assert.equal(zero.checks, 127);
assert.equal(zero.query.transverseStart, 0);
assert.equal(zero.query.composeReflections, true);
assert.ok(zero.maximumLiteralCutError <= 1e-13);
assert.equal(zero.response.source.normalNormalized, false);
assert.equal(zero.response.source.interpolationReproduced, false);
assert.equal(zero.response.source.symbolicOptionsReproduced, false);
for (const field of ['cutOrderVerified', 'globalInjectivityChecked', 'selfCollisionChecked', 'exactStraightCreaseFOLD', 'adoptableCreasePattern']) assert.equal(zero.response.certification[field], false);
const output = 'output/original-cone-four-plane-source-phase-verified-1011.json';
assert.ok(!fs.existsSync(output));
fs.writeFileSync(output, JSON.stringify({
  verified: true, verifiedAt: new Date().toISOString(),
  scope: 'Original source/style/literal numerical contract and original zero transverse domain only; new CP implementation and actual main UI remain to be verified.',
  indexes: verifiedIndexes, protectedFilesVerified: 59,
  originalNotebookSHA: sha('tmp/Origamica-15.0-reference.nb'),
  literalNativeZeroDomainChecks: 127, originalNativeCertificationUnaltered: true,
  sourceProductionBaselineStillP58: true,
  newCPImplementationVerified: false, actualMainUIVerified: false,
  completeOrigamicaGoal: false, packed: false, machineVerified: false,
}, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ verified: true, sourceEvidenceFiles: 59, nativeZeroDomainChecks: 127, implementationClaimed: false }));
