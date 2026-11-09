"""Verify the six editor changes against the fixed P66 production snapshots."""
from pathlib import Path
import hashlib,json,os

root=Path.cwd().resolve()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
read=lambda p:json.loads((root/p).read_text(encoding='utf-8-sig'))
previous_name='output/audits/original-uniform-helix-extended-final-1011.json'
previous=read(previous_name)
assert previous['verified'] and len(previous['snapshots'])==7548
for row in previous['snapshots']:
    assert sha(root/previous['archive']/row['file'])==row['sha256'],row['file']
old={r['file']:r['sha256'] for r in previous['snapshots']}
integration_name='output/parallel/practical-editors-root-delivery-integrated-1010.json'
integration=read(integration_name)
assert integration['verified'] and len(integration['files'])==6
mapped={}
for row in integration['files']:
    assert old.get(row['file'])==row['before'],row['file']
    assert sha(root/row['file'])==row['after'],row['file']
    mapped[row['file']]=row['after']
protected={n:v for n,v in old.items() if n.startswith(('src/','backend/','tests/')) and n not in mapped}
for name,digest in protected.items():assert sha(root/name)==digest,name
census=set()
for folder in ['src','backend','tests']:
    for current,dirs,files in os.walk(root/folder,followlinks=False):
        dirs[:]=[n for n in dirs if n!='__pycache__' and not (Path(current)/n).is_symlink()
                 and not (hasattr(Path(current)/n,'is_junction') and (Path(current)/n).is_junction())]
        census.update((Path(current)/n).relative_to(root).as_posix() for n in files)
assert census==set(protected)|set(mapped),sorted(census-set(protected)-set(mapped))
package_names=['package.json','package-lock.json','src/app/state.ts','desktop/使用说明.txt']
for name in package_names:assert sha(root/name)==old[name],name
release=read('release/验收-v0.13.6-20261011.json')
result={'verified':True,'previousIndex':previous_name,'previousIndexSHA256':sha(root/previous_name),
        'previousArchiveFilesVerified':len(previous['snapshots']),'mappedFiles':len(mapped),
        'mappedSourceHashes':mapped,'integrationReport':integration_name,
        'unchangedProductionInputs':len(protected),'noUnmappedProductionChanges':True,
        'packageMetadataUnchanged':package_names,'portableVersion':'0.13.6',
        'newEditorsIncludedInExistingPortable':False,'completeOrigamicaGoal':False}
target=root/'output/practical-editors-preservation-1011.json'
with target.open('x',encoding='utf-8') as f:json.dump(result,f,ensure_ascii=False,indent=2)
print(json.dumps({'verified':True,'mapped':len(mapped),'protected':len(protected),'previousArchive':len(previous['snapshots'])}))
