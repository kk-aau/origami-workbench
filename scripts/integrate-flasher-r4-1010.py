from pathlib import Path
import hashlib
import json
import shutil
import subprocess

root = Path.cwd().resolve()
base = root / 'output/parallel/original-remaining-1010'
manifest = json.loads((base / 'integration-manifest.json').read_text(encoding='utf8'))
patch = base / 'original-remaining-production.patch'
backup = root / 'output/parallel/integration-flasher-r4-1010-before'
assert not backup.exists()
records = []
for item in manifest:
    target, source = (root / item['target']).resolve(), Path(item['source']).resolve()
    assert target.is_relative_to(root) and source.is_relative_to(base)
    assert hashlib.sha256(source.read_bytes()).hexdigest() == item['sha256']
    records.append({'file': item['target'], 'before': hashlib.sha256(target.read_bytes()).hexdigest() if target.exists() else None, 'after': item['sha256']})
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
    target, source = root / item['target'], Path(item['source'])
    if item['kind'] == 'new-fixture-copy':
        assert not target.exists()
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())
    else:
        assert target.read_text(encoding='utf8') == source.read_text(encoding='utf8'), item['target']
        if target.read_bytes() != source.read_bytes():
            target.write_bytes(source.read_bytes())
    assert hashlib.sha256(target.read_bytes()).hexdigest() == item['sha256']
(root / 'output/parallel/flasher-r4-integrated-1010.json').write_text(json.dumps({'verified': True, 'files': records}, ensure_ascii=False, indent=2), encoding='utf8')
print('Integrated nine original Flasher r4 domain files with preserved baselines.')
