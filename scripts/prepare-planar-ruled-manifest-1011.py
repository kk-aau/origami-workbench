from pathlib import Path
import hashlib,json
root=Path.cwd().resolve();base=root/'output/parallel/original-planar-ruled-build-cp-4040-1011'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
frozen=json.loads((base/'freeze.json').read_text(encoding='utf8'))
for row in frozen['files']:assert sha(base/row['path'])==row['sha256'],row['path']
old=json.loads((root/'output/audits/original-conic-noncircle-final-1011.json').read_text(encoding='utf8'))
for row in old['snapshots']:assert sha(root/old['archive']/row['file'])==row['sha256'],row['file']
manifest=json.loads((base/'manifest.json').read_text(encoding='utf8'));rows=[]
for row in manifest['targets']:
    assert not (root/row['path']).exists(),row['path']
    after=base/'delivery/after'/row['path'];assert sha(after)==row['sha256'],row['path']
    rows.append(dict(target=row['path'],baselineSha256=None,sha256=row['sha256'],source=str(after)))
patch=base/manifest['patch'];assert sha(patch)==manifest['patchSha256']
target=base/'root-integration-manifest-1011.json';assert not target.exists()
target.write_text(json.dumps(dict(files=rows,patchSha256=sha(patch),frozenFilesVerified=len(frozen['files']),previousP57FrozenFilesVerified=len(old['snapshots']),allFiveFilesNew=True),ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(targets=len(rows),frozen=len(frozen['files']),previous=len(old['snapshots']))))
