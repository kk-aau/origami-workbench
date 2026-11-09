from pathlib import Path
import hashlib,json,shutil,subprocess
root=Path.cwd().resolve();base=root/'output/parallel/original-halfplane-false-1010'
manifest=json.loads((base/'three-cycle-integration-manifest.json').read_text(encoding='utf8'))
patch=base/'three-cycle-production.patch';backup=root/'output/parallel/integration-original-halfplane-1010-before'
assert not backup.exists()
assert hashlib.sha256(patch.read_bytes()).hexdigest()==manifest['patchSha256']
prior=json.loads((root/'output/parallel/original-curve-systems-integrated-1010.json').read_text(encoding='utf8'))
common={x['file']:x['after'] for x in prior['files'] if x['file'] in ('server.mjs','backend/tessellate.py')}
common['src/components/TwistAnalysisDialog.tsx']='c370add57c5ff9be646e845cb06d2caf09dac68944d2f7a7cd252f0e862e8237'
records=[]
for item in manifest['files']:
 target=(root/item['target']).resolve();source=(base/item['target']).resolve()
 assert target.is_relative_to(root) and source.is_relative_to(base)
 assert hashlib.sha256(source.read_bytes()).hexdigest()==item['deliverySha256'],item['target']
 before=hashlib.sha256(target.read_bytes()).hexdigest() if target.exists() else None
 assert before==common.get(item['target'],item.get('baselineSha256')),item['target']
 records.append({'file':item['target'],'before':before,'producerAfter':item['deliverySha256']})
server=root/'server.mjs';original=server.read_text(encoding='utf8');merged=original
for old,new in [
 (" || url.pathname === '/api/tessellation/archimedean-vertex-figure'"," || url.pathname === '/api/tessellation/three-cycle-critical' || url.pathname === '/api/tessellation/archimedean-vertex-figure'"),
 ("url.pathname==='/api/tessellation/archimedean-vertex-figure'?'archimedean-vertex-figure':","url.pathname==='/api/tessellation/three-cycle-critical'?'three-cycle-critical':url.pathname==='/api/tessellation/archimedean-vertex-figure'?'archimedean-vertex-figure':")]:
 assert merged.count(old)==1,old;merged=merged.replace(old,new)
backend=root/'backend/tessellate.py';dispatch=backend.read_bytes()
anchor=b"        if data['operation'] == 'archimedean-vertex-figure':";assert dispatch.count(anchor)==1
newline=b'\r\n' if b'\r\n' in dispatch else b'\n'
addition=newline.join([b"        if data['operation'] == 'three-cycle-critical':",b"            from tessellation_three_cycle_native import query_three_cycle",b"            return query_three_cycle({k:v for k,v in data.items() if k!='operation'})",b''])
dispatch=dispatch.replace(anchor,addition+anchor)
dialog=root/'src/components/TwistAnalysisDialog.tsx';new_dialog=(base/'src/components/TwistAnalysisDialog.tsx').read_text(encoding='utf8')
for old,new in [("import {TessDialog} from './TessellationEditor';","import {TessDialog} from './TessellationEditor';\nimport TestPleatControls from './TestPleatControls';"),("    </div>:tab==='critical'?<>","    </div>:tab==='critical'?<>\n      <TestPleatControls initial={polygon.length>=2?[polygon[0],polygon[1]]:undefined} angle={alpha}/>")]:
 assert new_dialog.count(old)==1;new_dialog=new_dialog.replace(old,new)
assert 'ThreeCycleNativeControls' in new_dialog and 'TestPleatControls' in new_dialog
excluded=['--exclude='+x for x in common]
checked=subprocess.run(['git','apply','--check',*excluded,str(patch)],cwd=root,capture_output=True,text=True,encoding='utf8');assert checked.returncode==0,checked.stderr
backup.mkdir(parents=True)
for item in records:
 target=root/item['file']
 if target.exists():
  saved=backup/item['file'];saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,saved)
(backup/'before.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
applied=subprocess.run(['git','apply',*excluded,str(patch)],cwd=root,capture_output=True,text=True,encoding='utf8');assert applied.returncode==0,applied.stderr
server.write_text(merged,encoding='utf8',newline='');backend.write_bytes(dispatch);dialog.write_text(new_dialog,encoding='utf8',newline='')
for item,record in zip(manifest['files'],records):
 target=root/item['target'];source=base/item['target']
 if item['kind']=='new fixture separate from patch':
  assert not target.exists();target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(source.read_bytes())
 elif item['target'] not in common:
  assert target.read_text(encoding='utf8')==source.read_text(encoding='utf8'),item['target']
  if target.read_bytes()!=source.read_bytes():target.write_bytes(source.read_bytes())
 record['after']=hashlib.sha256(target.read_bytes()).hexdigest()
(root/'output/parallel/original-halfplane-integrated-1010.json').write_text(json.dumps({'verified':True,'files':records,'sharedFilesMergedIncrementally':list(common)},ensure_ascii=False,indent=2),encoding='utf8')
print('Integrated ten original CheckHalfPlane files; preserved TestPleat and all existing helper routes.')
