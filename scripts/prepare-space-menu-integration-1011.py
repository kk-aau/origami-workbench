from pathlib import Path
import json,hashlib,shutil
root=Path.cwd().resolve();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();read=lambda p:json.loads(p.read_text(encoding='utf8'))
previous=read(root/'output/practical-construction-report-1011.json')
for name,digest in previous['sourceChanges'].items():assert sha(root/name)==digest,name
old=read(root/'output/audits/practical-construction-final-1011.json')
for row in old['snapshots']:assert sha(root/old['archive']/row['file'])==row['sha256'],row['file']
producer=root/'output/parallel/practical-space-menu-1011';index=producer/'freeze.json';assert sha(index)=='a53591e6dbe1faabc2fc943a86fa38dd7c7cbc8edbee60d905e185f1a0f35b45'
freeze=read(index);records=[]
for row in [*freeze['listedFiles'],freeze['manifest']]:
 file=(producer/row['path']).resolve();assert file.is_relative_to(producer) and sha(file)==row['sha256'],row['path'];records.append({'file':file.relative_to(root).as_posix(),'sha256':sha(file)})
curation=root/'output/parallel/practical-entry-curation-1011/freeze.json';assert sha(curation)=='2ed7efd417460a3c157aed432235a050dbbd9cdd7f6e16c972fb1be21ba2535b'
for row in read(curation)['files']:
 file=(curation.parent/row['path']).resolve();assert sha(file)==row['sha256'];records.append({'file':file.relative_to(root).as_posix(),'sha256':sha(file)})
base=root/'output/parallel/space-menu-root-delivery-1011';assert not base.exists();base.mkdir();files=[]
manifest=read(producer/'manifest.json')
for row in manifest['targets']:
 name=row['path'];file=root/name;before=sha(file) if file.exists() else None;assert before==row['baselineSHA256'],name
 source=Path(row['candidatePath']).resolve();assert source.is_relative_to(producer) and sha(source)==row['finalSHA256']
 copy=base/'files'/name;copy.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,copy);files.append({'target':name,'baselineSha256':before,'sha256':sha(copy),'source':str(copy.resolve()),'kind':'modified' if before else 'new'})
patch=base/'menu.patch';shutil.copy2(producer/'menu.patch',patch)
(base/'manifest.json').write_text(json.dumps({'files':files,'patchSha256':sha(patch),'producerIndexSHA256':sha(index),'checkedFrozenInputs':records,'previousP69SnapshotsVerified':len(old['snapshots']),'mathAndCallbacksUnchanged':True},ensure_ascii=False,indent=2),encoding='utf8')
print(f'Checked {len(records)} explicit frozen inputs and {len(old["snapshots"])} P69 archived files; prepared two baseline-exact menu targets.')
