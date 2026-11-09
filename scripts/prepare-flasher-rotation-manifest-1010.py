from pathlib import Path
import hashlib
import json

base=Path.cwd()/'output/parallel/original-flasher-rotation-budget-1010'
original=base/'rotation-manifest.json'
assert hashlib.sha256(original.read_bytes()).hexdigest()=='2ef89427867afad0052b8fc4e560efd772ffa9c74670005bf3e99df3f5a62344'
raw=json.loads(original.read_text(encoding='utf8'))
assert not raw['productionEdited'] and raw['fileCount']==16
assert raw['patchSha256']=='59ef8278a8659525153841d935db2d510e1c10308a9e6d37fd0c009021e1f681'
manifest={'patchSha256':raw['patchSha256'],'sourceManifest':str(original),
          'sourceManifestSha256':hashlib.sha256(original.read_bytes()).hexdigest(),
          'files':[{'target':r['path'],'baselineSha256':r['beforeSha256'],
                    'sha256':r['afterSha256'],'source':str(base/'delivery/after'/r['path'])} for r in raw['files']]}
with (base/'root-integration-manifest.json').open('x',encoding='utf8') as stream:
    json.dump(manifest,stream,indent=2)
print('Prepared original Flasher rotation budget adapter; MinTotal baseline retained.')
