"""Archive P65 sources and explicitly listed evidence, without traversing work junctions."""
from pathlib import Path
import hashlib
import json
import os
import shutil

root = Path.cwd().resolve()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))
report = read(root / 'output/original-nonuniform-helix-general-report-1011.json')
assert report['verified'] and report['userButtonExportFiles'] == 49
assert report['actualCoreImports'] == 35 and report['finalLayoutRecords'] == 12
assert report['ownRuntimeClosed'] and report['completeOrigamicaGoal'] is False
paths = set()


def collect(folder):
    base = root / folder
    if not base.is_dir():
        return
    for current, dirs, files in os.walk(base, followlinks=False):
        dirs[:] = [name for name in dirs
                   if name not in ['node_modules', '.venv', '__pycache__', '.git']
                   and not (Path(current) / name).is_symlink()
                   and not (hasattr(Path(current) / name, 'is_junction')
                            and (Path(current) / name).is_junction())]
        for name in files:
            p = Path(current) / name
            if p.is_file() and not p.is_symlink():
                paths.add(p.relative_to(root).as_posix())


for folder in ['src', 'backend', 'tests', 'vendor/simulator', 'desktop',
               'scripts', 'dist', 'docs',
               'output/playwright/original-nonuniform-helix-general-main-1011',
               'output/original-nonuniform-helix-general-main-server-1011/projects',
               'output/original-nonuniform-helix-general-docs-before-1011',
               'output/parallel/original-nonuniform-helix-general-root-wiring-1011']:
    collect(folder)
for name in ['README.md', 'package.json', 'package-lock.json', 'tsconfig.json',
             'vite.config.ts', 'server.mjs', 'tess-worker.mjs',
             'tmp/Origamica-15.0-reference.nb',
             'output/audits/original-uniform-helix-general-final-1011.json']:
    paths.add(name)
for p in (root / 'output').iterdir():
    if p.is_file() and p.name.startswith('original-nonuniform-helix-general-'):
        paths.add(p.relative_to(root).as_posix())
for row in report['listedEvidence']:
    assert sha(root / row['file']) == row['sha256'], row['file']
    paths.add(row['file'])
for row in report['docChanges']:
    assert sha(root / row['file']) == row['after'], row['file']
    paths.add(row['file'])
for name, digest in report['preservation']['lastSourceHashes'].items():
    assert sha(root / name) == digest, name
    paths.add(name)
for name in report['preservation']['integrationReports']:
    paths.add(name)
producer = root / 'output/parallel/original-nonuniform-helix-general-cp-3966-1011'
for name in ['root-integration-manifest-1011.json', 'root-additions-1011.patch']:
    p = producer / name
    assert p.is_file()
    paths.add(p.relative_to(root).as_posix())
archive = root / 'output/audits/original-nonuniform-helix-general-artifacts-1011'
index = root / 'output/audits/original-nonuniform-helix-general-final-1011.json'
assert not archive.exists() and not index.exists(), '不覆盖历史验收'
archive.mkdir()
snapshots = []
for name in sorted(paths):
    p = (root / name).resolve()
    assert p.is_relative_to(root) and p.is_file(), name
    saved = archive / name
    saved.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(p, saved)
    digest = sha(p)
    assert digest == sha(saved), name
    snapshots.append(dict(file=name, sha256=digest, bytes=p.stat().st_size))
result = dict(verified=True, archive=archive.relative_to(root).as_posix(),
              snapshots=snapshots, tests=report['tests'], bundle=report['bundle'],
              frozenIndexes=report['frozenIndexes'], preservation=report['preservation'],
              actualMainChecks=report['actualMainChecks'], actualUserFiles=49,
              actualCoreImports=35, processingPairs=3,
              finalParentLayoutChecks=report['finalLayoutChecks'],
              finalParentLayoutRecords=12, finalSaved=report['finalSaved'],
              independent=report['independent'],
              usesOnlyListedIsolatedFiles=True, junctionsNotTraversed=True,
              allFailedEvidenceRetained=True, ownRuntimeClosed=True,
              completeOrigamicaGoal=False, packed=False, published=False,
              machineVerified=False, notVerified=report['notVerified'])
index.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(dict(verified=True, frozen=len(snapshots), goalComplete=False)))
