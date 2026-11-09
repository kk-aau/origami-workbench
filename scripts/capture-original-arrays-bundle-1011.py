from pathlib import Path
import hashlib,json,re
root=Path.cwd().resolve();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
name='output/original-arrays-checks-1011.json';record=root/name;checks=json.loads(record.read_text(encoding='utf-8'))
assert checks['exitCode']==0 and checks['inputsUnchanged'] and checks['backendInputsUnchanged']
assert len(checks['stages'])==8 and all(r['exitCode']==0 for r in checks['stages'])
for row in checks['inputs']:assert sha(root/row['file'])==row['sha256'],row['file']
bundle=re.search(r'src="(/assets/main-[A-Za-z0-9_-]+\.js)"',(root/'dist/index.html').read_text(encoding='utf-8')).group(1)
files=[{'file':p.relative_to(root).as_posix(),'sha256':sha(p)} for p in sorted((root/'dist').rglob('*')) if p.is_file()]
assert len(files)==26 and bundle!='/assets/main-CAFhAYq_.js'
out=root/'output/original-arrays-bundle-1011.json'
with out.open('x',encoding='utf-8') as f:json.dump({'verified':True,'bundle':bundle,'tests':checks['tests'],'checksRecord':name,'checksRecordSHA256':sha(record),'files':files},f,ensure_ascii=False,indent=2)
print(json.dumps({'verified':True,'bundle':bundle,'files':len(files),'tests':checks['tests']}))
