from pathlib import Path
import hashlib
import json
import shutil
import subprocess

root = Path.cwd().resolve()
base = root / 'output/parallel/complex-holes-1010/delivery'
manifest = json.loads((base / 'manifest.json').read_text(encoding='utf8'))['files']
backup = root / 'output/parallel/integration-curve-holes-1010-before'
assert not backup.exists()
patch = base / 'curve-holes-first-batch.patch'
records = []
for item in manifest:
    target, source = (root / item['target']).resolve(), (base / 'files' / item['target']).resolve()
    assert target.is_relative_to(root) and source.is_relative_to(base)
    assert hashlib.sha256(source.read_bytes()).hexdigest() == item['newSha256']
    before = hashlib.sha256(target.read_bytes()).hexdigest() if target.exists() else None
    records.append({'file': item['target'], 'before': before, 'sourceBefore': item['originalSha256'], 'sourceAfter': item['newSha256']})
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
for item in records:
    target, source = root / item['file'], base / 'files' / item['file']
    if item['before'] == item['sourceBefore'] or item['before'] is None:
        assert target.read_text(encoding='utf8') == source.read_text(encoding='utf8'), item['file']
        if target.read_bytes() != source.read_bytes():
            target.write_bytes(source.read_bytes())
    item['mergedAfter'] = hashlib.sha256(target.read_bytes()).hexdigest()
(root / 'output/parallel/curve-holes-integrated-1010.json').write_text(json.dumps({'verified': True, 'files': records}, ensure_ascii=False, indent=2), encoding='utf8')
print('Integrated 16 curve-hole files, preserving previously integrated high-even changes.')
