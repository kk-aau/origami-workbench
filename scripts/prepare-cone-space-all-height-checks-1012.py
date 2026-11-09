from pathlib import Path
import hashlib, json, difflib, shutil

root = Path.cwd().resolve()
work = root / 'output/parallel/cone-space-check-snapshot-005-1012/work'
out = root / 'output/parallel/cone-space-all-height-delta-1012'
assert not out.exists()
out.mkdir()
name = 'src/components/GenericSpacePaperBridgeDialog.css'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
p = root / name
assert sha(p) == sha(work / name)
old = p.read_text(encoding='utf8')
assert old.count('@media(max-height:690px)') == 2
new = old.replace('@media(max-height:690px)', '@media(max-height:860px)')
dest = out / name
dest.parent.mkdir(parents=True)
dest.write_text(new, encoding='utf8')
patch = out / 'all-height.patch'
patch.write_text(''.join(difflib.unified_diff(old.splitlines(True), new.splitlines(True), fromfile='a/'+name, tofile='b/'+name)), encoding='utf8')
(out / 'manifest.json').write_text(json.dumps(dict(files=[dict(target=name,source=str(dest),baselineSha256=sha(p),sha256=sha(dest),kind='replace')],patchSha256=sha(patch),reason='Keep every control and hint above footer in both 640px and 768px height windows'),ensure_ascii=False,indent=2),encoding='utf8')
runner = (work / 'scripts/run-cone-space-checks-007-1012.mjs').read_text(encoding='utf8')
runner = runner.replace("file='../../../cone-space-checks-007-1012.json',log='../../../cone-space-checks-007-1012.log',baseFile='../../../cone-space-checks-006-1012.json'", "file='../../../cone-space-checks-008-1012.json',log='../../../cone-space-checks-008-1012.log',baseFile='../../../cone-space-checks-007-1012.json'").replace('parallel/cone-space-final-height-delta-1012/manifest.json', 'parallel/cone-space-all-height-delta-1012/manifest.json')
(work / 'scripts/run-cone-space-checks-008-1012.mjs').write_text(runner, encoding='utf8')
