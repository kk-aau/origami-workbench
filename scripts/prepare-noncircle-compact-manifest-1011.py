from pathlib import Path
import hashlib,json
root=Path.cwd().resolve();base=root/'output/parallel/original-conic-noncircle-dialog-compact-ux-1011'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
frozen=json.loads((base/'FREEZE.json').read_text(encoding='utf8'))
for row in frozen['files']:assert sha(base/(row.get('file') or row.get('path')))==row['sha256'],row
manifest=json.loads((base/'delivery-003/manifest.json').read_text(encoding='utf8'));rows=[]
for row in manifest['files']:
    assert sha(root/row['file'])==row['before'],row['file']
    after=base/'delivery-003'/row['afterFile'];assert sha(after)==row['after'],row['file']
    rows.append(dict(target=row['file'],baselineSha256=row['before'],sha256=row['after'],source=str(after)))
patch=base/'delivery-003'/manifest['patch']['file'];assert sha(patch)==manifest['patch']['sha256']
target=base/'root-integration-manifest-1011.json';assert not target.exists()
target.write_text(json.dumps(dict(files=rows,patchSha256=sha(patch),frozenFilesVerified=len(frozen['files']),scope='two existing UI files only; math handlers and original plot unchanged'),ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(targets=len(rows),frozen=len(frozen['files']))))
