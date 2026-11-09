from pathlib import Path
import hashlib,json,shutil,difflib

root=Path.cwd().resolve(); parallel=root/'output/parallel'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
indices=[
 ('private-custom-mesh-source-editor-1011/DELIVERY-FROZEN.json','28b76f4ae78bbe0dd8ee8e3a388ce151f0bc9a77f1c9ce390b1a00d9f9c69b1c'),
 ('private-custom-mesh-source-editor-1011/SUPPORT-FROZEN.json','b74c02fa9ce74ba072658fc95ebbd7d4b9ec313e745d23fe81beba411157b690'),
 ('private-custom-mesh-source-editor-1011/connectivity-delta-001/freeze.json','74811bccea3ef2daae105628e20ace2c4b46e4e923b684a57568e60a18aec87f'),
 ('private-custom-mesh-independent-peer-1011/freeze.json','afe2534eeceebee4ead2ed0b25b7384488da99638374d7ee4e5b3b1b522d7b77'),
 ('original-linked-bands-4086-planar-source-1011/freeze.json','ff5c28f20fe12f67427874eae95143da55f2a5476eb741a8fed30b8f20f2aace'),
 ('original-linked-bands-4086-planar-cp-1011/freeze.json','38f5fbcdf02e92c7373108b72a2e1557a689e15915d6fd6ce1b6d94544ef9380'),
 ('private-yoshimura-six-static-spatial-1011/DELIVERY-FROZEN.json','9b8bb52f92538a2d3ffdd06a1e2c3c5feb5eeaf17a4930a0fad6d1d609b1158e'),
 ('private-yoshimura-six-static-spatial-1011/SUPPORT-FROZEN.json','01c8307c480433a760142192d3a52278c812525682866b1024436412bd2959ca')]
verified=[]
for name,expected in indices:
 index=parallel/name;assert sha(index)==expected,name
 value=json.loads(index.read_text(encoding='utf8'))
 entries=value.get('files',value.get('listedFiles'));assert isinstance(entries,list),name
 for row in [*entries,*value.get('references',[])]:
  file=(index.parent/row['path']).resolve();assert file.is_relative_to(root) and sha(file)==row['sha256'],str(file)
  verified.append({'file':file.relative_to(root).as_posix(),'sha256':sha(file)})
 verified.append({'file':index.relative_to(root).as_posix(),'sha256':expected})
audit=root/'output/practical-followups-root-sha-1011.json';assert not audit.exists()
audit.write_text(json.dumps({'verified':True,'indices':indices,'files':verified},ensure_ascii=False,indent=2),encoding='utf8')

def prepare(name,producer,manifest,afterdir):
 base=parallel/name;assert not base.exists();base.mkdir()
 raw=json.loads((producer/manifest).read_text(encoding='utf8'));files=[];patch=''
 for row in raw['targets']:
  target=row.get('path',row.get('target'));source=producer/(row.get('candidate') or afterdir+'/'+target)
  expected=row.get('afterSHA256',row.get('finalSHA256'));baseline=row.get('beforeSHA256',row.get('baselineSHA256'))
  assert sha(source)==expected
  current=root/target;actual=sha(current) if current.exists() else None
  # The connectivity delta is prepared before its explicit predecessor is integrated.
  if name!='custom-mesh-connectivity-root-1011':assert actual==baseline,target
  dst=base/'files'/target;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,dst)
  files.append({'target':target,'baselineSha256':baseline,'sha256':expected,'source':str(dst.resolve()),'kind':'modified' if baseline else 'new'})
  before=(producer/'before'/target).read_text(encoding='utf8') if baseline and (producer/'before'/target).exists() else current.read_text(encoding='utf8') if actual==baseline and baseline else ''
  patch+=''.join(difflib.unified_diff(before.splitlines(keepends=True),dst.read_text(encoding='utf8').splitlines(keepends=True),fromfile='a/'+target if baseline else '/dev/null',tofile='b/'+target))
 p=base/'targets.patch';p.write_text(patch,encoding='utf8',newline='\n')
 (base/'manifest.json').write_text(json.dumps({'files':files,'patchSha256':sha(p),'producerManifestSHA256':sha(producer/manifest),'frozenInputs':audit.relative_to(root).as_posix()},ensure_ascii=False,indent=2),encoding='utf8')
prepare('custom-mesh-editor-root-1011',parallel/'private-custom-mesh-source-editor-1011','delivery/manifest.json','delivery/after')
prepare('custom-mesh-connectivity-root-1011',parallel/'private-custom-mesh-source-editor-1011/connectivity-delta-001','manifest.json','after')
prepare('linked-bands-planar-root-1011',parallel/'original-linked-bands-4086-planar-cp-1011','target-manifest.json','candidate')
prepare('original-six-static-root-1011',parallel/'private-yoshimura-six-static-spatial-1011','delivery-002/manifest.json','delivery-002/after')
print(f'Verified {len(verified)} explicit frozen rows; prepared 4+2+5+3 exact-byte targets.')
