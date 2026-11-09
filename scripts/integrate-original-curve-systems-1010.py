from pathlib import Path
import hashlib,json,shutil,subprocess
root=Path.cwd().resolve();base=root/'output/parallel/original-curve-systems-1010/delivery'
manifest=json.loads((base/'manifest.json').read_text(encoding='utf8'))
patch=base/'original-curve2d-systems-first-batch.patch';backup=root/'output/parallel/integration-original-curve-systems-1010-before'
assert not backup.exists()
assert hashlib.sha256(patch.read_bytes()).hexdigest()==manifest['patchSha256']
prior=json.loads((root/'output/parallel/original-planar-integrated-1010.json').read_text(encoding='utf8'))
common={x['file']:x['after'] for x in prior['files'] if x['file'] in ('server.mjs','backend/tessellate.py')}
records=[]
for item in manifest['files']:
 target=(root/item['path']).resolve();source=(base/'files'/item['path']).resolve()
 assert target.is_relative_to(root) and source.is_relative_to(base)
 assert hashlib.sha256(source.read_bytes()).hexdigest()==item['sha256'],item['path']
 before=hashlib.sha256(target.read_bytes()).hexdigest() if target.exists() else None
 assert before==common.get(item['path'],item['baselineSha256']),item['path']
 records.append({'file':item['path'],'before':before,'producerAfter':item['sha256']})
server=root/'server.mjs';original=server.read_text(encoding='utf8');merged=original
for old,new in [
 (" || url.pathname === '/api/tessellation/curved-system-helpers-generic'"," || url.pathname === '/api/tessellation/curved-curve2d-systems-native' || url.pathname === '/api/tessellation/curved-system-helpers-generic'"),
 ("url.pathname==='/api/tessellation/curved-system-helpers-generic'?'curved-system-helpers-generic':","url.pathname==='/api/tessellation/curved-curve2d-systems-native'?'curved-curve2d-systems-native':url.pathname==='/api/tessellation/curved-system-helpers-generic'?'curved-system-helpers-generic':")]:
 assert merged.count(old)==1,old;merged=merged.replace(old,new)
for endpoint in ('test-pleat','archimedean-vertex-figure','gore-data','planar-functions'):
 assert merged.count('/api/tessellation/'+endpoint)==original.count('/api/tessellation/'+endpoint)==2
backend=root/'backend/tessellate.py';dispatch=backend.read_bytes()
anchor=b"        if data['operation'] == 'planar-functions':"
assert dispatch.count(anchor)==1
newline=b'\r\n' if b'\r\n' in dispatch else b'\n'
addition=newline.join([b"        if data['operation'] == 'curved-curve2d-systems-native':",b"            from tessellation_curved_curve2d_systems import precompute_curve2d_systems",b"            return precompute_curve2d_systems({key: value for key, value in data.items() if key != 'operation'})",b''])
dispatch=dispatch.replace(anchor,addition+anchor)
checked=subprocess.run(['git','apply','--check','--exclude=server.mjs','--exclude=backend/tessellate.py',str(patch)],cwd=root,capture_output=True,text=True,encoding='utf8')
assert checked.returncode==0,checked.stderr
backup.mkdir(parents=True)
for item in records:
 target=root/item['file']
 if target.exists():
  saved=backup/item['file'];saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,saved)
(backup/'before.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
applied=subprocess.run(['git','apply','--exclude=server.mjs','--exclude=backend/tessellate.py',str(patch)],cwd=root,capture_output=True,text=True,encoding='utf8')
assert applied.returncode==0,applied.stderr
server.write_text(merged,encoding='utf8',newline='');backend.write_bytes(dispatch)
for item,record in zip(manifest['files'],records):
 target=root/item['path'];source=base/'files'/item['path']
 if item['path'] not in common:
  assert target.read_text(encoding='utf8')==source.read_text(encoding='utf8'),item['path']
  if target.read_bytes()!=source.read_bytes():target.write_bytes(source.read_bytes())
 record['after']=hashlib.sha256(target.read_bytes()).hexdigest()
(root/'output/parallel/original-curve-systems-integrated-1010.json').write_text(json.dumps({'verified':True,'files':records,'sharedFilesMergedIncrementally':['server.mjs','backend/tessellate.py']},ensure_ascii=False,indent=2),encoding='utf8')
print('Integrated twelve external Curve2DSystems files, retaining all concurrent routes and Darboux inheritance fix.')
