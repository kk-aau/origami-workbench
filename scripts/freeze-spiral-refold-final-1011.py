from pathlib import Path
import hashlib
import json
import os
import shutil

root = Path.cwd().resolve()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda name: json.loads((root / name).read_text(encoding='utf-8-sig'))
report = read('output/original-spiral-refold-report-1011.json')
assert report['verified'] and report['actualMainChecks'] == 344 and report['finalLayoutChecks'] == 578
assert report['actualCameraChecks'] == 34 and report['userButtonExportFiles'] == 52
assert report['completeOrigamicaGoal'] is False
previous = read('output/audits/original-uniform-helix-final-1011.json')
assert len(previous['snapshots']) == 3552
for row in previous['snapshots']:
    assert sha(root / previous['archive'] / row['file']) == row['sha256'], row['file']
for name, value in report['preservation']['lastSourceHashes'].items():
    assert sha(root / name) == value, name
for row in report['docChanges'] + report['listedEvidence']:
    assert sha(root / row['file']) == row.get('after', row.get('sha256')), row['file']
build = read('output/original-spiral-refold-tabs-fix-build-1011.json')
for row in build['files']:
    assert sha(root / row['file']) == row['sha256'], row['file']
paths = set()
def collect(folder):
    base = root / folder
    if not base.is_dir():
        return
    for current, dirs, files in os.walk(base, followlinks=False):
        dirs[:] = [name for name in dirs if name not in ['node_modules', '.venv', '__pycache__', '.git']
                   and not (Path(current) / name).is_symlink()
                   and not (hasattr(Path(current) / name, 'is_junction') and (Path(current) / name).is_junction())]
        for name in files:
            p = Path(current) / name
            if p.is_file() and not p.is_symlink():
                paths.add(p.relative_to(root).as_posix())

for folder in ['src', 'backend', 'tests', 'vendor/simulator', 'desktop', 'scripts', 'dist', 'docs',
               'output/playwright/original-spiral-refold-main-1011',
               'output/playwright/original-spiral-refold-main-camera-events-1011',
               'output/original-spiral-refold-main-server-1011/projects',
               'output/original-spiral-refold-docs-before-1011',
               'output/original-spiral-refold-before-space-view-1011',
               'output/original-spiral-refold-before-placeholder-fix-1011',
               'output/original-spiral-refold-before-tabs-fix-1011',
               'output/parallel/original-spiral-refold-root-wiring-1011']:
    collect(folder)
for name in ['README.md', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts',
             'server.mjs', 'tess-worker.mjs', 'tmp/Origamica-15.0-reference.nb',
             'output/audits/original-uniform-helix-final-1011.json']:
    paths.add(name)
for p in (root / 'output').iterdir():
    if p.is_file() and p.name.startswith('original-spiral-refold-'):
        paths.add(p.relative_to(root).as_posix())
for name in report['preservation']['integrationReports']:
    paths.add(name)
for row in report['listedEvidence']:
    paths.add(row['file'])
# Author adapters were added after the immutable producer indexes; include only their known paths.
for folder in ['original-spiral-refold-3980-cp-1011',
               'original-spiral-refold-3980-cp-1011/space-view-delta-001',
               'original-spiral-refold-3980-cp-1011/placeholder-layout-delta-001',
               'original-spiral-refold-3980-cp-1011/tab-height-delta-001']:
    p = root / 'output/parallel' / folder / 'root-integration-manifest-1011.json'
    assert p.is_file()
    paths.add(p.relative_to(root).as_posix())
archive = root / 'output/audits/original-spiral-refold-artifacts-1011'
index = root / 'output/audits/original-spiral-refold-final-1011.json'
assert not archive.exists() and not index.exists()
archive.mkdir()
snapshots = []
for name in sorted(paths):
    p = (root / name).resolve()
    assert p.is_relative_to(root) and p.is_file(), name
    saved = archive / name
    saved.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(p, saved)
    assert sha(p) == sha(saved), name
    snapshots.append(dict(file=name, sha256=sha(p), bytes=p.stat().st_size))
index.write_text(json.dumps(dict(verified=True, archive=archive.relative_to(root).as_posix(),
    snapshots=snapshots, frozenIndexes=report['frozenIndexes'], tests=report['tests'],
    preservation=report['preservation'], bundle=report['bundle'], actualMainChecks=344,
    actualUserFiles=52, actualCoreImports=39, processingPairs=3, actualCoreChecks=6864,
    independentPythonChecks=505708, finalParentLayoutChecks=578, finalParentLayoutRecords=36,
    layoutIndependentChecks=1210, layoutGuardedFiles=238, actualCameraChecks=34,
    actualCameraRecords=4, cameraIndependentChecks=5289, previousArchiveFilesVerified=3552,
    finalSaved=report['finalSaved'], usesOnlyListedIsolatedFiles=True, junctionsNotTraversed=True,
    allFailedEvidenceRetained=True, ownRuntimeClosed=True, completeOrigamicaGoal=False,
    packed=False, published=False, machineVerified=False, notVerified=report['notVerified']),
    ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(dict(frozen=len(snapshots), main=344, layout=578, camera=34,
                     actualUserFiles=52, completeOrigamicaGoal=False)))
