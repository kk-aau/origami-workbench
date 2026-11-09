from pathlib import Path
import json,hashlib,shutil,re
root=Path.cwd().resolve();check=root/'output/space-menu-checks-1011.json';d=json.loads(check.read_text(encoding='utf8'));assert d['exitCode']==0 and d['inputsUnchanged']
record=root/'output/space-menu-bundle-1011.json';compiled=root/'output/space-menu-compiled-1011';assert not record.exists() and not compiled.exists();compiled.mkdir();rows=[]
for file in sorted((root/'dist').rglob('*')):
 if file.is_file():
  copy=compiled/file.relative_to(root/'dist');copy.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(file,copy);rows.append({'file':file.relative_to(root).as_posix(),'copy':copy.relative_to(root).as_posix(),'sha256':hashlib.sha256(copy.read_bytes()).hexdigest()})
bundle=re.search(r'src="([^"]+\.js)"',(root/'dist/index.html').read_text(encoding='utf8'))[1]
record.write_text(json.dumps({'verified':True,'bundle':bundle,'files':rows,'checks':'output/space-menu-checks-1011.json'},ensure_ascii=False,indent=2),encoding='utf8')
base=root/'output/playwright/space-menu-main-1011';assert not base.exists();base.mkdir();out=base/'downloads-001';out.mkdir()
config={'allowUnrestrictedFileAccess':True,'browser':{'browserName':'chromium','launchOptions':{'channel':'chrome','args':['--disable-gpu']}},'outputDir':(base/'cli-001').as_posix()};(out/'config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'verified':True,'bundle':bundle,'files':len(rows),'out':out.as_posix()},ensure_ascii=False))
