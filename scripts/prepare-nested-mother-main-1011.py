from pathlib import Path
import hashlib,json,re,shutil
root=Path.cwd().resolve();out=root/'output/playwright/nested-mother-main-1011'
assert not out.exists();out.mkdir(parents=True)
config={'allowUnrestrictedFileAccess':True,'browser':{'browserName':'chromium','launchOptions':{'channel':'chrome','args':['--disable-gpu']}},'outputDir':(out/'cli').as_posix()}
(out/'config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf8')
bundle=re.search(r'src="([^"]+\.js)"',(root/'dist/index.html').read_text(encoding='utf8'))[1]
rows=[]
for path in sorted((root/'dist').rglob('*')):
 if path.is_file():
  target=out/'compiled'/path.relative_to(root/'dist');target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,target)
  rows.append({'file':target.relative_to(root).as_posix(),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
(out/'compiled.json').write_text(json.dumps({'verified':True,'bundle':bundle,'files':rows},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'bundle':bundle,'compiled':len(rows)},ensure_ascii=False))
