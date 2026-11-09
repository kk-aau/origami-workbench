from pathlib import Path
import hashlib
import json
import shutil
import subprocess

root=Path.cwd().resolve()
base=root/'output/parallel/original-resample-1010/delivery'
manifest=json.loads((base/'manifest.json').read_text(encoding='utf8'))
files=[{'target':item['path'],'newSha256':item['sha256'],'originalSha256':item['baselineSha256']} for item in manifest['files']];patch=base/'original-resample-linear-first-batch.patch'
assert hashlib.sha256(patch.read_bytes()).hexdigest()==manifest['patchSha256']
backup=root/'output/parallel/integration-original-resample-1010-before'
assert not backup.exists()
records=[]
for item in files:
    target,source=(root/item['target']).resolve(),(base/'files'/item['target']).resolve()
    assert target.is_relative_to(root) and source.is_relative_to(base)
    assert hashlib.sha256(source.read_bytes()).hexdigest()==item['newSha256'],item['target']
    before=hashlib.sha256(target.read_bytes()).hexdigest() if target.exists() else None
    assert before==item['originalSha256'],item['target']
    records.append({'file':item['target'],'before':before,'after':item['newSha256']})
checked=subprocess.run(['git','apply','--check',str(patch)],cwd=root,capture_output=True,text=True,encoding='utf8')
assert checked.returncode==0,checked.stderr
backup.mkdir(parents=True)
for item in records:
    target=root/item['file']
    if target.exists():
        saved=backup/item['file'];saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,saved)
(backup/'before.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
applied=subprocess.run(['git','apply',str(patch)],cwd=root,capture_output=True,text=True,encoding='utf8')
assert applied.returncode==0,applied.stderr
for item in files:
    target,source=root/item['target'],base/'files'/item['target']
    assert target.read_text(encoding='utf8')==source.read_text(encoding='utf8'),item['target']
    if target.read_bytes()!=source.read_bytes():target.write_bytes(source.read_bytes())
    assert hashlib.sha256(target.read_bytes()).hexdigest()==item['newSha256']
(root/'output/parallel/original-resample-integrated-1010.json').write_text(json.dumps({'verified':True,'files':records},ensure_ascii=False,indent=2),encoding='utf8')
print('Integrated ten explicit original linear Resample subdomain files; complete interpolation equivalence remains unclaimed.')
