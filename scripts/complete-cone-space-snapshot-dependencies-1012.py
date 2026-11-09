from pathlib import Path
import hashlib,json,shutil
root=Path.cwd().resolve();base=root/'output/parallel/cone-space-check-snapshot-002-1012';work=base/'work';assert work.exists();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();rows=[]
for p in sorted((root/'vendor').rglob('*')):
 if p.is_file() and not any(x in p.parts for x in ['.git','node_modules','__pycache__']):
  name=p.relative_to(root).as_posix();dest=work/name;assert not dest.exists();dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest);assert sha(p)==sha(dest);rows.append(dict(file=name,sha256=sha(dest),snapshot=dest.relative_to(root).as_posix()))
(base/'vendor-inputs.json').write_text(json.dumps(dict(verified=True,files=rows),ensure_ascii=False,indent=2),encoding='utf8')
runner=work/'scripts/run-cone-space-checks-002-1012.mjs';text=runner.read_text(encoding='utf8').replace('cone-space-checks-002-1012','cone-space-checks-003-1012');text=text.replace("...walk('desktop'),", "...walk('desktop'),...walk('vendor'),")
(work/'scripts/run-cone-space-checks-003-1012.mjs').write_text(text,encoding='utf8')
print(json.dumps(dict(verified=True,vendorFiles=len(rows)),ensure_ascii=False))
