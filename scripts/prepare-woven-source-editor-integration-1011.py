from pathlib import Path
import json,hashlib,shutil
root=Path.cwd().resolve();producer=root/'output/parallel/private-woven-source-editing-1011';base=root/'output/parallel/woven-source-editor-root-delivery-1011';assert not base.exists();base.mkdir(parents=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();index=producer/'freeze.json'
assert sha(index)=='9b5ff5ba831a7cf32c7dd6685af6dc2c79be4e639d9eb66b221872709d7b2ebd'
frozen=json.loads(index.read_text(encoding='utf8'));assert len(frozen['listedFiles'])==52
verified=[]
for row in frozen['listedFiles']:
 file=(producer/row['path']).resolve();assert file.is_relative_to(producer) and file.is_file() and sha(file)==row['sha256'],row['path']
 verified.append({'file':file.relative_to(root).as_posix(),'sha256':row['sha256']})
audit={'verified':True,'originalIndex':index.relative_to(root).as_posix(),'originalIndexSHA256':sha(index),'files':verified}
audit_file=root/'output/woven-source-editor-root-sha-1011.json';assert not audit_file.exists();audit_file.write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf8')
raw=json.loads((producer/'target-manifest.json').read_text(encoding='utf8'));rows=[]
for row in raw['targets']:
 name=row['target'];source=producer/row['candidate'];target=base/'files'/name
 assert sha(source)==row['finalSHA256'];before=sha(root/name) if (root/name).exists() else None;assert before==row['baselineSHA256'],name
 target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
 rows.append({'target':name,'baselineSha256':before,'sha256':sha(target),'source':str(target.resolve()),'kind':'modified' if before else 'new'})
patch=base/'woven.patch';shutil.copy2(producer/'target.patch',patch)
(base/'manifest.json').write_text(json.dumps({'files':rows,'patchSha256':sha(patch),'producerManifestSHA256':sha(producer/'target-manifest.json'),'sourceSchemaUnchanged':True,'rootFrozenInputs':audit_file.relative_to(root).as_posix()},ensure_ascii=False,indent=2),encoding='utf8')
print('Verified 52 explicit frozen files; prepared seven exact-baseline Woven targets.')
