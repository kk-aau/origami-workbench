from pathlib import Path
import hashlib,json,shutil,re
root=Path.cwd().resolve();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
check=root/'output/path-array-checks-1012.json';data=json.loads(check.read_text(encoding='utf8'));assert data['exitCode']==0 and data['inputsUnchanged']
out=root/'output/parallel/path-array-main-root-1012';assert not out.exists();out.mkdir(parents=True)
rows=[]
for r in data['inputs']:
 assert sha(root/r['file'])==r['sha256'],r['file']
 if r['file'].startswith('src/'):
  dest=out/'source-snapshot'/r['file'];dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/r['file'],dest)
  rows.append(dict(path=r['file'],sha256=r['sha256'],snapshot=dest.relative_to(root).as_posix()))
bundleRows=[];compiled=root/'output/path-array-compiled-1012';assert not compiled.exists();compiled.mkdir()
for p in sorted((root/'dist').rglob('*')):
 if p.is_file():
  target=compiled/p.relative_to(root/'dist');target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
  bundleRows.append(dict(path=p.relative_to(root).as_posix(),copy=target.relative_to(root).as_posix(),sha256=sha(target)))
bundle=re.search(r'src="([^"]+\.js)"',(root/'dist/index.html').read_text(encoding='utf8'))[1]
index=out/'ROOT-SOURCE-FROZEN.json';index.write_text(json.dumps(dict(verified=True,files=rows,bundle=bundle,checks=check.relative_to(root).as_posix(),checksSHA256=sha(check),compiledBundleCopies=bundleRows,scope='8 practical source models: General, Spacer, A/B/P/Tachi, LinearChain/SpaceCurve',physicalValidation=False),ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(verified=True,sourceFiles=len(rows),bundle=bundle,sha256=sha(index)),ensure_ascii=False))
