from pathlib import Path
import hashlib
import json
import shutil
import subprocess

root = Path.cwd().resolve()
base = root / 'output/parallel/continuous-sources-1010'
manifest = json.loads((base / 'manifest.json').read_text(encoding='utf8'))['files']
patch = base / 'continuous-sources.patch'
backup = root / 'output/parallel/integration-continuous-sources-1010-before'
assert not backup.exists(), 'Preserve the previous integration baseline'
records = []
for item in manifest:
    target, source = (root / item['path']).resolve(), (base / item['path']).resolve()
    assert target.is_relative_to(root) and source.is_relative_to(base.resolve())
    assert hashlib.sha256(source.read_bytes()).hexdigest() == item['sha256'], item['path']
    records.append({'file': item['path'], 'before': hashlib.sha256(target.read_bytes()).hexdigest() if target.exists() else None, 'after': item['sha256']})
checked = subprocess.run(['git', 'apply', '--check', str(patch)], cwd=root, capture_output=True, text=True, encoding='utf8')
assert checked.returncode == 0, checked.stderr
backup.mkdir(parents=True)
for item in records:
    target = root / item['file']
    if target.exists():
        saved = backup / item['file']
        saved.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(target, saved)
(backup / 'before.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf8')
applied = subprocess.run(['git', 'apply', str(patch)], cwd=root, capture_output=True, text=True, encoding='utf8')
assert applied.returncode == 0, applied.stderr
for item in manifest:
    target, source = root / item['path'], base / item['path']
    assert target.read_text(encoding='utf8') == source.read_text(encoding='utf8'), item['path']
    if target.read_bytes() != source.read_bytes():
        target.write_bytes(source.read_bytes())
    assert hashlib.sha256(target.read_bytes()).hexdigest() == item['sha256']
(root / 'output/parallel/continuous-sources-integrated-1010.json').write_text(json.dumps({'verified': True, 'files': records}, ensure_ascii=False, indent=2), encoding='utf8')
print('Integrated nine continuous curve source files; previous contents preserved.')
