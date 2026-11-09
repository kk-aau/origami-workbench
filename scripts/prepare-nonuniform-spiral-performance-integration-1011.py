from pathlib import Path
import hashlib
import json
import shutil

root = Path.cwd().resolve()
base = root / 'output/parallel/original-nonuniform-spiral-3968-cp-1011/performance-001'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
index = base / 'DELTA-FROZEN-001.json'
assert sha(index) == 'a469ec44b8e812dd9d4e623e9a9a39c0132b42d680a0988af9e32e9fc902e927'
packet = json.loads(index.read_text(encoding='utf8'))
assert packet['verified'] is True and len(packet['files']) == 15
for row in packet['files']:
    p = (base / row['path']).resolve()
    assert p.is_relative_to(base.resolve()) and sha(p) == row['sha256']
manifest = base / 'delivery/manifest.json'
assert sha(manifest) == 'f15039ccb53abc28cf612ad45a9e4d5aa080b992167a36d3fd2fc5273818b675'
author = json.loads(manifest.read_text(encoding='utf8'))
assert len(author['targets']) == 3
files = []
for row in author['targets']:
    source = (base / row['after']).resolve()
    assert source.is_relative_to(base.resolve()) and sha(source) == row['afterSha256']
    assert sha(root / row['path']) == row['beforeSha256']
    files.append(dict(target=row['path'], baselineSha256=row['beforeSha256'], sha256=row['afterSha256'], source=str(source), kind='modified'))
assert sha(base / author['patch']) == author['patchSha256']
target = base / 'root-integration-manifest-1011.json'
assert not target.exists()
target.write_text(json.dumps(dict(files=files, patchSha256=author['patchSha256'], authorFreezeSha256=sha(index), productionWritten=False),ensure_ascii=False,indent=2),encoding='utf8')
old_bundle = json.loads((root / 'output/original-nonuniform-spiral-bundle-1011.json').read_text(encoding='utf8'))
backup = root / 'output/original-nonuniform-spiral-before-performance-1011'
assert not backup.exists()
for row in old_bundle['files']:
    p = root / row['file']
    assert sha(p) == row['sha256']
    saved = backup / row['file']
    saved.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(p, saved)
    assert sha(saved) == row['sha256']
print(json.dumps(dict(verified=True, targets=3, checkedDeltaFiles=15, preservedInitialAssets=len(old_bundle['files']), patch=author['patch'])))
