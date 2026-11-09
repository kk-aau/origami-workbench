from pathlib import Path
import hashlib
import json

root=Path.cwd().resolve()
base=root/'output/parallel/original-flasher-factors-1010'
original=base/'patch-manifest.json';raw=json.loads(original.read_text(encoding='utf8'))
assert raw['verified']
patch=base/'flasher-factors-incremental.patch'
patch_sha='1d9a0972520ef44e3b14d6704545ffce1fdee2fa45e0013a46ceaa070f01d98c'
assert hashlib.sha256(patch.read_bytes()).hexdigest()==patch_sha
files=[]
for row in raw['targets']:
    source=base/'work'/row['file']
    assert hashlib.sha256(source.read_bytes()).hexdigest()==row['afterSha256']
    files.append({'target':row['file'],'baselineSha256':row['baselineSha256'],'sha256':row['afterSha256'],'source':str(source)})
target=base/'root-integration-manifest.json';assert not target.exists()
target.write_text(json.dumps({'patchSha256':patch_sha,'sourceManifest':str(original),'sourceManifestSha256':hashlib.sha256(original.read_bytes()).hexdigest(),'files':files,'producerManifestUnchanged':True},indent=2),encoding='utf8')

base=root/'output/parallel/original-dual-faces-1010'
original=base/'evidence/resume-manifest.json';raw=json.loads(original.read_text(encoding='utf8'))
patch=base/'implementation.patch'
patch_sha='6987b683109b9b32324dbca1d16a28fe85a936035ac8bb290879e692d883b5d9'
assert hashlib.sha256(patch.read_bytes()).hexdigest()==patch_sha
files=[]
for row in raw['files']:
    source=base/row['result']['file']
    assert hashlib.sha256(source.read_bytes()).hexdigest()==row['result']['sha256']
    files.append({'target':row['path'],'baselineSha256':row.get('baseline',{}).get('sha256'),'sha256':row['result']['sha256'],'source':str(source)})
target=base/'root-integration-manifest.json';assert not target.exists()
target.write_text(json.dumps({'patchSha256':patch_sha,'sourceManifest':str(original),'sourceManifestSha256':hashlib.sha256(original.read_bytes()).hexdigest(),'files':files,'producerManifestUnchanged':True},indent=2),encoding='utf8')
print('Prepared hash-verified adapter manifests for two immutable deliveries; original evidence untouched.')
