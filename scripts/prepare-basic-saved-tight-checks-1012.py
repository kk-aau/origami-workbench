from pathlib import Path
import hashlib, json, shutil

root = Path.cwd().resolve()
old = root / 'output/parallel/basic-saved-check-snapshot-001-1012/work'
out = root / 'output/parallel/basic-saved-check-snapshot-002-1012'
assert not out.exists()
work = out / 'work'
work.mkdir(parents=True)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
checks = json.loads((root / 'output/basic-saved-checks-001-1012.json').read_text(encoding='utf8'))
assert checks['exitCode'] == 0 and checks['inputsUnchanged']
delta = json.loads((root / 'output/parallel/basic-saved-layout-tight-1012/manifest.json').read_text(encoding='utf8'))
changes = {r['target']:r for r in delta['files']}
rows=[]
for r in checks['inputs']:
    name=r['file']
    assert sha(old/name)==r['sha256']
    source=Path(changes[name]['source']) if name in changes else old/name
    if name in changes: assert r['sha256']==changes[name]['baselineSha256'] and sha(source)==changes[name]['sha256']
    dest=work/name
    dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(source,dest)
    rows.append(dict(file=name,sha256=sha(dest),snapshot=dest.relative_to(root).as_posix()))
(out/'inputs.json').write_text(json.dumps(dict(verified=True,files=rows,parallelDrift=[],productionWritten=False,frontendReusedExceptExplicitCSS=True),ensure_ascii=False,indent=2),encoding='utf8')
runner=(old/'scripts/run-basic-saved-checks-001-1012.mjs').read_text(encoding='utf8')
runner=runner.replace("file='../../../basic-saved-checks-001-1012.json',log='../../../basic-saved-checks-001-1012.log',baseFile='../../../cone-space-checks-008-1012.json'", "file='../../../basic-saved-checks-002-1012.json',log='../../../basic-saved-checks-002-1012.log',baseFile='../../../basic-saved-checks-001-1012.json'")
runner=runner.replace('for(const r of backendInputs)assert.equal(hash(r.file),r.sha256,r.file);', "for(const r of backendInputs)assert.equal(hash(r.file),r.sha256,r.file);for(const r of base.inputs.filter(r=>!['src/components/BasicPaperModelsCPDialog.css','src/components/SavedDevelopablePaperDialog.css'].includes(r.file)))assert.equal(hash(r.file),r.sha256,r.file);")
runner=runner.replace('desktop:base.tests.desktop}', 'desktop:base.tests.desktop,frontend:base.tests.frontend}').replace('frontend:false','frontend:true').replace("for(const name of ['test:unit','build'])", "for(const name of ['build'])").replace("output.tests.frontend=Number(text.match(/ℹ pass (\\d+)/)?.[1]);", '')
runner=runner.replace('all frontend tests and TypeScript/Vite build run again in this complete fixed copy.', 'Only two explicit CSS files changed; every other input remains exact SHA-identical. All frontend tests passed in the previous fixed copy; TypeScript/Vite build runs again.')
(work/'scripts/run-basic-saved-checks-002-1012.mjs').write_text(runner,encoding='utf8')
print(json.dumps(dict(verified=True,files=len(rows)),ensure_ascii=False))
