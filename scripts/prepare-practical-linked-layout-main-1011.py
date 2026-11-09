from pathlib import Path
import json,hashlib,shutil,re
root=Path.cwd().resolve();check=root/'output/practical-layout-final-checks-1011.json';assert json.loads(check.read_text(encoding='utf8'))['exitCode']==0
record=root/'output/practical-construction-final-bundle-1011.json';copies=root/'output/practical-construction-compiled-final-1011';assert not record.exists() and not copies.exists();copies.mkdir();files=[]
for file in sorted((root/'dist').rglob('*')):
 if file.is_file():
  copy=copies/file.relative_to(root/'dist');copy.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(file,copy);files.append({'file':file.relative_to(root).as_posix(),'copy':copy.relative_to(root).as_posix(),'sha256':hashlib.sha256(copy.read_bytes()).hexdigest()})
bundle=re.search(r'src="([^"]+\.js)"',(root/'dist/index.html').read_text(encoding='utf8'))[1]
record.write_text(json.dumps({'verified':True,'bundle':bundle,'files':files,'checkRecord':check.relative_to(root).as_posix(),'fullProjectChecks':'output/practical-construction-checks-002-1011.json'},ensure_ascii=False,indent=2),encoding='utf8')
base=root/'output/playwright/practical-linked-layout-main-1011';assert not base.exists();base.mkdir()
config=json.loads((root/'output/playwright/nested-mother-main-1011/config.json').read_text(encoding='utf8'));config['outputDir']=(base/'cli').as_posix();(base/'config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf8')
template=(root/'output/verify-practical-linked-layout-main-1011.js').read_text(encoding='utf8');(base/'verify-main.browser.js').write_text(template.replace('__OUTPUT__',json.dumps(base.as_posix(),ensure_ascii=False)).replace('__BUNDLE__',json.dumps(bundle)),encoding='utf8',newline='\n')
print(json.dumps({'bundle':bundle,'files':len(files),'out':base.as_posix()},ensure_ascii=False))
