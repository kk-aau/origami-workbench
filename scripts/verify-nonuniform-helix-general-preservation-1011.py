from pathlib import Path
import hashlib
import json
import os

root = Path.cwd().resolve()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda name: json.loads((root / name).read_text(encoding='utf-8-sig'))
previous = read('output/audits/original-uniform-helix-general-final-1011.json')
assert len(previous['snapshots']) == 4182
old = {row['file']: row['sha256'] for row in previous['snapshots']}
for row in previous['snapshots']:
    assert sha(root / previous['archive'] / row['file']) == row['sha256'], row['file']
records = ['output/parallel/' + name + '-integrated-1010.json' for name in
           ['original-nonuniform-helix-general-cp-3966',
            'original-nonuniform-helix-general-root-wiring']]
expected = dict(old)
mapped = {}
for name in records:
    record = read(name)
    assert record['verified']
    for row in record['files']:
        assert expected.get(row['file']) == row['before'], row['file']
        expected[row['file']] = row['after']
        mapped[row['file']] = row['after']
assert len(mapped) == 7
for name, value in mapped.items():
    assert sha(root / name) == value, name
protected = {name: value for name, value in old.items()
             if name.startswith(('src/', 'backend/', 'tests/')) and name not in mapped}
for name, value in protected.items():
    assert sha(root / name) == value, name
census = set()
for folder in ['src', 'backend', 'tests']:
    for current, dirs, files in os.walk(root / folder, followlinks=False):
        dirs[:] = [name for name in dirs if name != '__pycache__'
                   and not (Path(current) / name).is_symlink()
                   and not (hasattr(Path(current) / name, 'is_junction')
                            and (Path(current) / name).is_junction())]
        census.update((Path(current) / name).relative_to(root).as_posix() for name in files)
assert census == set(protected) | set(mapped), sorted(census - set(protected) - set(mapped))
target = root / 'output/original-nonuniform-helix-general-preservation-1011.json'
assert not target.exists()
result = dict(verified=True, previousArchive=previous['archive'],
              previousArchiveFilesVerified=4182, mappedFiles=len(mapped),
              lastSourceHashes=mapped, integrationReports=records,
              unchangedProductionInputs=len(protected), noUnmappedProductionChanges=True,
              completeOrigamicaGoal=False)
target.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(dict(verified=True, mapped=len(mapped), unchanged=len(protected))))
