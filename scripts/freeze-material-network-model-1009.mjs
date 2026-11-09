import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const read = file => fs.readFileSync(file, 'utf8');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const full = read('output/audits/material-network-model-full-1009.log');
for (const count of [2361, 7, 63]) assert.match(full, new RegExp(`ℹ pass ${count}\\r?\\n`));
assert.match(full, /Ran 1101 tests/);
assert.match(full, /\r?\nOK\r?\n/);
assert.ok(!full.includes('✖') && !full.includes('FAILED ('));
assert.match(read('output/audits/material-network-model-focused-1009.log'), /ℹ pass 59\r?\n/);
const build = read('output/audits/material-network-model-final-build-1009.log');
assert.match(build, /947 modules/);
assert.match(build, /built in/);
const browser = [['browser', 54], ['curve-regression-browser', 24], ['curve-layout-regression-browser', 15], ['network-regression-browser', 121], ['mesh-browser', 16]].map(([name, passed]) => {
  const file = `output/audits/material-network-model-${name}-1009.log`, log = read(file);
  assert.match(log, /^### Result\r?\n/);
  assert.ok(!log.includes('### Error'));
  const result = JSON.parse(log.split(/\r?\n/)[1]);
  assert.equal(result.passed, passed);
  assert.deepEqual(result.errors, []);
  return {file, passed};
});
assert.equal(browser.reduce((n, b) => n + b.passed, 0), 230);
const downloads = ['download', 'curve-regression-download', 'network-regression-download', 'mesh-download'].map((name, i) => {
  const file = `output/audits/material-network-model-${name}-1009.json`, report = JSON.parse(read(file));
  assert.equal(report.verified, true);
  assert.equal(Object.keys(report.cases).length, [11, 2, 14, 3][i]);
  return {file, groups: Object.keys(report.cases).length};
});
const changedProduction = new Set(['src/core/materialNetwork.ts', 'src/core/materialCurves.ts', 'src/core/materialCurveModel.ts', 'src/components/MaterialNetworkDialog.tsx', 'src/components/MaterialCurveDialog.tsx', 'src/components/MaterialCurveModelDialog.tsx', 'src/components/MaterialPieceSelector.tsx']);
const addedTests = ['tests/core/materialNetworkModel.test.ts', 'tests/fixtures/materialNetworkModel.ts'];
const previous = JSON.parse(read('output/audits/material-weak-network-final-1009.json')), preserved = [], observed = [];
for (const row of previous.snapshots) {
  if (!['src/', 'tests/', 'backend/', 'vendor/'].some(p => row.file.startsWith(p)) && !['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'server.mjs'].includes(row.file)) continue;
  if (changedProduction.has(row.file)) {
    assert.notEqual(hash(row.file), row.sha256);
    observed.push(row.file);
    continue;
  }
  assert.equal(hash(row.file), row.sha256, `Unexpected source/test/vendor change: ${row.file}`);
  preserved.push(row);
}
assert.deepEqual(observed.sort(), [...changedProduction].sort());
const all = dir => fs.readdirSync(dir, {recursive: true}).map(f => path.join(dir, f).replaceAll('\\', '/')).filter(f => fs.statSync(f).isFile() && !f.includes('__pycache__'));
const priorFiles = new Set(previous.snapshots.map(row => row.file));
const current = [...all('src'), ...all('tests'), ...all('backend'), ...all('vendor/simulator')];
assert.deepEqual(current.filter(f => !priorFiles.has(f)).sort(), [...addedTests].sort());
const archive = 'output/audits/material-network-model-artifacts-1009', manifest = 'output/audits/material-network-model-final-1009.json';
assert.ok(!fs.existsSync(archive) && !fs.existsSync(manifest), 'Do not overwrite frozen history');
const files = new Set([
  ...current, ...all('dist'),
  ...fs.readdirSync('scripts').filter(f => f.includes('material-network-model') && f.includes('1009')).map(f => 'scripts/' + f),
  ...fs.readdirSync('output/audits').filter(f => f.startsWith('material-network-model-') && f.includes('1009') && /\.(json|log|ts)$/.test(f) && !['material-network-model-final-1009.json', 'material-network-model-freeze-1009.log'].includes(f)).map(f => 'output/audits/' + f),
  ...fs.readdirSync('output/playwright').filter(f => f.startsWith('material-network-model-') && f.includes('1009')).map(f => 'output/playwright/' + f),
  'README.md', 'docs/Origamica稳定构造逐项差异-20260927.md', 'docs/P42-线网曲线混合参数组与重放-20261009.md',
  'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'server.mjs',
  'output/audits/material-weak-network-final-1009.json', 'output/audits/material-weak-network-recipes-1009.json',
  'scripts/setup-material-curve-model-browser-1009.ts', 'scripts/verify-material-curve-model-1009.browser.js',
  'scripts/verify-material-curve-model-layout-1009.browser.js', 'scripts/verify-material-curve-model-download-1009.ts',
  'output/playwright/material-weak-network-run-1009.browser.js', 'scripts/verify-material-weak-network-download-1009.ts'
]);
for (const recipe of JSON.parse(read('output/audits/material-weak-network-recipes-1009.json'))) files.add(`output/playwright/material-weak-network-${recipe.name}-initial-1009.zhezhi.json`);
fs.mkdirSync(archive, {recursive: true});
const snapshots = [];
for (const file of [...files].sort()) {
  const target = path.join(archive, file);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.copyFileSync(file, target, fs.constants.COPYFILE_EXCL);
  assert.equal(hash(target), hash(file));
  snapshots.push({file, sha256: hash(file), bytes: fs.statSync(file).size});
}
const report = {
  verified: true, completeOrigamicaGoal: false,
  scope: 'Persistent closed-network recipes and ordered mixed curve/network replay, source ancestry, v1/v2 reload/edit/removal, stale archive/current material rebase, actual ordinary and simulation exports',
  tests: {fullFrontend: 2361, backendFull: 1101, desktop: 7, serverWorker: 63, focusedFrontend: 59, newCore: 16, buildModules: 947, browser: 230, actualOrdinaryExportGroups: 27, newSimulationGroups: 3, priorNetworkSimulationFOLDGroups: 14},
  browser, downloads, changedProduction: [...changedProduction], addedProduction: [], addedTests,
  preservedSourceTestsAndVendor: preserved, archive, snapshots,
  initialFailuresPreserved: 'material-network-model-new-core-1009.log retains an initial erroneous test predicate; corrected focused59 and full2361 independently pass.',
  verificationScope: 'All production changes preceded the full test and final build. Actual FOLD auxiliary segment order compared by stable ID; material topology, geometry, assignments, properties and mesh associations checked strictly. Previous App, formats/DXF/optimizer, flat geometry/layers, simulator, vendor, backend/services, all existing tests and package/config hashes preserved. No Git metadata available; prior frozen SHA manifest used.',
  remaining: ['Full ordered material operation replay including rays/traces/transforms/cut/join', 'Degree >=10 weaving and curved/touching/intersecting mother holes', 'Broader visible-color/layer domains and arbitrary analytic/interpolated curves/nonflat editing', 'Complete Wolfram expressions/options/interpolation and unproven numerical domains'],
  notVerified: ['Physical rigid/continuous collision-free folding/manufacturing', 'All parameter domains/extreme scale/capacity/performance', 'Complete Wolfram numerical Out equivalence', 'Portable EXE/native interaction; no packaging or release', 'Third-party mesh/engraving import or machine pressure/speed/accuracy']
};
fs.writeFileSync(manifest, JSON.stringify(report, null, 2), {flag: 'wx'});
console.log(`Frozen ${snapshots.length} files; ${preserved.length} prior source/test/vendor hashes preserved; 230 UI checks, 27 ordinary export groups and 3 actual mesh sets. Complete Origamica goal remains active.`);
