from pathlib import Path
import hashlib,json
root=Path.cwd().resolve();name='output/parallel/original-yoshimura-miura-cp-1011/freeze.json'
index=root/name;data=json.loads(index.read_text(encoding='utf-8'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert data['status']=='frozen' and len(data['listedFiles'])==36
rows=[]
for row in data['listedFiles']:
    source=(index.parent/row['path']).resolve()
    assert source.is_relative_to(index.parent.resolve()) and source.is_file()
    assert sha(source)==row['sha256'],row['path']
    rows.append({'file':source.relative_to(root).as_posix(),'sha256':row['sha256']})
external=[]
for key in ['externalReferences','externalInputs','externalFiles']:
    for row in data.get(key,[]):
        raw=Path(row.get('path',row.get('file')));source=raw if raw.is_absolute() else index.parent/raw
        if not source.is_file():source=root/raw
        assert source.resolve().is_relative_to(root) and sha(source)==row['sha256'],str(source)
        external.append({'file':source.resolve().relative_to(root).as_posix(),'sha256':row['sha256']})
target=root/'output/original-yoshimura-miura-candidate-root-sha-1011.json'
with target.open('x',encoding='utf-8') as f:json.dump({'verified':True,'originalIndex':name,'originalIndexSHA256':sha(index),'explicitRowsVerified':len(rows),'externalRowsVerified':len(external),'files':rows,'externalReferences':external,'producerIndexUnchanged':True},f,ensure_ascii=False,indent=2)
print(json.dumps({'verified':True,'files':len(rows),'external':len(external)}))
