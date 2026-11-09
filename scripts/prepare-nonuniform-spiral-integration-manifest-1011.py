from pathlib import Path
import hashlib
import json
import sys

root = Path.cwd().resolve()
base = root / 'output/parallel/original-nonuniform-spiral-3968-cp-1011'
hash_file = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
index = base / sys.argv[1]
assert index.is_relative_to(base)
assert hash_file(index) == sys.argv[2]
packet = json.loads(index.read_text(encoding='utf8'))
assert packet['verified'] is True and packet['targetCount'] == 5
for row in packet['files']:
    p = (base / row['path']).resolve()
    assert p.is_relative_to(base.resolve()), row['path']
    assert hash_file(p) == row['sha256'], row['path']
manifest_files = [base / row['path'] for row in packet['files']
    if row['path'].endswith('/manifest.json') and row['sha256'] == packet['manifestSha256']]
assert len(manifest_files) == 1
author_file = manifest_files[0]
assert hash_file(author_file) == packet['manifestSha256']
author = json.loads(author_file.read_text(encoding='utf8'))
assert author['validation']['typecheckExitCode'] == 0 and author['validation']['focusedTestsPassed'] == 27
targets = {'src/app/nonuniformSpiralCP3968.ts','src/components/NonuniformSpiralCP3968Dialog.tsx',
    'src/components/NonuniformSpiralCP3968Dialog.css','tests/app/nonuniformSpiralCP3968.test.ts',
    'tests/fixtures/nonuniform-spiral-cp-3968-20261011.json'}
assert len(author['targets']) == 5 and {r['path'] for r in author['targets']} == targets
files = []
for row in author['targets']:
    assert row['before'] is None and row['beforeSha256'] is None
    source = (base / row['after']).resolve()
    assert source.is_relative_to(base.resolve()) and hash_file(source) == row['sha256']
    assert not (root / row['path']).exists(), row['path']
    files.append(dict(target=row['path'],baselineSha256=None,sha256=row['sha256'],source=str(source),kind='new'))
assert hash_file(base / author['patch']) == author['patchSha256']
out = base / 'root-integration-manifest-1011.json'
assert not out.exists()
out.write_text(json.dumps(dict(files=files,patchSha256=author['patchSha256'],
    authorFreeze=str(index.relative_to(base)),authorFreezeSha256=hash_file(index),
    authorManifest=str(author_file.relative_to(base)),authorManifestSha256=hash_file(author_file),
    originalFrozenAuthorFilesUnchanged=True,productionWritten=False),ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(verified=True,targets=5,patch=author['patch'],checkedAuthorFiles=len(packet['files']))))
