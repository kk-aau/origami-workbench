from pathlib import Path
import hashlib
import json
import shutil
import subprocess

root = Path.cwd().resolve()
base = root / 'output/parallel/continuous-source-nodes-1010'
manifest = json.loads((base / 'manifest.json').read_text(encoding='utf8'))
files = manifest['node_patch'] + manifest['v15_freeze_patch']
patches = [base / 'node-sources.patch', base / 'v15-auxiliary-freeze.patch']
backup = root / 'output/parallel/integration-continuous-nodes-1010-before'
assert not backup.exists()
records = []
for item in files:
    target, source = (root / item['path']).resolve(), (base / item['path']).resolve()
    assert target.is_relative_to(root) and source.is_relative_to(base)
    assert hashlib.sha256(source.read_bytes()).hexdigest() == item['sha256']
    records.append({'file': item['path'], 'before': hashlib.sha256(target.read_bytes()).hexdigest() if target.exists() else None, 'baseline': item['baseline_sha256'], 'sourceAfter': item['sha256']})
for patch in patches:
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
for patch in patches:
    applied = subprocess.run(['git', 'apply', str(patch)], cwd=root, capture_output=True, text=True, encoding='utf8')
    assert applied.returncode == 0, applied.stderr
for item in records:
    target, source = root / item['file'], base / item['file']
    if item['before'] is None or item['before'] == item['baseline']:
        assert target.read_text(encoding='utf8') == source.read_text(encoding='utf8'), item['file']
        if target.read_bytes() != source.read_bytes():
            target.write_bytes(source.read_bytes())
    item['mergedAfter'] = hashlib.sha256(target.read_bytes()).hexdigest()
(root / 'output/parallel/continuous-nodes-integrated-1010.json').write_text(json.dumps({'verified': True, 'files': records}, ensure_ascii=False, indent=2), encoding='utf8')
print('Integrated persistent Bezier nodes plus a frozen actual v15 compatibility fixture; root schema edits preserved.')
