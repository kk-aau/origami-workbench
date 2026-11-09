from pathlib import Path
import hashlib
import json
import sys

root=Path.cwd().resolve()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
base=root/'output/parallel/original-uniform-helix-cp-3951-1011'
specs={
 'five':('', 'DELIVERY-FROZEN-002.json','76ab09dc3ea754c18353350217720724185d592ec6ee80b44003c9235b9bb296',11,'delivery-002/manifest.json',5),
 'css':('layout-parent-delta-001','DELTA-FROZEN-001.json','cb59c0e568f0eab32d41538b76671127b4b6c1e51bd56d84e1406bc64fc9be78',25,'manifest.json',1),
 'origin':('source-origin-delta-001','DELTA-FROZEN-001.json','459a750cd547fd91c01eb5b2eaa051b7d97cad853cbf7630585568f954c45dea',12,'manifest.json',2),
}
phase=sys.argv[1]
folder,index,expected,count,manifest_name,targets=specs[phase]
producer=base/folder
p=producer/index
assert sha(p)==expected,p
packet=json.loads(p.read_text(encoding='utf8'))
assert len(packet['files'])==count
for row in packet['files']:
 f=(producer/row.get('path',row.get('file'))).resolve()
 assert f.is_relative_to(producer) and sha(f)==row['sha256'],f
author=json.loads((producer/manifest_name).read_text(encoding='utf8'))
assert author['validation']['verified'] and len(author['targets'])==targets
for ref in author.get('references',[]):
 b=Path(ref['producerRoot']).resolve()
 assert b.is_relative_to(root)
 ip=b/ref['index']; assert sha(ip)==ref['sha256'],ip
 j=json.loads(ip.read_text(encoding='utf8')); assert len(j['files'])==ref['files']
 for row in j['files']:
  item=row.get('path',row.get('file'))
  candidates=[root/item,b/item]
  assert any(f.is_file() and sha(f)==row['sha256'] for f in candidates),item
rows=[]
for row in author['targets']:
 f=(producer/row['after']).resolve()
 assert f.is_relative_to(producer) and sha(f)==row['afterSha256']
 target=root/row['path']
 assert (sha(target) if target.exists() else None)==row['beforeSha256'],target
 rows.append(dict(target=row['path'],baselineSha256=row['beforeSha256'],sha256=row['afterSha256'],source=str(f),kind='new' if row['beforeSha256'] is None else 'modified'))
assert sha(producer/author['patch'])==author['patchSha256']
out=producer/'root-integration-manifest-1011.json'
assert not out.exists()
out.write_text(json.dumps(dict(files=rows,patchSha256=author['patchSha256'],authorFreeze=index,authorFreezeSha256=expected,
 authorManifest=manifest_name,authorManifestSha256=sha(producer/manifest_name),productionWritten=False),ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(verified=True,phase=phase,targets=targets,patch=author['patch'],producer=str(producer.relative_to(root/'output/parallel')),manifest='root-integration-manifest-1011.json')))
