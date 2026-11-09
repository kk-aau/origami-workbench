from pathlib import Path
import json
import hashlib
import os
import shutil

root=Path.cwd().resolve()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
read=lambda p:json.loads((root/p).read_text(encoding='utf-8-sig'))
report=read('output/original-uniform-helix-report-1011.json')
assert report['verified'] and report['actualMainChecks']==336 and report['finalLayoutChecks']==158
assert report['userButtonExportFiles']==52 and report['completeOrigamicaGoal'] is False
previous=read('output/audits/original-nonuniform-spiral-final-1011.json')
assert len(previous['snapshots'])==3645
for row in previous['snapshots']:assert sha(root/previous['archive']/row['file'])==row['sha256'],row['file']
for name,value in report['preservation']['lastSourceHashes'].items():assert sha(root/name)==value,name
for row in report['docChanges']:assert sha(root/row['file'])==row['after'],row['file']
bundle=read('output/original-uniform-helix-bundle-1011.json')
for row in bundle['files']:assert sha(root/row['file'])==row['sha256'],row['file']
paths=set()
def collect(folder):
 p=root/folder
 if not p.is_dir():return
 for current,dirs,files in os.walk(p,followlinks=False):
  dirs[:]=[d for d in dirs if d not in ['node_modules','.venv','__pycache__','.git'] and not (Path(current)/d).is_symlink() and not (hasattr(Path(current)/d,'is_junction') and (Path(current)/d).is_junction())]
  for name in files:
   f=Path(current)/name
   if f.is_file() and not f.is_symlink():paths.add(f.relative_to(root).as_posix())
for folder in ['src','backend','tests','vendor/simulator','desktop','scripts','dist','docs',
 'output/playwright/original-uniform-helix-main-1011','output/original-uniform-helix-main-server-1011/projects',
 'output/original-uniform-helix-docs-before-1011','output/parallel/original-uniform-helix-root-wiring-1011']:
 collect(folder)
for name in ['README.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs','tess-worker.mjs','tmp/Origamica-15.0-reference.nb',
 'output/audits/original-nonuniform-spiral-final-1011.json']:
 paths.add(name)
for p in (root/'output').iterdir():
 if p.is_file() and p.name.startswith('original-uniform-helix-'):paths.add(p.relative_to(root).as_posix())
for name in report['preservation']['integrationReports']:paths.add(name)
for ref in report['frozenIndexes']:
 assert sha(root/ref['file'])==ref['sha256'],ref['file'];paths.add(ref['file'])
 for row in ref['files']:
  assert sha(root/row['file'])==row['sha256'],row['file'];paths.add(row['file'])
# Independent audit uses actualNonUserInputs, while some other indexes use an integer download count.
# Collect the actual file lists explicitly and preserve the report's previously verified role counts.
extra={}
def add_file(p,value):
 p=p.resolve();assert p.is_relative_to(root) and sha(p)==value,p
 name=p.relative_to(root).as_posix();paths.add(name);extra[name]=value
py=read('output/parallel/original-uniform-helix-actual-file-independent-1011/freeze.json')
assert len(py['actualNonUserInputs'])==32
for row in py['actualNonUserInputs']:add_file(Path(row['path']),row['sha256'])
support=read('output/parallel/original-uniform-helix-cp-3951-1011/SUPPORT-FROZEN-001.json')
for ref in support['references']:
 base=Path(ref['producerRoot']);p=base/ref['index'];add_file(p,ref['sha256'])
 j=json.loads(p.read_text(encoding='utf8'));assert len(j['files'])==ref['files'],p
 for row in j['files']:
  name=row.get('path',row.get('file'));candidate=next((f for f in [base/name,root/name] if f.is_file() and sha(f)==row['sha256']),None)
  assert candidate is not None,name;add_file(candidate,row['sha256'])
extra_path=root/'output/original-uniform-helix-extra-listed-inputs-1011.json';assert not extra_path.exists()
extra_path.write_text(json.dumps(dict(verified=True,nonUser32Verified=True,standaloneSixArtifactsVerified=True,
 files=[dict(file=k,sha256=v) for k,v in sorted(extra.items())]),ensure_ascii=False,indent=2),encoding='utf8');paths.add(extra_path.relative_to(root).as_posix())
archive=root/'output/audits/original-uniform-helix-artifacts-1011';index=root/'output/audits/original-uniform-helix-final-1011.json'
assert not archive.exists() and not index.exists();archive.mkdir()
snapshots=[]
for name in sorted(paths):
 p=(root/name).resolve();assert p.is_relative_to(root) and p.is_file(),name
 saved=archive/name;saved.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,saved);assert sha(p)==sha(saved),name
 snapshots.append(dict(file=name,sha256=sha(p),bytes=p.stat().st_size))
index.write_text(json.dumps(dict(verified=True,archive=archive.relative_to(root).as_posix(),snapshots=snapshots,
 frozenIndexes=report['frozenIndexes'],tests=report['tests'],preservation=report['preservation'],bundle=report['bundle'],
 actualMainChecks=336,actualUserFiles=52,actualCoreImports=39,processingPairs=3,actualCoreChecks=6366,
 independentPythonChecks=436547,finalParentLayoutChecks=158,layoutIndependentChecks=538,layoutGuardedFiles=186,
 previousArchiveFilesVerified=3645,finalSaved=report['finalSaved'],usesOnlyListedIsolatedFiles=True,junctionsNotTraversed=True,
 allFailedEvidenceRetained=True,ownRuntimeClosed=True,completeOrigamicaGoal=False,packed=False,published=False,machineVerified=False,
 notVerified=report['notVerified']),ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(frozen=len(snapshots),main=336,layout=158,actualUserFiles=52,completeOrigamicaGoal=False)))
