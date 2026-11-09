from pathlib import Path
import json,hashlib,shutil,re
root=Path.cwd().resolve();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
check=root/'output/processing-r12-checks-1011.json';d=read(check);assert d['exitCode']==0 and d['inputsUnchanged'] and d['tests']['frontend']==3338
for r in d['inputs']:assert sha(root/r['file'])==r['sha256'],r['file']
folder=root/'output/parallel/processing-r12-root-delivery-1011';index=folder/'ROOT-SOURCE-FROZEN.json';assert not index.exists();rows=[]
for r in d['inputs']:
 if r['file'].startswith('src/'):
  p=root/r['file'];t=folder/'source-snapshot'/r['file'];t.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,t);assert sha(t)==r['sha256'];rows.append({'path':r['file'],'sha256':r['sha256'],'snapshot':t.relative_to(root).as_posix()})
compiled=root/'output/processing-r12-compiled-1011';assert not compiled.exists();compiled.mkdir();bundleRows=[]
for p in sorted((root/'dist').rglob('*')):
 if p.is_file():
  t=compiled/p.relative_to(root/'dist');t.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,t);bundleRows.append({'file':p.relative_to(root).as_posix(),'copy':t.relative_to(root).as_posix(),'sha256':sha(t)})
bundle=re.search(r'src="([^\"]+\.js)"',(root/'dist/index.html').read_text(encoding='utf8'))[1]
index.write_text(json.dumps({'verified':True,'rootBase':str(root),'files':rows,'bundle':bundle,'checks':check.relative_to(root).as_posix(),'checksSHA256':sha(check),'compiledBundleCopies':bundleRows,'goalScope':'actually usable adoptable finite CP tools only; unusable theory or formulas excluded per latest user instruction','physicalValidation':False},ensure_ascii=False,indent=2),encoding='utf8')
p=root/'output/processing-r12-bundle-1011.json';assert not p.exists();p.write_text(json.dumps({'verified':True,'bundle':bundle,'files':bundleRows,'sourceFreeze':index.relative_to(root).as_posix(),'sourceFreezeSHA256':sha(index),'checks':check.relative_to(root).as_posix()},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'verified':True,'bundle':bundle,'sourceFiles':len(rows),'bundleFiles':len(bundleRows),'freeze':str(index),'sha256':sha(index)},ensure_ascii=False))
