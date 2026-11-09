from pathlib import Path
import hashlib,json,shutil,re
root=Path.cwd().resolve();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
check=root/'output/tube-strip-checks-001-1012.json';data=json.loads(check.read_text(encoding='utf8'));assert data['exitCode']==0 and data['inputsUnchanged']
out=root/'output/parallel/tube-strip-main-root-001-1012';assert not out.exists();out.mkdir(parents=True);rows=[]
for r in data['inputs']:
 assert sha(root/r['file'])==r['sha256'],r['file']
 if r['file'].startswith('src/'):
  dest=out/'source-snapshot'/r['file'];dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/r['file'],dest);rows.append(dict(path=r['file'],sha256=r['sha256'],snapshot=dest.relative_to(root).as_posix()))
bundleRows=[];compiled=root/'output/tube-strip-compiled-001-1012';assert not compiled.exists();compiled.mkdir()
for p in sorted((root/'dist').rglob('*')):
 if p.is_file():
  target=compiled/p.relative_to(root/'dist');target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target);bundleRows.append(dict(path=p.relative_to(root).as_posix(),copy=target.relative_to(root).as_posix(),sha256=sha(target)))
bundle=re.search(r'src="([^"]+\.js)"',(root/'dist/index.html').read_text(encoding='utf8'))[1]
index=out/'ROOT-SOURCE-FROZEN.json';index.write_text(json.dumps(dict(verified=True,files=rows,bundle=bundle,checks=check.relative_to(root).as_posix(),checksSHA256=sha(check),compiledBundleCopies=bundleRows,scope='Bistable tube two layer recipes and three flat/Troublewit models; current shared Diagram work retained',physicalValidation=False),ensure_ascii=False,indent=2),encoding='utf8')
folder=root/'output/playwright/tube-strip-main-1012';downloads=folder/'downloads-001';assert not downloads.exists();downloads.mkdir(parents=True)
(downloads/'verify-main.browser.js').write_text((root/'scripts/tube-strip-main-1012.browser.js').read_text(encoding='utf8').replace('__OUTPUT__',downloads.as_posix()).replace('__BUNDLE__',bundle),encoding='utf8')
config=json.loads((root/'output/playwright/path-array-main-1012/cli-config-004.json').read_text(encoding='utf8'));config['outputDir']=str(folder/'cli-001');(folder/'cli-config-001.json').write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf8')
ps=(root/'scripts/start-path-array-main-004-1012.ps1').read_text(encoding='utf-8-sig').replace('path-array-main','tube-strip-main').replace('004-1012','001-1012');(root/'scripts/start-tube-strip-main-001-1012.ps1').write_text(ps,encoding='utf-8-sig')
js=(root/'scripts/start-path-array-main-004-1012.mjs').read_text(encoding='utf8').replace('path-array-main','tube-strip-main').replace('004-1012','001-1012');(root/'scripts/start-tube-strip-main-001-1012.mjs').write_text(js,encoding='utf8')
print(json.dumps(dict(verified=True,sourceFiles=len(rows),bundle=bundle,sha256=sha(index)),ensure_ascii=False))
