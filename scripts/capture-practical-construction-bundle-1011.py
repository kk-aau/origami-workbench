from pathlib import Path
import hashlib,json,re,shutil
root=Path.cwd().resolve();record=root/'output/practical-construction-bundle-1011.json';assert not record.exists()
check=json.loads((root/'output/practical-construction-checks-1011.json').read_text(encoding='utf8'));assert check['exitCode']==0 and check['inputsUnchanged'] and len(check['stages'])==8
out=root/'output/practical-construction-compiled-1011';assert not out.exists();out.mkdir()
rows=[]
for path in sorted((root/'dist').rglob('*')):
 if path.is_file():
  copy=out/path.relative_to(root/'dist');copy.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,copy)
  rows.append({'file':path.relative_to(root).as_posix(),'copy':copy.relative_to(root).as_posix(),'sha256':hashlib.sha256(copy.read_bytes()).hexdigest()})
bundle=re.search(r'src="([^"]+\.js)"',(root/'dist/index.html').read_text(encoding='utf8'))[1]
record.write_text(json.dumps({'verified':True,'bundle':bundle,'files':rows,'checkRecord':'output/practical-construction-checks-1011.json'},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'verified':True,'bundle':bundle,'files':len(rows)}))
