from pathlib import Path
import json,hashlib
root=Path.cwd().resolve();base=root/'output/parallel/original-conic-circle-cp-1010'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
counts=[]
for folder in ['', 'rebased-delivery-002']:
    directory=base/folder;frozen=json.loads((directory/'freeze.json').read_text(encoding='utf8'))
    for row in frozen['files']:
        file=base/row['file'];assert file.stat().st_size==row['bytes'] and sha(file)==row['sha256'],row['file']
    counts.append(len(frozen['files']))
assert counts==[270,37],counts
manifest=json.loads((base/'rebased-delivery-002/manifest.json').read_text(encoding='utf8'))
assert sha(base/'freeze.json')==manifest['originalFreezeSHA256']
patch=base/'rebased-delivery-002'/manifest['patch'];assert sha(patch)==manifest['patchSHA256']
previous=json.loads((root/'output/audits/original-finite-npoints-final-1011.json').read_text(encoding='utf8'))
assert previous['verified']
for row in previous['snapshots']:assert sha(root/previous['archive']/row['file'])==row['sha256'],row['file']
items=[]
for row in manifest['targets']:
    source=base/'rebased-delivery-002'/row['after'];target=root/row['path']
    assert sha(source)==row['afterSHA256'],row['path']
    assert (sha(target) if target.exists() else None)==row['beforeSHA256'],row['path']
    items.append(dict(target=row['path'],baselineSha256=row['beforeSHA256'],sha256=row['afterSHA256'],source=str(source)))
out=base/'root-integration-manifest-1011.json';assert not out.exists()
out.write_text(json.dumps(dict(files=items,patchSha256=sha(patch),originalAndNBaseFrozenFilesVerified=counts,
    previousP55FrozenFilesVerified=len(previous['snapshots']),onlyPanelNarrowlyRebased=True),ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(targets=len(items),producerFrozen=counts,previousP55Frozen=len(previous['snapshots']))))
