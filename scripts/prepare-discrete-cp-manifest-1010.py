from pathlib import Path
import json,hashlib,re
root=Path.cwd().resolve();base=root/'output/parallel/original-discrete-curve-cp-1010'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for name in ['DISCRETE-CURVE-CP-DELIVERY-FROZEN.json','DISCRETE-CURVE-CP-REBASED-FROZEN.json']:
 frozen=json.loads((base/name).read_text(encoding='utf8'))
 for row in frozen['files']:
  file=base/frozen['directory']/row['path'];assert sha(file)==row['sha256'],row['path']
original=json.loads((base/'delivery/manifest.json').read_text(encoding='utf8'))
rebased=json.loads((base/'rebased-delivery/manifest.json').read_text(encoding='utf8'))
original_patch=base/'delivery'/original['patch'];rebase_patch=base/'rebased-delivery'/rebased['patch']
assert sha(original_patch)==original['patchSha256'] and sha(rebase_patch)==rebased['patchSha256']
added=[row for row in original['files'] if row['operation']=='add'];assert len(added)==7
allowed={row['target'] for row in added};blocks=re.split(rb'(?=^--- (?:a/|/dev/null))',original_patch.read_bytes(),flags=re.MULTILINE)
selected=[]
for block in blocks:
 header=re.match(rb'--- [^\r\n]+\r?\n\+\+\+ b/([^\r\n]+)',block)
 if header and header[1].decode() in allowed:selected.append(block)
assert len(selected)==7
combined=base/'root-combined.patch';assert not combined.exists()
combined.write_bytes(rebase_patch.read_bytes()+b''.join(selected))
items=[]
for folder,rows in [('rebased-delivery',rebased['files']),('delivery',added)]:
 for row in rows:
  source=base/folder/row['fullFile'];target=root/row['target']
  assert sha(source)==row['afterSha256'],row['target']
  assert (sha(target) if target.exists() else None)==row['beforeSha256'],row['target']
  items.append(dict(target=row['target'],baselineSha256=row['beforeSha256'],sha256=row['afterSha256'],source=str(source)))
output=base/'root-integration-manifest.json';assert not output.exists()
output.write_text(json.dumps(dict(patchSha256=sha(combined),files=items,originalAndRebasedFrozenVerified=True,
 unchangedOriginalPatchSha256=original['patchSha256'],unchangedRebasedPatchSha256=rebased['patchSha256']),ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(targets=len(items),originalFrozenFiles=86,rebaseFrozenFiles=22,combinedOnlyCheckedHunks=True)))
