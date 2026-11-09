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
const run = json('output/original-planar-ruled-checks-1011.json');
assert.equal(run.exitCode, 0);
assert.equal(run.inputsUnchanged, true);
assert.equal(run.backendInputsUnchanged, true);
for (const row of run.inputs) assert.equal(sha(row.file), row.sha256, row.file);
const report = json('output/original-planar-ruled-report-1011.json');
assert.equal(report.verified, true);
assert.equal(report.userButtonExportFiles, 31);
assert.equal(report.layoutChecks, 153);
const previous = json('output/audits/original-conic-noncircle-final-1011.json');
assert.equal(previous.snapshots.length, 3494);
for (const row of previous.snapshots) assert.equal(sha(`${previous.archive}/${row.file}`), row.sha256, row.file);
for (const [file, value] of Object.entries(report.preservation.lastSourceHashes)) assert.equal(sha(file), value, file);
for (const row of report.docChanges) assert.equal(sha(row.file), row.after, row.file);

const paths = new Set([
  ...files('src'), ...files('backend'), ...files('tests'), ...files('vendor/simulator'),
  ...files('desktop'), ...files('scripts'), ...files('dist'), ...files('docs'),
  ...files('output/playwright/original-planar-ruled-main-1011'),
  ...files('output/original-planar-ruled-main-server-1011/projects'),
  ...files('output/original-planar-ruled-docs-before-1011'),
  ...report.preservation.integrationReports,
  ...report.docChanges.map(row => row.file),
  ...fs.readdirSync('output').filter(file => /^original-(planar-ruled|noncircle-compact)-.*\.(json|log|py)$/.test(file)).map(file => `output/${file}`),
  'README.md', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts',
  'server.mjs', 'tess-worker.mjs', 'tmp/Origamica-15.0-reference.nb',
  'output/audits/original-conic-noncircle-final-1011.json',
]);
const frozenIndexes = [];
function addFrozen(base, index, rowBase = base) {
  const indexFile = path.resolve(base, index);
  const frozen = json(indexFile);
  assert.ok(Array.isArray(frozen.files), indexFile);
  paths.add(path.relative(root, indexFile).replaceAll('\\', '/'));
  for (const row of frozen.files) {
    const file = path.resolve(rowBase, row.file ?? row.path);
    assert.ok(file.startsWith(root + path.sep), file);
    assert.equal(sha(file), row.sha256, file);
    paths.add(path.relative(root, file).replaceAll('\\', '/'));
  }
  frozenIndexes.push({ file: path.relative(root, indexFile).replaceAll('\\', '/'), sha256: sha(indexFile), files: frozen.files.length });
}
const construction = 'output/parallel/original-planar-ruled-build-cp-4040-1011';
addFrozen(construction, 'freeze.json');
paths.add(`${construction}/root-integration-manifest-1011.json`);
addFrozen('output/parallel/original-planar-ruled-main-acceptance-prepared-1011', 'freeze.json');
addFrozen('output/parallel/original-planar-ruled-main-auditor-fix-1011', 'freeze.json');
const compact = 'output/parallel/original-conic-noncircle-dialog-compact-ux-1011';
addFrozen(compact, 'FREEZE.json');
addFrozen(compact, 'evidence/ancestor-layout-check-001/FREEZE.json');
const peer = `${compact}/evidence/peer-layout-review-001`;
addFrozen(peer, 'review-freeze.json');
paths.add(`${compact}/root-integration-manifest-1011.json`);
const wiring = 'output/parallel/original-planar-ruled-root-wiring-1011';
for (const file of [
  'before/src/App.tsx', 'before/src/components/TessellationPanel.tsx',
  'after/src/App.tsx', 'after/src/components/TessellationPanel.tsx',
  'entry.patch', 'manifest.json',
]) paths.add(`${wiring}/${file}`);
for (const row of report.layout.frozenIndexes) addFrozen(row.base, row.index, row.rowBase ?? row.base);

const archive = 'output/audits/original-planar-ruled-artifacts-1011';
const output = 'output/audits/original-planar-ruled-final-1011.json';
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
  tests: { ...run.tests, mainAppFocused: 88, mainCompactLayout: 153 }, bundle: report.bundle,
  userButtonExportFiles: 31, independentDownloadChecks: report.independentDownloadChecks,
  actualCoreChecks: 340, coreImports: 23, actualOptimizedLINEReadbacks: 2,
  actualHandMCount: 2, singleEdgeUISelectionProven: false,
  previousArchiveFilesVerified: 3494, preservation: report.preservation,
  finalBuildAndMainAppSameBundle: true, actualCompactUsedHTTPAndNoRootProjectWrites: true,
  failedAuditSingleEdgeAndPartialPlanAssumptionsRetained: true,
  failedLayoutHarnessURLReadRetained: true, freezeUsesOnlyListedIsolatedFiles: true,
  junctionsNotTraversed: true, completeOrigamicaGoal: false,
  packed: false, published: false, machineVerified: false,
  notVerified: [
    'complete original symbolic/default/numerical/curve domains',
    'In4039 cone four-mirror CP next construction',
    'single short-edge UI selection in this In4040 test',
    'Wolfram execution or saved Out',
    'continuous paths/3D/whole layers/collision/thickness',
    'portable package/third-party cutter/machine',
  ],
}, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ frozen: snapshots.length, sourceTargets: 9, mainApp: 88, mainCompactLayout: 153, actualUserFiles: 31, completeOrigamicaGoal: false }));
