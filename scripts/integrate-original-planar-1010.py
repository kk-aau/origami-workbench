from pathlib import Path
import hashlib,json,shutil,subprocess
root=Path.cwd().resolve();base=root/'output/parallel/planarize-ledger-1010'
manifest=json.loads((base/'integration-manifest.json').read_text(encoding='utf8'))
patch=base/'planar-functions.patch';backup=root/'output/parallel/integration-original-planar-1010-before'
assert not backup.exists()
assert hashlib.sha256(patch.read_bytes()).hexdigest()=='4e584481bd6048fa8c2847584856b759a5d447b1fad0d1dda68b3b7f9c817b12'
pleat=json.loads((root/'output/parallel/original-pleat-integrated-1010.json').read_text(encoding='utf8'))
common={x['file']:x['after'] for x in pleat['files'] if x['file'] in ('server.mjs','backend/tessellate.py')}
records=[]
for item in manifest:
 target=(root/item['target']).resolve();source=Path(item['source']).resolve()
 assert target.is_relative_to(root) and source.is_relative_to(base)
 assert hashlib.sha256(source.read_bytes()).hexdigest()==item['sha256'],item['target']
 before=hashlib.sha256(target.read_bytes()).hexdigest() if target.exists() else None
 assert before==common.get(item['target'],item['baseline_sha256']),item['target']
 records.append({'file':item['target'],'before':before,'producerAfter':item['sha256']})
server=root/'server.mjs';original=server.read_text(encoding='utf8');merged=original
for old,new in [
 (" || url.pathname === '/api/tessellation/curved-system-helpers-generic'"," || url.pathname === '/api/tessellation/planar-functions' || url.pathname === '/api/tessellation/curved-system-helpers-generic'"),
 ("url.pathname==='/api/tessellation/curved-system-helpers-generic'?'curved-system-helpers-generic':","url.pathname==='/api/tessellation/planar-functions'?'planar-functions':url.pathname==='/api/tessellation/curved-system-helpers-generic'?'curved-system-helpers-generic':")]:
 assert merged.count(old)==1,old;merged=merged.replace(old,new)
for endpoint in ('test-pleat','archimedean-vertex-figure','gore-data'):
 assert merged.count('/api/tessellation/'+endpoint)==original.count('/api/tessellation/'+endpoint)==2
checked=subprocess.run(['git','apply','--check','--exclude=server.mjs',str(patch)],cwd=root,capture_output=True,text=True,encoding='utf8')
assert checked.returncode==0,checked.stderr
backup.mkdir(parents=True)
for item in records:
 target=root/item['file']
 if target.exists():
  saved=backup/item['file'];saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,saved)
(backup/'before.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
applied=subprocess.run(['git','apply','--exclude=server.mjs',str(patch)],cwd=root,capture_output=True,text=True,encoding='utf8')
assert applied.returncode==0,applied.stderr
server.write_text(merged,encoding='utf8',newline='')
for item,record in zip(manifest,records):
 target=root/item['target'];source=Path(item['source'])
 if item['target'] not in common:
  assert target.read_text(encoding='utf8')==source.read_text(encoding='utf8'),item['target']
  if target.read_bytes()!=source.read_bytes():target.write_bytes(source.read_bytes())
 record['after']=hashlib.sha256(target.read_bytes()).hexdigest()
(root/'output/parallel/original-planar-integrated-1010.json').write_text(json.dumps({'verified':True,'files':records,'sharedFilesMergedIncrementally':['server.mjs','backend/tessellate.py']},ensure_ascii=False,indent=2),encoding='utf8')
print('Integrated eleven Planarize/Unplanarize files, preserving VertexFigure, TestPleat and Gore routes.')
