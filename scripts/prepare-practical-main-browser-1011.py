from pathlib import Path
import hashlib,json,re,shutil
root=Path.cwd().resolve();checkpath=root/'output/practical-construction-checks-002-1011.json'
check=json.loads(checkpath.read_text(encoding='utf8'));assert check['exitCode']==0 and check['inputsUnchanged'] and len(check['stages'])==8
record=root/'output/practical-construction-bundle-002-1011.json';assert not record.exists()
copybase=root/'output/practical-construction-compiled-002-1011';assert not copybase.exists();copybase.mkdir();rows=[]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for file in sorted((root/'dist').rglob('*')):
 if file.is_file():
  copy=copybase/file.relative_to(root/'dist');copy.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(file,copy);rows.append({'file':file.relative_to(root).as_posix(),'copy':copy.relative_to(root).as_posix(),'sha256':sha(copy)})
bundle=re.search(r'src="([^"]+\.js)"',(root/'dist/index.html').read_text(encoding='utf8'))[1]
record.write_text(json.dumps({'verified':True,'bundle':bundle,'files':rows,'checkRecord':checkpath.relative_to(root).as_posix()},ensure_ascii=False,indent=2),encoding='utf8')
base=root/'output/playwright/practical-construction-main-1011';assert not base.exists();base.mkdir();out=base/'downloads-001';out.mkdir()
text=(root/'output/verify-practical-array-linked-main-1011.js').read_text(encoding='utf8').replace('__OUTPUT__',json.dumps(out.as_posix(),ensure_ascii=False)).replace('__BUNDLE__',json.dumps(bundle))
(out/'verify-main.browser.js').write_text(text,encoding='utf8',newline='\n')
config=json.loads((root/'output/playwright/nested-mother-main-1011/config.json').read_text(encoding='utf8'));config['outputDir']=(base/'cli-001').as_posix();(out/'config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf8')
(out/'before.json').write_text(json.dumps({'verified':True,'bundle':bundle,'checks':check['tests'],'sourceCheckSHA256':sha(checkpath),'scriptSHA256':sha(out/'verify-main.browser.js'),'ownedServerPID':149092,'userServicePID':107104,'oldUIFailuresPreserved':True},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'bundle':bundle,'out':out.as_posix(),'tests':check['tests']},ensure_ascii=False))
