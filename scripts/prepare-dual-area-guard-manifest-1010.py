from pathlib import Path
import hashlib
import json

base=Path.cwd()/'output/parallel/dual-faces-root-review-1010'
delivery=base/'area-guard-delivery'
original=delivery/'area-guard-manifest.json'
raw=json.loads(original.read_text(encoding='utf8'))
manifest={'patchSha256':hashlib.sha256((delivery/'dual-faces-area-guard.patch').read_bytes()).hexdigest(),
          'sourceManifest':str(original),'sourceManifestSha256':hashlib.sha256(original.read_bytes()).hexdigest(),
          'files':[{'target':r['file'],'baselineSha256':r['before'],'sha256':r['after'],
                    'source':str(delivery/r['file'])} for r in raw['files']]}
with (base/'root-area-integration-manifest.json').open('x',encoding='utf8') as stream:
    json.dump(manifest,stream,indent=2)
print('Prepared dual area guard immutable adapter.')
