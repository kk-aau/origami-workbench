from pathlib import Path
import hashlib,json
root=Path.cwd().resolve();base=root/'output/parallel/original-discrete-curve-npoints-1010'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
frozen=json.loads((base/'NPOINTS-DELIVERY-FROZEN.json').read_text(encoding='utf8'))
assert frozen['fileCount']==235
for row in frozen['files']:
    source=base/row['path'];assert source.stat().st_size==row['bytes'] and sha(source)==row['sha256'],row['path']
original=json.loads((base/'delivery-final/manifest.json').read_text(encoding='utf8'))
assert sha(base/'delivery-final/manifest.json')==frozen['manifestSha256']
patch=base/'delivery-final/changes.patch';assert sha(patch)==frozen['patchSha256']
previous=json.loads((root/'output/audits/original-constructible-final-1011.json').read_text(encoding='utf8'))
assert previous['verified'] and len(previous['snapshots'])==3825
for row in previous['snapshots']:assert sha(root/previous['archive']/row['file'])==row['sha256'],row['file']
items=[]
for row in original['files']:
    name=row['path'];target=root/name;source=base/'delivery-final/after'/name
    assert sha(source)==row['afterSha256'],name
    assert (sha(target) if target.exists() else None)==row['beforeSha256'],name
    items.append(dict(target=name,baselineSha256=row['beforeSha256'],sha256=row['afterSha256'],source=str(source)))
output=base/'root-integration-manifest-1011.json';assert not output.exists()
output.write_text(json.dumps(dict(patchSha256=sha(patch),files=items,producerFrozenFilesVerified=235,previousP54FrozenFilesVerified=3825,
    numericalAndDXFCoreProtected=True,producerManifestSha256=frozen['manifestSha256']),ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(targets=len(items),producerFrozenVerified=235,previousP54FrozenVerified=3825)))
