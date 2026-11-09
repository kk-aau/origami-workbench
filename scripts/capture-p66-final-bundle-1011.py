from pathlib import Path
import hashlib
import json
import re

root = Path.cwd().resolve()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
checks = root / 'output/original-uniform-helix-extended-final-checks-1011.json'
run = json.loads(checks.read_text(encoding='utf-8'))
assert run['exitCode'] == 0 and run['inputsUnchanged'] and run['backendInputsUnchanged']
assert len(run['stages']) == 8 and all(row['exitCode'] == 0 for row in run['stages'])
for row in run['inputs']:
    assert sha(root / row['file']) == row['sha256'], row['file']
bundle = re.search(r'src="(/assets/main-[A-Za-z0-9_-]+\.js)"', (root / 'dist/index.html').read_text(encoding='utf-8')).group(1)
assert bundle != '/assets/main-BtVPOQ7_.js'
files = [dict(file=p.relative_to(root).as_posix(), sha256=sha(p))
         for p in sorted((root / 'dist').rglob('*')) if p.is_file()]
assert len(files) == 26
target = root / 'output/original-uniform-helix-extended-final-bundle-1011.json'
assert not target.exists()
target.write_text(json.dumps(dict(verified=True, bundle=bundle, version='0.13.6',
    tests=run['tests'], checksRecord=checks.relative_to(root).as_posix(), checksRecordSha256=sha(checks),
    files=files), ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(dict(bundle=bundle, files=len(files), tests=run['tests'])))
