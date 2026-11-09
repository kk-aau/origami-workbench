from pathlib import Path
import json,hashlib
root=Path.cwd().resolve();base=root/'output/parallel/original-across-cross-runtime-fix-1010';delivery=base/'delivery'
manifest=json.loads((delivery/'manifest.json').read_text(encoding='utf8'))
assert hashlib.sha256((delivery/'across-cross-runtime.patch').read_bytes()).hexdigest()==manifest['patchSha256']
items=[]
for row in manifest['targets']:
 source=delivery/'after'/row['path'];target=root/row['path']
 assert hashlib.sha256(source.read_bytes()).hexdigest()==row['afterSha256'],row['path']
 assert (hashlib.sha256(target.read_bytes()).hexdigest() if target.exists() else None)==row['beforeSha256'],row['path']
 items.append(dict(target=row['path'],baselineSha256=row['beforeSha256'],sha256=row['afterSha256'],source=str(source)))
output=base/'root-integration-manifest.json';assert not output.exists()
output.write_text(json.dumps(dict(patchSha256=manifest['patchSha256'],files=items),ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(targets=len(items),allBeforeAfterVerified=True)))
