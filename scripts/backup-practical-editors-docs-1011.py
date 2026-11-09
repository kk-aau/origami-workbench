from pathlib import Path
import hashlib,json,shutil
root=Path.cwd().resolve();target=root/'output/practical-editors-docs-before-1011'
assert not target.exists();target.mkdir()
rows=[]
for name in ['README.md','docs/Origamica当前剩余范围-20261009.md']:
    source=root/name;out=target/name;out.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,out)
    digest=hashlib.sha256(source.read_bytes()).hexdigest();assert hashlib.sha256(out.read_bytes()).hexdigest()==digest
    rows.append({'file':name,'sha256':digest,'backup':out.relative_to(root).as_posix()})
with (target/'index.json').open('x',encoding='utf-8') as f:json.dump({'verified':True,'files':rows},f,ensure_ascii=False,indent=2)
print(json.dumps({'verified':True,'backedUp':len(rows)}))
