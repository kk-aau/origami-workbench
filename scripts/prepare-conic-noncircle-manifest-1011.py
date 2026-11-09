from pathlib import Path
import hashlib,json,sys
root=Path.cwd().resolve();base=root/'output/parallel/original-conic-noncircle-cp-1010'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
index=(base/sys.argv[1]).resolve();assert index.is_relative_to(base)
frozen=json.loads(index.read_text(encoding='utf8'))
for row in frozen['files']:
    file=base/(row.get('file') or row.get('path'));assert sha(file)==row['sha256'],file
source=json.loads((base/'SOURCE-CONTRACT-FROZEN.json').read_text(encoding='utf8'))
for row in source['files']:assert sha(base/row['path'])==row['sha256'],row['path']
old=json.loads((root/'output/audits/original-conic-circle-final-1011.json').read_text(encoding='utf8'))
for row in old['snapshots']:assert sha(root/old['archive']/row['file'])==row['sha256'],row['file']
manifest=json.loads((base/'integration-002/delivery/manifest.json').read_text(encoding='utf8'))
for name,value in manifest['protectedProductionFiles'].items():assert sha(root/name)==value,name
for row in manifest['externalIndependentReviews']:
    assert sha(root/row['path'])==row['sha256'],row['path']
for name in ['source-phase-freeze.json','helper-final-review-freeze.json']:
    folder=root/'output/parallel/original-conic-noncircle-independent-source-review-1011'
    external=json.loads((folder/name).read_text(encoding='utf8'))
    for row in external['files']:assert sha(folder/(row.get('file') or row.get('path')))==row['sha256'],row
rows=[]
for row in manifest['targets']:
    target=root/row['path'];before=sha(target) if target.exists() else None
    assert before==row['beforeSHA256'],row['path']
    after=base/'integration-002/delivery/after'/row['path'];assert sha(after)==row['afterSHA256'],row['path']
    rows.append(dict(target=row['path'],baselineSha256=before,sha256=row['afterSHA256'],source=str(after)))
patch=base/'integration-002/delivery'/manifest['patch']['path'];assert sha(patch)==manifest['patch']['sha256']
target=base/'root-integration-manifest-1011.json';assert not target.exists()
target.write_text(json.dumps(dict(files=rows,patchSha256=sha(patch),finalFreeze=str(index.relative_to(base)),frozenFilesVerified=len(frozen['files']),sourcePhaseFilesVerified=len(source['files']),previousP56FrozenFilesVerified=len(old['snapshots']),externalReviewsVerified=True),ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(targets=len(rows),frozen=len(frozen['files']),previous=len(old['snapshots']),backendAndDXFUnchanged=True)))
