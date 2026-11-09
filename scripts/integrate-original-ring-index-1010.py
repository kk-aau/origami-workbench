from pathlib import Path
import hashlib,json,shutil,subprocess
root=Path.cwd().resolve();base=root/'output/parallel/original-ring-index-conditions-1010'
manifest=json.loads((base/'ring-index-integration-manifest.json').read_text(encoding='utf8'))
backup=root/'output/parallel/integration-original-ring-index-1010-before';assert not backup.exists()
patch=base/'ring-index-production.patch';assert hashlib.sha256(patch.read_bytes()).hexdigest()==manifest['patchSha256']
records=[]
for item in manifest['files']:
 target,source=(root/item['target']).resolve(),(base/item['target']).resolve()
 assert target.is_relative_to(root) and source.is_relative_to(base)
 assert hashlib.sha256(source.read_bytes()).hexdigest()==item['deliverySha256'],item['target']
 before=hashlib.sha256(target.read_bytes()).hexdigest() if target.exists() else None
 assert before==item.get('baselineSha256'),item['target']
 records.append({'file':item['target'],'before':before,'after':item['deliverySha256']})
checked=subprocess.run(['git','apply','--check',str(patch)],cwd=root,capture_output=True,text=True,encoding='utf8');assert checked.returncode==0,checked.stderr
backup.mkdir(parents=True)
for item in records:
 target=root/item['file']
 if target.exists():
  saved=backup/item['file'];saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,saved)
(backup/'before.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
applied=subprocess.run(['git','apply',str(patch)],cwd=root,capture_output=True,text=True,encoding='utf8');assert applied.returncode==0,applied.stderr
for item in manifest['files']:
 target,source=root/item['target'],base/item['target']
 if item['kind']=='new fixture separate from patch':
  assert not target.exists();target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(source.read_bytes())
 else:
  assert target.read_text(encoding='utf8')==source.read_text(encoding='utf8'),item['target']
  if target.read_bytes()!=source.read_bytes():target.write_bytes(source.read_bytes())
 assert hashlib.sha256(target.read_bytes()).hexdigest()==item['deliverySha256']
(root/'output/parallel/original-ring-index-integrated-1010.json').write_text(json.dumps({'verified':True,'files':records},ensure_ascii=False,indent=2),encoding='utf8')
print('Integrated seven real ring-index conditional CP source/API/UI/test files, preserving all captured baseline work.')
