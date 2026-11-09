"""Combine frozen new constructors and the root-owned entry as one checked patch."""
from pathlib import Path
import argparse,difflib,hashlib,json,shutil

root=Path.cwd().resolve()
p=argparse.ArgumentParser();p.add_argument('--miura',required=True);p.add_argument('--yoshimura',required=True);a=p.parse_args()
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
read=lambda path:json.loads(path.read_text(encoding='utf-8-sig'))
target=root/'output/parallel/original-arrays-root-delivery-002-1011';assert not target.exists();target.mkdir(parents=True)
inputs=[(root/a.miura,5),(root/a.yoshimura,5),
 (root/'output/parallel/original-waterbomb-tessellation-cp-2604-1011/delivery/manifest.json',5),
 (root/'output/parallel/practical-array-entry-root-1011/manifest.json',3)]
rows=[];patch=[];origins=[]
for manifest,expected_count in inputs:
    data=read(manifest);entries=data.get('files',data.get('targets'))
    assert isinstance(entries,list) and len(entries)==expected_count,manifest
    base=Path(data.get('producerRoot',manifest.parent));base=base if base.is_absolute() else root/base
    origins.append({'file':manifest.relative_to(root).as_posix(),'sha256':sha(manifest),'targets':expected_count})
    for row in entries:
        name=row.get('target',row.get('path'));assert isinstance(name,str) and name.startswith(('src/','tests/')),row
        before=row.get('baselineSha256',row.get('beforeSha256',row.get('beforeSHA256',row.get('baselineSHA256'))))
        source_name=row.get('source',row.get('fullAfter',row.get('candidate',row.get('after'))));assert isinstance(source_name,str),row
        source=Path(source_name);source=source if source.is_absolute() else base/source
        digest=row.get('sha256',row.get('afterSha256',row.get('afterSHA256',row.get('finalSHA256'))));assert sha(source)==digest,name
        live=root/name;assert (sha(live) if live.exists() else None)==before,name
        assert not any(existing['target']==name for existing in rows),name
        out=target/'files'/name;out.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,out);assert sha(out)==digest
        rows.append({'target':name,'baselineSha256':before,'sha256':digest,'source':out.as_posix(),'kind':'modified' if before else 'new'})
        old=live.read_text(encoding='utf-8').splitlines(keepends=True) if live.exists() else []
        new=out.read_text(encoding='utf-8').splitlines(keepends=True)
        patch.extend(difflib.unified_diff(old,new,fromfile='a/'+name if before else '/dev/null',tofile='b/'+name))
assert len(rows)==18 and sum(row['kind']=='modified' for row in rows)==2
patch_path=target/'original-arrays.patch';patch_path.write_text(''.join(patch),encoding='utf-8')
with (target/'manifest.json').open('x',encoding='utf-8') as f:json.dump({'files':rows,'patchSha256':sha(patch_path),'sourceManifests':origins,'productionWritten':False},f,ensure_ascii=False,indent=2)
print(json.dumps({'prepared':True,'targets':len(rows),'modified':2,'new':16,'productionWritten':False}))
