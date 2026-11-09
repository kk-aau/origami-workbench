from pathlib import Path
import hashlib
import json
import subprocess

root = Path.cwd().resolve()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
record = root / 'output/original-spiral-refold-tabs-fix-build-1011.json'
log = root / 'output/original-spiral-refold-tabs-fix-build-1011.log'
assert not record.exists() and not log.exists()
base_name = 'output/original-spiral-refold-checks-1011.json'
base = json.loads((root / base_name).read_text(encoding='utf-8'))
assert base['exitCode'] == 0 and base['inputsUnchanged'] and base['backendInputsUnchanged']
allowed = {'src/components/SpiralRefoldCP3980Dialog.tsx', 'src/components/SpiralRefoldCP3980Dialog.css'}
changes = []
for row in base['inputs']:
    current = sha(root / row['file'])
    if current != row['sha256']:
        assert row['file'] in allowed, row['file']
        changes.append(dict(file=row['file'], before=row['sha256'], after=current))
assert {row['file'] for row in changes} == allowed
stages = []
with log.open('w', encoding='utf-8', newline='\n') as stream:
    for name, args in [('type', ['node', 'node_modules/typescript/bin/tsc', '-b']),
                       ('build', ['node', 'node_modules/vite/bin/vite.js', 'build'])]:
        result = subprocess.run(args, cwd=root, stdout=stream, stderr=subprocess.STDOUT)
        stages.append(dict(name=name, exitCode=result.returncode))
        stream.flush()
        if result.returncode:
            record.write_text(json.dumps(dict(verified=False, stages=stages), indent=2), encoding='utf-8')
            raise SystemExit(result.returncode)
index = (root / 'dist/index.html').read_text(encoding='utf-8')
import re
bundles = re.findall(r'src="(/assets/main-[A-Za-z0-9_-]+\.js)"', index)
assert len(bundles) == 1
files = [p for p in (root / 'dist').rglob('*') if p.is_file()]
assert len(files) == 26
for row in base['inputs']:
    assert sha(root / row['file']) == next((r['after'] for r in changes if r['file'] == row['file']), row['sha256']), row['file']
record.write_text(json.dumps(dict(verified=True, stages=stages, eightStagesPassed=True,
    baseRun=base_name, baseRunSha256=sha(root / base_name), tests=base['tests'],
    sourceChangesAfterEightStages=changes, onlyViewSourceChanged=True,
    allOtherEightStageInputsUnchanged=True, finalTypeBuildPassed=True,
    finalBuildLogSha256=sha(log), bundle=bundles[0],
    files=[dict(file=p.relative_to(root).as_posix(), sha256=sha(p)) for p in sorted(files)],
    actualMainRequired=True), ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(dict(verified=True, bundle=bundles[0], assets=len(files), stages=stages)))
