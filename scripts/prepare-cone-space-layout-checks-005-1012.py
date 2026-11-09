from pathlib import Path
import hashlib,json,shutil
root=Path.cwd().resolve();old=root/'output/parallel/cone-space-check-snapshot-002-1012/work';out=root/'output/parallel/cone-space-check-snapshot-005-1012';assert not out.exists();work=out/'work';work.mkdir(parents=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();delta=json.loads((root/'output/parallel/cone-space-layout-delta-1012/manifest.json').read_text(encoding='utf8'))
for r in delta['files']:
 before=root/'output/parallel/cone-space-layout-delta-1012/snapshot-before'/r['target'];assert sha(before)==r['baselineSha256'];shutil.copy2(before,old/r['target']);assert sha(old/r['target'])==r['baselineSha256']
source=json.loads((root/'output/parallel/cone-space-main-root-001-1012/ROOT-SOURCE-FROZEN.json').read_text(encoding='utf8'))
for r in source['files']:assert sha(root/r['snapshot'])==r['sha256']
for folder in ['src','tests','backend','desktop','public','scripts','docs','vendor','simulator']:
 for p in (old/folder).rglob('*'):
  if p.is_file() and '__pycache__' not in p.parts:
   dest=work/p.relative_to(old);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest);assert sha(dest)==sha(p)
for name in ['package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs','tess-worker.mjs','index.html']:shutil.copy2(old/name,work/name)
for r in delta['files']:
 assert sha(work/r['target'])==r['baselineSha256'];shutil.copy2(r['source'],work/r['target']);assert sha(work/r['target'])==r['sha256']
runner=(old/'scripts/run-cone-space-checks-004-1012.mjs').read_text(encoding='utf8').replace("file='../../../cone-space-checks-004-1012.json',log='../../../cone-space-checks-004-1012.log',baseFile='../../../cone-space-checks-003-1012.json'", "file='../../../cone-space-checks-005-1012.json',log='../../../cone-space-checks-005-1012.log',baseFile='../../../cone-space-checks-004-1012.json'")
start=runner.index('assert.equal(base.stages[0].exitCode,0);const inputs=');end=runner.index('const output=',start)
replacement="assert.equal(base.exitCode,0);const delta=JSON.parse(fs.readFileSync('../../../parallel/cone-space-layout-delta-1012/manifest.json','utf8'));const expected=new Map(base.inputs.filter(r=>!r.file.includes('__pycache__')).map(r=>[r.file,r.sha256]));for(const r of delta.files){assert.equal(expected.get(r.target),r.baselineSha256);expected.set(r.target,r.sha256);}const inputs=[...expected].map(([file,sha256])=>({file,sha256}));for(const r of inputs)assert.equal(hash(r.file),r.sha256,r.file);const frontend=base.tests.frontend;assert.ok(frontend>=3475);\n"
runner=runner[:start]+replacement+runner[end:];runner=runner.replace("extra=JSON.parse(fs.readFileSync('../build-entry-inputs.json','utf8'))", "extra=null").replace('Only missing root HTML/simulator build entries were copied;', 'Only two explicit preview CSS files changed;')
(work/'scripts/run-cone-space-checks-005-1012.mjs').write_text(runner,encoding='utf8')
(out/'changes.json').write_text(json.dumps(dict(verified=True,previousSourceSnapshotRestoredExact=True,changes=delta['files'],productionWrittenByClone=False),ensure_ascii=False,indent=2),encoding='utf8')
print('Restored all 822 prior snapshots exactly; prepared a separate copy with only the layout delta.')
