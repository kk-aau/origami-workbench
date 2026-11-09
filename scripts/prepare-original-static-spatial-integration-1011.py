from pathlib import Path
import json,hashlib,shutil
root=Path.cwd().resolve();producer=root/'output/parallel/original-arrays-static-spatial-1011/delivery-002';base=root/'output/parallel/original-static-spatial-root-delivery-1011'
assert not base.exists();base.mkdir(parents=True);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
raw=json.loads((producer/'manifest.json').read_text(encoding='utf8'));rows=[]
for row in raw['targets']:
 name=row['path'];source=producer/row['after'];target=base/'files'/name
 assert sha(source)==row['sha256'],name
 before=sha(root/name) if (root/name).exists() else None;assert before==row['beforeSha256'],name
 target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
 rows.append({'target':name,'baselineSha256':before,'sha256':sha(target),'source':str(target.resolve()),'kind':'modified' if before else 'new'})
patch=base/'spatial.patch';shutil.copy2(producer/raw['patch'],patch);assert sha(patch)==raw['patchSha256']
(base/'manifest.json').write_text(json.dumps({'files':rows,'patchSha256':sha(patch),'producerManifestSHA256':sha(producer/'manifest.json'),'geometryAndLegacyCPUnchanged':True,'exactFilesRequired':'producer supplied LF; older failed autocrlf replay retained'},ensure_ascii=False,indent=2),encoding='utf8')
print('Prepared six exact static-spatial candidates; two existing CP helpers unchanged.')
