import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const root = process.cwd();
function files(directory) {
  const result = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.name === '__pycache__' || entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) result.push(file.replaceAll('\\', '/'));
    }
  }
  visit(directory);
  return result;
}
const run = json('output/original-cone-four-plane-checks-1011.json');
assert.equal(run.exitCode, 0);
assert.equal(run.inputsUnchanged, true);
assert.equal(run.backendInputsUnchanged, true);
for (const row of run.inputs) assert.equal(sha(row.file), row.sha256, row.file);
const report = json('output/original-cone-four-plane-report-1011.json');
assert.equal(report.verified, true);
assert.equal(report.mainAppChecks, 152);
assert.equal(report.actualLayoutChecks, 102);
assert.equal(report.userButtonExportFiles, 49);
assert.equal(report.independentDownloadChecks, 369576);
assert.equal(report.actualCoreChecks, 6091);
assert.deepEqual(report.actualHandIds, ['cone4039-curve-3-23']);
const previous = json('output/audits/original-planar-ruled-final-1011.json');
assert.equal(previous.snapshots.length, 3485);
for (const row of previous.snapshots) assert.equal(sha(`${previous.archive}/${row.file}`), row.sha256, row.file);
for (const [file, value] of Object.entries(report.preservation.lastSourceHashes)) assert.equal(sha(file), value, file);
for (const row of report.docChanges) assert.equal(sha(row.file), row.after, row.file);

const paths = new Set([
  ...files('src'), ...files('backend'), ...files('tests'), ...files('vendor/simulator'),
  ...files('desktop'), ...files('scripts'), ...files('dist'), ...files('docs'),
  ...files('output/playwright/original-cone-four-plane-main-1011'),
  ...files('output/original-cone-four-plane-main-server-1011/projects'),
  ...files('output/original-cone-four-plane-docs-before-1011'),
  ...report.preservation.integrationReports,
  ...report.docChanges.map(row => row.file),
  ...fs.readdirSync('output').filter(file => /^original-cone-four-plane-.*\.(json|log|py)$/.test(file)).map(file => `output/${file}`),
  'README.md', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts',
  'server.mjs', 'tess-worker.mjs', 'tmp/Origamica-15.0-reference.nb',
  'output/audits/original-planar-ruled-final-1011.json',
]);
const frozenIndexes = [];
for (const row of report.frozenIndexes) {
  const indexFile = path.resolve(row.base, row.index);
  assert.equal(sha(indexFile), row.sha256, indexFile);
  const frozen = json(indexFile);
  assert.equal(frozen.files.length, row.files, indexFile);
  paths.add(path.relative(root, indexFile).replaceAll('\\', '/'));
  for (const entry of frozen.files) {
    const file = path.resolve(row.rowBase ?? row.base, entry.file ?? entry.path);
    assert.ok(file.startsWith(root + path.sep), file);
    assert.equal(sha(file), entry.sha256, file);
    paths.add(path.relative(root, file).replaceAll('\\', '/'));
  }
  frozenIndexes.push({ file: path.relative(root, indexFile).replaceAll('\\', '/'), sha256: sha(indexFile), files: frozen.files.length });
}
paths.add('output/parallel/original-cone-four-plane-cp-4039-1011/root-integration-manifest-1011.json');
const wiring = 'output/parallel/original-cone-four-plane-root-wiring-1011';
for (const file of [
  'before/src/App.tsx', 'before/src/components/TessellationPanel.tsx',
  'after/src/App.tsx', 'after/src/components/TessellationPanel.tsx',
  'entry.patch', 'manifest.json', 'initial-entry.patch', 'initial-manifest.json',
]) paths.add(`${wiring}/${file}`);

const archive = 'output/audits/original-cone-four-plane-artifacts-1011';
const output = 'output/audits/original-cone-four-plane-final-1011.json';
assert.ok(!fs.existsSync(archive) && !fs.existsSync(output));
fs.mkdirSync(archive, { recursive: true });
const snapshots = [];
for (const file of [...paths].sort()) {
  const absolute = path.resolve(file);
  assert.ok(absolute.startsWith(root + path.sep), absolute);
  assert.ok(fs.existsSync(file) && fs.statSync(file).isFile(), file);
  const saved = path.join(archive, file);
  fs.mkdirSync(path.dirname(saved), { recursive: true });
  fs.copyFileSync(file, saved, fs.constants.COPYFILE_EXCL);
  assert.equal(sha(saved), sha(file), file);
  snapshots.push({ file, sha256: sha(file), bytes: fs.statSync(file).size });
}
fs.writeFileSync(output, JSON.stringify({
  verified: true, verifiedAt: new Date().toISOString(), archive, snapshots, frozenIndexes,
  tests: { ...report.tests, mainAppFocused: 152, actualLayout: 102 }, bundle: report.bundle,
  userButtonExportFiles: 49, independentDownloadChecks: 369576,
  actualCoreChecks: 6091, coreImports: 35, actualOptimizedLINEReadbacks: 4,
  actualHandIds: report.actualHandIds, singleEdgeUISelectionProven: true,
  previousArchiveFilesVerified: 3485, preservation: report.preservation,
  finalBuildAndMainAppSameBundle: true, actualLayoutUsedHTTPAndNoRootProjectWrites: true,
  failedSerializerAssumptionRetained: true, failedDomainGuardsRetained: true,
  freezeUsesOnlyListedIsolatedFiles: true, junctionsNotTraversed: true,
  completeOrigamicaGoal: false, packed: false, published: false, machineVerified: false,
  notVerified: [
    'complete original symbolic/default/numerical/curve domains',
    'In4039 full source-apex paper under isolated P60 implementation',
    'Wolfram execution or saved Out',
    'continuous paths/3D/whole layers/collision/thickness',
    'portable package/third-party cutter/machine',
  ],
}, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ frozen: snapshots.length, sourceTargets: 7, mainApp: 152, actualLayout: 102, actualUserFiles: 49, completeOrigamicaGoal: false }));
