from pathlib import Path
import hashlib, json, shutil

root = Path.cwd().resolve()
base = root/'output/parallel/strain-tq-api-tests-delivery-1012'
out = root/'output/parallel/strain-tq-api-tests-root-delivery-1012'
assert not out.exists()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(base/'manifest.json') == '0b2fc198ab1422989ae41895bb69804b34ff427b00442f12d90b5c7401545739'
assert sha(base/'freeze.json') == '9d1b597b4250e156f8194019eb63919f3d1a77ee2767a53cc70249874773b3f1'
name = 'tests/strain-tq-practical-api.test.mjs'
source = base/'candidate'/name
assert not (root/name).exists()
assert sha(source) == '65b450d04bdfafb0c16e09b5da9776be6cb8c8e02047f2c87f1c866acd9165dc'
dest = out/name
dest.parent.mkdir(parents=True)
shutil.copy2(source,dest)
patch = base/'candidate.patch'
assert sha(patch) == '5a4e598243b39d873f722e05c787b275390323675661af18e536262604e294dd'
shutil.copy2(patch,out/'api.patch')
(out/'manifest.json').write_text(json.dumps(dict(files=[dict(target=name,source=str(dest),baselineSha256=None,sha256=sha(dest),kind='new')],patchSha256=sha(patch),originalManifestSHA256=sha(base/'manifest.json'),originalFreezeSHA256=sha(base/'freeze.json')),ensure_ascii=False,indent=2),encoding='utf8')
print('Verified exact TQ API delivery, one new target.')
