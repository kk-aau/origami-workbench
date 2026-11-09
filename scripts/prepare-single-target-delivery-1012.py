from pathlib import Path
import argparse, hashlib, json, shutil

p=argparse.ArgumentParser()
p.add_argument('base');p.add_argument('output');p.add_argument('patch');p.add_argument('freeze_sha')
a=p.parse_args();root=Path.cwd().resolve();base=root/'output/parallel'/a.base;out=root/'output/parallel'/a.output
sha=lambda f:hashlib.sha256(Path(f).read_bytes()).hexdigest()
assert not out.exists()
assert sha(base/'freeze.json')==a.freeze_sha
m=json.loads((base/'manifest.json').read_text(encoding='utf8'));items=m['files']
if items and 'target' not in items[0]:
    items=[dict(target=m['target'],source=str(base/'candidate'/m['target']),baselineSha256=None,sha256=m['targetSHA256'])]
assert len(items)==1
r=items[0];name=Path(r['target']);name=name.relative_to(root) if name.is_absolute() else name
source=Path(r['source']);assert source.resolve().is_relative_to(base.resolve())
assert sha(source)==r['sha256']
before=sha(root/name) if (root/name).exists() else None
assert before==r['baselineSha256']
patch=base/a.patch
patch_sha=m.get('patchSha256',m.get('patchSHA256')) or next(r['sha256'] for r in m['files'] if r.get('path')==a.patch)
assert sha(patch)==patch_sha
dest=out/name;dest.parent.mkdir(parents=True);shutil.copy2(source,dest)
shutil.copy2(patch,out/'change.patch')
(out/'manifest.json').write_text(json.dumps(dict(files=[dict(target=name.as_posix(),source=str(dest),baselineSha256=before,sha256=sha(dest),kind='replace' if before else 'new')],patchSha256=sha(patch),originalManifestSHA256=sha(base/'manifest.json'),originalFreezeSHA256=sha(base/'freeze.json')),ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(verified=True,target=name.as_posix()),ensure_ascii=False))
