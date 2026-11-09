from pathlib import Path
import sys,hashlib,json,shutil,subprocess
root=Path.cwd().resolve();folder,patch_name,record_name=sys.argv[1:4]
base=(root/'output/parallel'/folder).resolve();assert base.is_relative_to(root/'output/parallel')
manifest_path=base/sys.argv[4] if len(sys.argv)>4 else base/'integration-manifest.json' if (base/'integration-manifest.json').exists() else base/'manifest.json'
manifest=json.loads(manifest_path.read_text(encoding='utf8'))
if isinstance(manifest,list):items=manifest
elif 'files' in manifest:items=manifest['files']
elif isinstance(manifest.get('targets'),list):
 items=[]
 for item in manifest['targets']:
  entry=dict(item,target=item.get('target') or item['path'],
             kind='new fixture separate from patch' if item.get('delivery')=='copy-new-file' or item.get('patchIncluded') is False else item.get('operation',item.get('kind')))
  if isinstance(item.get('delivery'),str) and item['delivery'].startswith('delivery'):
   entry['source']=str(base/item['delivery'])
  items.append(entry)
else:
 items=[dict(target=name,baselineSha256=item['baselineSha256'],sha256=item['resultSha256'],
             kind='new fixture separate from patch' if item.get('delivery')=='copy-fixture-separately' else item['operation'])
        for name,item in manifest['targets'].items()]
patch=base/patch_name;backup=root/'output/parallel'/('integration-'+record_name+'-1010-before');assert not backup.exists()
exact_files='--exact-files' in sys.argv[5:]
if isinstance(manifest,dict):
 patch_sha=manifest.get('patchSha256')
 if patch_sha is None:patch_sha=manifest['patch']['sha256']
 assert hashlib.sha256(patch.read_bytes()).hexdigest()==patch_sha
records=[];sources={};excluded=[]
for item in items:
 name=item.get('target',item.get('path'));target=(root/name).resolve()
 source=Path(item['source']).resolve() if 'source' in item else (base/name if 'target' in item and (base/name).exists() else base/'files'/name).resolve()
 assert target.is_relative_to(root) and source.is_relative_to(base)
 after=item.get('sha256',item.get('deliverySha256'));assert hashlib.sha256(source.read_bytes()).hexdigest()==after,name
 before=hashlib.sha256(target.read_bytes()).hexdigest() if target.exists() else None
 baseline=item.get('baselineSha256',item.get('baseline_sha256'))
 already=before==after
 assert before==baseline or already,name
 if already:excluded.append('--exclude='+name)
 records.append({'file':name,'before':before,'after':after,'capturedBaseline':baseline,'alreadyIntegratedExact':already,'separateFixture':item.get('kind')=='new fixture separate from patch'});sources[name]=source
whitespace=[]
if not exact_files:
 checked=subprocess.run(['git','apply','--check',*excluded,str(patch)],cwd=root,capture_output=True,text=True,encoding='utf8')
 if checked.returncode:
  whitespace=['--ignore-space-change']
  checked=subprocess.run(['git','apply','--check',*whitespace,*excluded,str(patch)],cwd=root,capture_output=True,text=True,encoding='utf8')
 assert checked.returncode==0,checked.stderr
backup.mkdir(parents=True)
for record in records:
 target=root/record['file']
 if target.exists():
  saved=backup/record['file'];saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,saved)
(backup/'before.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
if not exact_files:
 applied=subprocess.run(['git','apply',*whitespace,*excluded,str(patch)],cwd=root,capture_output=True,text=True,encoding='utf8');assert applied.returncode==0,applied.stderr
for record in records:
 target=root/record['file'];source=sources[record['file']]
 if record['alreadyIntegratedExact']:
  assert hashlib.sha256(target.read_bytes()).hexdigest()==record['after']
  continue
 if exact_files:
  target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(source.read_bytes())
  assert hashlib.sha256(target.read_bytes()).hexdigest()==record['after']
  continue
 if record['separateFixture']:
  assert not target.exists();target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(source.read_bytes())
 assert target.read_text(encoding='utf8')==source.read_text(encoding='utf8'),record['file']
 if target.read_bytes()!=source.read_bytes():target.write_bytes(source.read_bytes())
 assert hashlib.sha256(target.read_bytes()).hexdigest()==record['after']
(root/'output/parallel'/(record_name+'-integrated-1010.json')).write_text(json.dumps({'verified':True,'files':records,'integrationMethod':'exact delivery files; captured baseline and final SHA checked' if exact_files else 'checked patch'},ensure_ascii=False,indent=2),encoding='utf8')
print(f'Integrated {len(records)} {record_name} files; all frozen input and current baseline hashes matched.')
