from pathlib import Path
import hashlib,json
root=Path.cwd().resolve()
name='output/parallel/original-yoshimura-miura-double-spiral-source-1011/freeze.json'
index=root/name;data=json.loads(index.read_text(encoding='utf-8'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert data['status']=='frozen' and len(data['listedFiles'])==19
rows=[]
for row in data['listedFiles']:
    source=(index.parent/row['path']).resolve()
    assert source.is_relative_to(index.parent.resolve()) and source.is_file()
    assert sha(source)==row['sha256'] and source.stat().st_size==row['size'],row['path']
    rows.append({'file':source.relative_to(root).as_posix(),'sha256':row['sha256']})
target=root/'output/original-yoshimura-miura-source-root-sha-1011.json'
with target.open('x',encoding='utf-8') as f:json.dump({'verified':True,'originalIndex':name,'originalIndexSHA256':sha(index),'explicitRowsVerified':len(rows),'files':rows,'producerIndexUnchanged':True},f,ensure_ascii=False,indent=2)
print(json.dumps({'verified':True,'explicitRowsVerified':len(rows),'sourceIndexUnchanged':True}))
