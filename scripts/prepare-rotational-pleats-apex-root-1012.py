from pathlib import Path
import hashlib, json, shutil

root=Path.cwd().resolve()
base=root/'output/parallel/rotational-pleats-apex-delta-1012'
out=root/'output/parallel/rotational-pleats-apex-root-delivery-1012'
assert not out.exists()
out.mkdir()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(base/'manifest.json')=='3ed00b956f422b4f8052ee315e1db40c4798fe2064fb3a0ed828b48d28956f20'
assert sha(base/'freeze.json')=='eb5c123d1b3f2e67504083efb5638e4479be878d36e346519859f2692e8d304c'
manifest=json.loads((base/'manifest.json').read_text(encoding='utf8'))
files=[]
for r in manifest['targets']:
    if r['SHA256']==r['baselineSHA256']:
        assert sha(root/r['path'])==r['SHA256']
        continue
    name=r['path']
    source=base/r['candidate']
    assert sha(source)==r['SHA256']
    actual=sha(root/name) if (root/name).exists() else None
    assert actual==r['baselineSHA256'],name
    dest=out/name
    dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(source,dest)
    files.append(dict(target=name,source=str(dest),baselineSha256=r['baselineSHA256'],sha256=r['SHA256'],kind='replace' if actual else 'new'))
patch=base/'candidate.patch'
assert sha(patch)==manifest['candidatePatchSHA256']
shutil.copy2(patch,out/'apex.patch')
(out/'manifest.json').write_text(json.dumps(dict(files=files,patchSha256=sha(patch),originalManifestSHA256=sha(base/'manifest.json'),originalFreezeSHA256=sha(base/'freeze.json'),unchangedCSSExplicitlySkipped=True),ensure_ascii=False,indent=2),encoding='utf8')
