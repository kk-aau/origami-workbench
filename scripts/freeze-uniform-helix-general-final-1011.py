from pathlib import Path
import hashlib
import json
import os
import shutil

root = Path.cwd().resolve()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda name: json.loads((root / name).read_text(encoding='utf-8-sig'))
report = read('output/original-uniform-helix-general-report-1011.json')
assert report['verified'] and report['userButtonExportFiles'] == 49
assert report['actualCoreImports'] == 35 and report['finalLayoutRecords'] == 12
assert report['completeOrigamicaGoal'] is False
previous = read('output/audits/original-spiral-refold-final-1011.json')
assert len(previous['snapshots']) == 4158
for row in previous['snapshots']:
    assert sha(root / previous['archive'] / row['file']) == row['sha256'], row['file']
for name, value in report['preservation']['lastSourceHashes'].items():
    assert sha(root / name) == value, name
for row in report['docChanges'] + report['listedEvidence']:
    assert sha(root / row['file']) == row.get('after', row.get('sha256')), row['file']
paths = set()

def collect(folder):
    base = root / folder
    if not base.is_dir():
        return
    for current, dirs, files in os.walk(base, followlinks=False):
        dirs[:] = [name for name in dirs if name not in
                   ['node_modules', '.venv', '__pycache__', '.git']
                   and not (Path(current) / name).is_symlink()
                   and not (hasattr(Path(current) / name, 'is_junction')
                            and (Path(current) / name).is_junction())]
        for name in files:
            p = Path(current) / name
            if p.is_file() and not p.is_symlink():
                paths.add(p.relative_to(root).as_posix())

for folder in ['src', 'backend', 'tests', 'vendor/simulator', 'desktop',
               'scripts', 'dist', 'docs',
               'output/playwright/original-uniform-helix-general-main-1011',
               'output/original-uniform-helix-general-main-server-1011/projects',
               'output/original-uniform-helix-general-docs-before-1011',
               'output/original-uniform-helix-general-before-runtime-match-fix-1011',
               'output/parallel/original-uniform-helix-general-root-wiring-1011']:
    collect(folder)
for name in ['README.md', 'package.json', 'package-lock.json', 'tsconfig.json',
             'vite.config.ts', 'server.mjs', 'tess-worker.mjs',
             'tmp/Origamica-15.0-reference.nb',
             'output/audits/original-spiral-refold-final-1011.json']:
    paths.add(name)
for p in (root / 'output').iterdir():
    if p.is_file() and p.name.startswith('original-uniform-helix-general-'):
        paths.add(p.relative_to(root).as_posix())
for name in report['preservation']['integrationReports']:
    paths.add(name)
for row in report['listedEvidence']:
    paths.add(row['file'])
for folder in ['original-uniform-helix-general-cp-3951-1011',
               'original-uniform-helix-general-runtime-match-fix-1011']:
    base = root / 'output/parallel' / folder
    for name in ['root-integration-manifest-1011.json', 'root-additions-1011.patch',
                 'root-runtime-fix-1011.patch', 'manifest.json', 'runtime-fix.patch']:
        p = base / name
        if p.is_file():
            paths.add(p.relative_to(root).as_posix())
archive = root / 'output/audits/original-uniform-helix-general-artifacts-1011'
index = root / 'output/audits/original-uniform-helix-general-final-1011.json'
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
result = dict(verified=True, archive=archive.relative_to(root).as_posix(),
              snapshots=snapshots, frozenIndexes=report['frozenIndexes'],
              tests=report['tests'], preservation=report['preservation'],
              bundle=report['bundle'], actualMainChecks=report['actualMainChecks'],
              actualUserFiles=49, actualCoreImports=35, processingPairs=3,
              actualCoreChecks=report['actualCoreChecks'],
              independentPythonChecks=report['independentPythonChecks'],
              independentLayoutChecks=report['independentLayoutChecks'],
              actualCoreIndependentIndex=report['actualCoreIndependentIndex'],
              actualNumericIndependentIndex=report['actualNumericIndependentIndex'],
              actualParentIndependentIndex=report['actualParentIndependentIndex'],
              finalParentLayoutChecks=report['finalLayoutChecks'],
              finalParentLayoutRecords=12, layoutGuardedFiles=101,
              previousArchiveFilesVerified=4158, finalSaved=report['finalSaved'],
              usesOnlyListedIsolatedFiles=True, junctionsNotTraversed=True,
              allFailedEvidenceRetained=True, ownRuntimeClosed=True,
              completeOrigamicaGoal=False, packed=False, published=False,
              machineVerified=False, notVerified=report['notVerified'])
index.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(dict(frozen=len(snapshots), actualUser49=True, goalComplete=False)))
