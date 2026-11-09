from pathlib import Path
import hashlib,json,shutil
root=Path.cwd().resolve();out=root/'output/parallel/cone-space-check-snapshot-002-1012';assert not out.exists();work=out/'work';work.mkdir(parents=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();files=[]
for folder in ['src','tests','backend','desktop','public','scripts','docs']:
 for p in (root/folder).rglob('*'):
  if p.is_file() and '__pycache__' not in p.parts:files.append(p)
for name in ['package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs','tess-worker.mjs']:
 if (root/name).exists():files.append(root/name)
rows=[]
for p in sorted(files):
 name=p.relative_to(root).as_posix();before=sha(p);dest=work/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest);assert sha(dest)==before;rows.append(dict(file=name,sha256=before,snapshot=dest.relative_to(root).as_posix()))
drift=[r['file'] for r in rows if sha(root/r['file'])!=r['sha256']]
(out/'inputs.json').write_text(json.dumps(dict(verified=not drift,files=rows,parallelDrift=drift,productionWritten=False),ensure_ascii=False,indent=2),encoding='utf8');assert not drift,drift
runner=(root/'scripts/run-cone-space-checks-002-1012.mjs').read_text(encoding='utf8')
runner=runner.replace("const file='output/cone-space-checks-002-1012.json',log='output/cone-space-checks-002-1012.log';", "const file='../../../cone-space-checks-002-1012.json',log='../../../cone-space-checks-002-1012.log';")
runner=runner.replace("baseFile='output/tube-strip-checks-001-1012.json'", "baseFile='../../../tube-strip-checks-001-1012.json'")
runner=runner.replace("Current shared App includes the parallel Diagram work and is freshly typechecked, built and unit tested.", "A captured copy retains the parallel Diagram work; its complete source is held fixed for unit tests and build without modifying the live project or its dist.")
(work/'scripts/run-cone-space-checks-002-1012.mjs').write_text(runner,encoding='utf8')
print(json.dumps(dict(verified=True,files=len(rows),workingCopy=str(work)),ensure_ascii=False))
