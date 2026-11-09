import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const root = process.cwd();
const producer = 'output/parallel/original-planar-ruled-main-auditor-fix-1011';
const frozen = json(`${producer}/freeze.json`);
assert.equal(frozen.files.length, 16);
for (const row of frozen.files) {
  const file = path.resolve(producer, row.file ?? row.path);
  assert.ok(file.startsWith(root + path.sep), file);
  assert.equal(sha(file), row.sha256, file);
}
const manifest = json(`${producer}/manifest.json`);
assert.equal(manifest.productionWrites, false);
assert.equal(manifest.actualUserFilesUnchanged, true);
assert.equal(manifest.actualUserDownloads, 31);
assert.equal(manifest.singleEdgeUISelectionProven, false);
for (const row of manifest.sourceSnapshot) assert.equal(sha(row.path), row.sha256, row.path);

const ui = json('output/playwright/original-planar-ruled-main-1011/browser-checks.json');
const py = json(`${producer}/actual-python-audit.json`);
const core = json(`${producer}/actual-core-audit.json`);
const bundle = json('output/original-planar-ruled-bundle-verified-1011.json');
assert.equal(ui.verified, true);
assert.deepEqual(ui.errors, []);
assert.equal(ui.passed, 88);
assert.equal(ui.downloads.length, 31);
assert.equal(py.verified, true);
assert.deepEqual(py.failures, []);
assert.equal(py.passed, 11291);
assert.equal(py.actualUserDownloadsAudited, 31);
assert.equal(py.files.length, 31);
assert.equal(py.actualHandMCount, 2);
assert.equal(py.singleEdgeUISelectionProven, false);
assert.deepEqual(py.actualHandChanges.map(row => [row.edgeIndex, row.id, row.afterAssignment, row.afterAngle]), [
  [36, 'in4040-curve-1-12', 'M', -180],
  [37, 'in4040-curve-1-13', 'M', -180],
]);
assert.equal(core.verified, true);
assert.deepEqual(core.errors, []);
assert.equal(core.passed, 340);
assert.equal(core.actualCoreReopens, 23);
assert.equal(core.processing.length, 2);
assert.equal(core.sourceFilesSHAUnchanged, true);
assert.equal(bundle.verified, true);
for (const report of [ui, py, core]) assert.equal(report.bundle, bundle.bundle);
const actualPaths = new Set(ui.downloads.map(row => path.resolve(row.path)));
assert.equal(actualPaths.size, 31);
for (const row of py.files) {
  assert.ok(actualPaths.has(path.resolve(row.path)), row.path);
  assert.equal(sha(row.path), row.sha256, row.path);
}
for (const row of core.files) {
  assert.ok(actualPaths.has(path.resolve(row.path)), row.path);
  assert.equal(sha(row.path), row.sha256, row.path);
}
for (const prior of manifest.priorFreezes) {
  assert.equal(sha(prior.path), prior.sha256, prior.path);
  const rows = json(prior.path).files;
  assert.equal(rows.length, prior.files);
  for (const row of rows) {
    const file = path.resolve(path.dirname(prior.path), row.file ?? row.path);
    assert.equal(sha(file), row.sha256, file);
  }
}
const output = 'output/original-planar-ruled-readback-verified-1011.json';
assert.ok(!fs.existsSync(output));
fs.writeFileSync(output, JSON.stringify({
  verified: true,
  verifiedAt: new Date().toISOString(),
  bundle: bundle.bundle,
  mainAppChecks: ui.passed,
  actualUserDownloads: 31,
  independentPythonChecks: py.passed,
  coreChecks: core.passed,
  actualCoreReopens: 23,
  actualOptimizedLINEReadbacks: 2,
  all31UserFileSHAUnchanged: true,
  actualHandMCount: 2,
  singleEdgeUISelectionProven: false,
  actualHandChanges: py.actualHandChanges,
  auditorFixFilesVerified: 16,
  manifest: `${producer}/manifest.json`,
  manifestSHA: sha(`${producer}/manifest.json`),
  freeze: `${producer}/freeze.json`,
  freezeSHA: sha(`${producer}/freeze.json`),
  oldPrepared11AndSource85Unchanged: true,
  productionWrittenForAudit: false,
  completeOrigamicaGoal: false,
  physicalImportVerified: false,
  machineTrialVerified: false,
}, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ verified: true, mainApp: 88, actualFiles: 31, python: 11291, core: 340, actualHandMCount: 2 }));
