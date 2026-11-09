import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const root = process.cwd();
const evidence = 'output/parallel/original-noncircle-compact-main-ui-1011';
const freezeFile = process.argv[2];
assert.ok(freezeFile, 'Pass the completed precise evidence freeze path.');
const rowBase = path.resolve(process.argv[3] ?? path.dirname(freezeFile));
const frozen = json(freezeFile);
assert.ok(Array.isArray(frozen.files) && frozen.files.length > 0);
for (const row of frozen.files) {
  const file = path.resolve(rowBase, row.file ?? row.path);
  assert.ok(file.startsWith(root + path.sep), file);
  assert.equal(sha(file), row.sha256, file);
}
const finalFile = `${evidence}/final-report.json`;
const report = json(finalFile);
assert.equal(report.verified, true);
assert.equal(report.passed, 153);
assert.deepEqual(report.errors, []);
assert.equal(report.actualBrowserBundle, '/assets/main-B_sMzP0F.js');
assert.equal(report.baseURL, 'http://127.0.0.1:8870');
assert.equal(report.actualStateMeasurements, 12);
assert.equal(report.dialogHeight, 680);
assert.equal(report.plotSlotHeight, 420);
for (const field of ['noDialogScroll', 'footerAndAllParametersVisible', 'sourceNotesVisible', 'stateHeightAndFooterPositionStable', 'projectFilesSHAUnchanged', 'ownOnlyUnsavedDocs']) assert.equal(report[field], true, field);
for (const field of ['serviceStarted', 'productionWritten', 'fixtureUsed', 'mockUsed', 'stubUsed']) assert.equal(report[field], false, field);
assert.equal(report.actualUserDownloads, 0);
assert.equal(report.actualProjectWrites, 0);
assert.equal(report.preservedOldFrozenFiles, 134);
assert.equal(sha(report.actualMainBrowserReport), report.actualMainBrowserReportSHA);
assert.deepEqual(report.actualNativeAPIStatuses, [200]);
assert.ok(report.actualNativeAPIResponses > 0);
const ui = json(report.actualMainBrowserReport);
assert.equal(ui.verified, true);
assert.equal(ui.passed, 153);
assert.deepEqual(ui.errors, []);
assert.equal(ui.bundle, report.actualBrowserBundle);
assert.equal(ui.actualMainBrowserRun, true);
assert.equal(ui.standalone, false);
assert.equal(ui.records.length, 12);
const keys = new Set();
for (const row of ui.records) {
  assert.ok(['ready', 'busy', 'error'].includes(row.state));
  assert.ok(['tess-panel', 'app-source-reedit'].includes(row.context));
  assert.ok((row.viewport.width === 1420 && row.viewport.height === 960) || (row.viewport.width === 1920 && row.viewport.height === 1080));
  keys.add(`${row.viewport.width}/${row.context}/${row.state}`);
  assert.equal(row.dialog.height, 680);
  assert.equal(row.slot.height, 420);
  assert.equal(row.dialogScroll.top, 0);
  assert.equal(row.dialogScroll.height, row.dialogScroll.clientHeight);
  assert.equal(row.dialogScroll.width, row.dialogScroll.clientWidth);
  assert.equal(row.disabled, row.state !== 'ready');
  assert.equal(row.tessPanelAncestor, row.context === 'tess-panel');
  for (const rect of [...row.fields.map(field => field.rect), ...row.sourceNotes.map(note => note.rect), row.footer, row.slot]) {
    assert.ok(rect.x >= row.dialog.x && rect.right <= row.dialog.right && rect.y >= row.dialog.y && rect.bottom <= row.dialog.bottom, row.label);
  }
}
assert.equal(keys.size, 12);
for (const row of ui.apiRecords) {
  assert.equal(row.status, 200);
  assert.equal(row.actualServiceResponse, true);
  assert.equal(row.actualUserExport, false);
  assert.ok(row.url.startsWith('http://127.0.0.1:8870/api/'));
}
for (const [file, value] of Object.entries(report.projectFileHashes)) assert.equal(sha(`output/original-planar-ruled-main-server-1011/projects/${file}`), value, file);
for (const prior of report.protected) {
  assert.equal(sha(prior.index), prior.sha256, prior.index);
  const rows = json(prior.index).files;
  assert.equal(rows.length, prior.files);
  for (const row of rows) assert.equal(sha(path.resolve(prior.relativeBase, row.file ?? row.path)), row.sha256, row.file ?? row.path);
}
const geometry = json(report.actualGeometryReadback);
assert.equal(geometry.verified, true);
assert.deepEqual(geometry.errors, []);
assert.equal(geometry.checks, 34);
assert.equal(report.actualUnsavedDocGeometry.length, 2);
for (const doc of report.actualUnsavedDocGeometry) {
  assert.equal(doc.projectId, null);
  assert.equal(doc.sourceMatches, true);
  assert.equal(doc.rawIdentityExact, true);
  assert.equal(doc.geometry, 'ready');
  assert.equal(doc.layers, 'unknown');
}
const output = 'output/original-noncircle-compact-main-verified-1011.json';
assert.ok(!fs.existsSync(output));
fs.writeFileSync(output, JSON.stringify({
  verified: true, verifiedAt: new Date().toISOString(),
  passed: 153, geometryChecks: 34, bundle: report.actualBrowserBundle,
  evidenceDirectory: evidence, actualReport: finalFile, actualReportSHA: sha(finalFile),
  actualUserExports: 0, noRootProjectWrites: true, usedActualAPI: true,
  actualAPIResponses: report.actualNativeAPIResponses,
  desktopViewports: report.viewports, contexts: report.contexts, states: report.states,
  stateMeasurements: 12, dialogHeight: 680, plotSlotHeight: 420,
  noDialogScroll: true, allParametersAndFooterVisible: true,
  oldFrozen134Unchanged: true, failedFirstHarnessAttemptRetained: true,
  noProductionWrites: true, noServiceLaunch: true,
  frozenIndexes: [{
    base: path.dirname(freezeFile).replaceAll('\\', '/'),
    index: path.basename(freezeFile),
    rowBase: path.relative(root, rowBase).replaceAll('\\', '/'),
    files: frozen.files.length, sha256: sha(freezeFile),
  }],
  completeOrigamicaGoal: false, packed: false, machineVerified: false,
}, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ verified: true, mainLayout: 153, geometryChecks: 34, states: 12, downloads: 0, rootProjectWrites: 0 }));
