from pathlib import Path
import hashlib
import json

root=Path.cwd().resolve()
def write_adapter(folder, manifest_path, patch_path, files):
    base=root/'output/parallel'/folder
    original=base/manifest_path
    patch=base/patch_path
    manifest={'patchSha256':hashlib.sha256(patch.read_bytes()).hexdigest(),
              'sourceManifest':str(original),
              'sourceManifestSha256':hashlib.sha256(original.read_bytes()).hexdigest(),
              'files':files,'producerManifestUnchanged':True}
    with (base/'root-integration-manifest.json').open('x',encoding='utf8') as stream:
        json.dump(manifest,stream,indent=2)

base=root/'output/parallel/flasher-input-contract-1010'
raw=json.loads((base/'delivery/manifest.json').read_text(encoding='utf8'))
assert raw['verified']
assert raw['patchSha256']=='dce37afb8a6445753ea4f4476b55c12966df86b9b232198be888f7a7f18220b6'
write_adapter('flasher-input-contract-1010','delivery/manifest.json','delivery/flasher-input-contract.patch',[
    {'target':row['file'],'baselineSha256':row['beforeSha256'],
     'sha256':row['afterSha256'],'source':str(base/'delivery'/row['fullFile'])}
    for row in raw['targets']])

base=root/'output/parallel/dual-faces-root-review-1010'
raw=json.loads((base/'flagstone-manifest.json').read_text(encoding='utf8'))
write_adapter('dual-faces-root-review-1010','flagstone-manifest.json','flagstone-dual-faces.patch',[
    {'target':row['file'],'baselineSha256':row['before'],
     'sha256':row['after'],'source':str(base/row['file'])}
    for row in raw['files']])
print('Prepared immutable delivery adapters for input contract and flagstone faces.')
