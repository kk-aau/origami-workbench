from pathlib import Path
import hashlib,json,shutil,subprocess

root=Path.cwd().resolve()
base=root/'output/parallel/high-even-1010'
patch=base/'high-even-production.patch'
manifest=json.loads((base/'integration-manifest.json').read_text(encoding='utf8'))
backup=root/'output/parallel/integration-high-even-1010-before'
assert not backup.exists(), 'Do not overwrite the integration baseline'
records=[]
for item in manifest:
    target=(root/item['target']).resolve(); source=Path(item['source']).resolve()
    assert target.is_relative_to(root) and source.is_relative_to(base.resolve())
    assert hashlib.sha256(source.read_bytes()).hexdigest()==item['sha256'],item['target']
    records.append({'file':item['target'],'before':hashlib.sha256(target.read_bytes()).hexdigest() if target.exists() else None,'after':item['sha256']})
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
for item in manifest:
    if item['kind']=='new-fixture-copy':
        target=root/item['target'];assert not target.exists();target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(item['source'],target)
for item in records:
    assert hashlib.sha256((root/item['file']).read_bytes()).hexdigest()==item['after'],item['file']
print('Integrated seven verified high-even source/test/fixture files; prior contents retained independently.')
