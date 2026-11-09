from pathlib import Path
import hashlib
import json
import re

root = Path.cwd().resolve()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
record = root / 'output/practical-editors-checks-1011.json'
checks = json.loads(record.read_text(encoding='utf-8'))
assert checks['exitCode'] == 0 and checks['inputsUnchanged'] and checks['backendInputsUnchanged']
assert len(checks['stages']) == 8 and all(r['exitCode'] == 0 for r in checks['stages'])
for row in checks['inputs']:
    assert sha(root / row['file']) == row['sha256'], row['file']
bundle = re.search(r'src="(/assets/main-[A-Za-z0-9_-]+\.js)"', (root / 'dist/index.html').read_text(encoding='utf-8')).group(1)
files = [dict(file=p.relative_to(root).as_posix(), sha256=sha(p)) for p in sorted((root / 'dist').rglob('*')) if p.is_file()]
assert len(files) == 26 and bundle != '/assets/main-DuXBM9nI.js'
target = root / 'output/practical-editors-bundle-1011.json'
assert not target.exists()
target.write_text(json.dumps(dict(verified=True, bundle=bundle, tests=checks['tests'],
    checksRecord=record.relative_to(root).as_posix(), checksRecordSHA256=sha(record), files=files), indent=2), encoding='utf-8')
print(json.dumps(dict(verified=True, bundle=bundle, files=len(files), tests=checks['tests'])))
