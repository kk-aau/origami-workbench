from pathlib import Path
import json, hashlib, shutil

root=Path.cwd().resolve()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
base=root/'output/parallel/strain-tq-practical-cp-1012'
out=root/'output/parallel/strain-tq-core-root-delivery-1012'
assert not out.exists()
out.mkdir()
assert sha(base/'manifest.json')=='fc6baf895892c0f729606547fe45080fcdfdaad8a9553e049bb4930be414f8cf'
assert sha(base/'freeze.json')=='d229121e29146a60ea6d6b3df57088c83fe6f2bd5ba3a7aaaa90fc29895e3ce4'
manifest=json.loads((base/'manifest.json').read_text(encoding='utf8'))
files=[]
for r in manifest['targets']:
    name=r['path']
    p=base/'candidate'/name
    assert sha(p)==r['sha256'] and not (root/name).exists(),name
    dest=out/name
    dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(p,dest)
    files.append(dict(target=name,source=str(dest),baselineSha256=None,sha256=r['sha256'],kind='new'))
patch=base/'candidate.patch'
assert sha(patch)=='c325799d61f27ffd8ae645947b3a62f1abae11f8607089ea2b6dd0baae80edba'
shutil.copy2(patch,out/'core.patch')
(out/'manifest.json').write_text(json.dumps(dict(files=files,patchSha256=sha(patch),originalManifestSHA256=sha(base/'manifest.json'),originalFreezeSHA256=sha(base/'freeze.json')),ensure_ascii=False,indent=2),encoding='utf8')
