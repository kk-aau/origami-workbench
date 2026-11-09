from pathlib import Path
import hashlib
import json

base=Path.cwd()/'output/parallel/original-min-total-pleat-1010'
delivery=base/'delivery'
original=delivery/'manifest.json'
raw=json.loads(original.read_text(encoding='utf8'))
assert raw['productionReadOnly'] and raw['targetCount']==9
assert raw['patchSha256']=='8ae2a98c2f9999d150d332b50a2cbae86c7939d2eee14b2fd53d295bf99129b5'
manifest={'patchSha256':raw['patchSha256'],'sourceManifest':str(original),
          'sourceManifestSha256':hashlib.sha256(original.read_bytes()).hexdigest(),
          'files':[{'target':r['path'],'baselineSha256':r['beforeSha256'],
                    'sha256':r['afterSha256'],'source':str(delivery/r['path'])} for r in raw['targets']]}
with (base/'root-integration-manifest.json').open('x',encoding='utf8') as stream:
    json.dump(manifest,stream,indent=2)
print('Prepared immutable MinTotalPleat adapter; current root guard preserved.')
