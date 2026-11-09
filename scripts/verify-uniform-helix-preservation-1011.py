from pathlib import Path
import hashlib
import json

root = Path.cwd().resolve()
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
previous = json.loads((root / 'output/audits/original-nonuniform-spiral-final-1011.json').read_text(encoding='utf8'))
assert len(previous['snapshots']) == 3645
original = {r['file']: r['sha256'] for r in previous['snapshots']}
for row in previous['snapshots']:
    assert sha(root / previous['archive'] / row['file']) == row['sha256'], row['file']
records = ['output/parallel/original-uniform-helix-cp-3951-integrated-1010.json', 'output/parallel/original-uniform-helix-parent-cascade-integrated-1010.json', 'output/parallel/original-uniform-helix-fixed-origin-integrated-1010.json', 'output/parallel/original-uniform-helix-root-wiring-integrated-1010.json']
latest = {}
for name in records:
    record = json.loads((root / name).read_text(encoding='utf8'))
    assert record['verified'] is True
    for row in record['files']:
        assert row['before'] == latest.get(row['file'], original.get(row['file'])), row['file']
        latest[row['file']] = row['after']
for name, value in latest.items():
    assert sha(root / name) == value, name
unchanged = 0
for name, value in original.items():
    if name.startswith(('src/', 'backend/', 'tests/')) or name == 'package.json':
        current = sha(root / name)
        assert current == latest.get(name, value), name
        if current == value:
            unchanged += 1
for folder in ['src', 'backend', 'tests']:
    for file in (root / folder).rglob('*'):
        if not file.is_file() or '__pycache__' in file.parts:
            continue
        name = file.relative_to(root).as_posix()
        assert name in original or name in latest, name
cores = ['src/core/dxf.ts', 'src/core/formats.ts', 'src/core/geometry.ts', 'src/core/flatFold.ts',
    'src/core/cpPathOptimizer.ts', 'src/core/cpProcessingExport.ts',
    'backend/tessellation_curved_discretization.py', 'backend/tessellation_curved_discretization_generic.py',
    'backend/tessellation_curved_discretization_query.py', 'backend/tessellation_curved_conic_section_generic.py',
    'backend/tessellation_curved_planar_sequence_generic.py']
for name in cores:
    assert sha(root / name) == original[name], name
out = root / 'output/original-uniform-helix-preservation-1011.json'
assert not out.exists()
report = dict(verified=True, previousArchive=previous['archive'], previousArchiveFilesVerified=3645,
    integrationReports=records, mappedFiles=len(latest), lastSourceHashes=latest, unchangedProductionInputs=unchanged,
    noUnmappedProductionChanges=True, cores=cores, fiveNewSourceTargets=True,
    twoExistingConnectionTargets=True, completeOrigamicaGoal=False)
out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps(dict(verified=True, previousFiles=3645, mapped=len(latest), unchanged=unchanged)))
