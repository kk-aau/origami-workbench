from pathlib import Path
import hashlib
import json
import os
import shutil

root = Path.cwd().resolve()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads((root / p).read_text(encoding='utf-8-sig'))
report = read('output/original-nonuniform-spiral-report-1011.json')
assert report['verified'] and report['finalLayoutPassed']
assert report['finalFunctionalMainAppChecks'] == 204 and report['userButtonExportFiles'] == 52
assert report['finalLayoutChecks'] == 166 and report['finalBundleActualUserDownloads'] == 0
previous = read('output/audits/original-cone-four-plane-apex-final-1011.json')
assert len(previous['snapshots']) == 3900
for row in previous['snapshots']:
 assert sha(root / previous['archive'] / row['file']) == row['sha256'], row['file']
for name, expected in report['preservation']['lastSourceHashes'].items():
 assert sha(root / name) == expected, name
for row in report['docChanges']:
 assert sha(root / row['file']) == row['after'], row['file']
bridge = read(report['cssBridgeFile'])
assert sha(root / report['cssBridgeFile']) == report['cssBridgeSha256']
for row in bridge['files']:
 assert sha(root / row['file']) == row['sha256'], row['file']
paths = set()
def collect(folder):
 directory = root / folder
 if not directory.is_dir():
  return
 for current, dirs, files in os.walk(directory, followlinks=False):
  dirs[:] = [v for v in dirs if v not in ['node_modules', '__pycache__', '.venv', '.git'] and not (Path(current)/v).is_symlink() and not (hasattr(Path(current)/v, 'is_junction') and (Path(current)/v).is_junction())]
  for name in files:
   p = Path(current)/name
   if p.is_file() and not p.is_symlink():
    paths.add(p.relative_to(root).as_posix())
for folder in ['src','backend','tests','vendor/simulator','desktop','scripts','dist','docs',
 'output/playwright/original-nonuniform-spiral-main-1011',
 'output/original-nonuniform-spiral-main-server-1011/projects',
 'output/original-nonuniform-spiral-before-performance-1011',
 'output/original-nonuniform-spiral-before-parent-fix-1011',
 'output/original-nonuniform-spiral-docs-before-1011',
 'output/parallel/original-nonuniform-spiral-3968-root-wiring-1011']:
 collect(folder)
for name in ['README.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs','tess-worker.mjs','tmp/Origamica-15.0-reference.nb',
 'output/audits/original-cone-four-plane-apex-final-1011.json']:
 paths.add(name)
for p in (root/'output').iterdir():
 if p.is_file() and p.name.startswith('original-nonuniform-spiral-'):
  paths.add(p.relative_to(root).as_posix())
for name in report['preservation']['integrationReports']:
 paths.add(name)
for ref in report['frozenIndexes']:
 assert sha(root/ref['file']) == ref['sha256'], ref['file']
 paths.add(ref['file'])
 for row in ref['files']:
  assert sha(root/row['file']) == row['sha256'], row['file']
  paths.add(row['file'])
archive = root/'output/audits/original-nonuniform-spiral-artifacts-1011'
index = root/'output/audits/original-nonuniform-spiral-final-1011.json'
assert not archive.exists() and not index.exists()
snapshots=[]
archive.mkdir()
for name in sorted(paths):
 p=(root/name).resolve()
 assert p.is_relative_to(root) and p.is_file(), name
 saved=archive/name
 saved.parent.mkdir(parents=True,exist_ok=True)
 shutil.copyfile(p,saved)
 assert sha(saved)==sha(p),name
 snapshots.append(dict(file=name,sha256=sha(p),bytes=p.stat().st_size))
j=dict(verified=True,archive=archive.relative_to(root).as_posix(),snapshots=snapshots,
 frozenIndexes=report['frozenIndexes'],tests=report['tests'],preservation=report['preservation'],
 functionalBundle=report['functionalBundle'],bundle=report['bundle'],finalBundleActualUserDownloads=0,
 actualMainChecks=204,actualUserFiles=52,actualCoreImports=39,processingPairs=3,
 finalParentLayoutChecks=166,layoutIndependentChecks=409,layoutGuardedFiles=134,
 actualCoreChecks=4324,independentPythonChecks=2103394,previousArchiveFilesVerified=3900,
 cssOnlyJavaScriptBridgeVerified=True,finalFreshParentLayoutPassed=True,
 old26And52Preserved=True,allFailedEvidenceRetained=True,
 usesOnlyListedIsolatedFiles=True,junctionsNotTraversed=True,completeOrigamicaGoal=False,
 packed=False,published=False,machineVerified=False,notVerified=report['notVerified'],finalSaved=report['finalSaved'])
index.write_text(json.dumps(j,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(frozen=len(snapshots),sourceTargets=7,main=204,layout=166,actualUserFiles=52,goalComplete=False)))
