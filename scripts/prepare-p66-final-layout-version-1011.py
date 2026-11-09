from pathlib import Path
import hashlib
import json
import difflib
import shutil

root = Path.cwd().resolve()
base = root / 'output/parallel/original-uniform-helix-extended-final-layout-version-1011'
assert not base.exists()
base.mkdir(parents=True)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
layout = root / 'output/parallel/original-uniform-helix-extended-ui-layout-delta-1011'
version = root / 'output/parallel/original-uniform-helix-extended-version-002-1011'
items = []
for row in json.loads((layout / 'integration-delta.json').read_text())['targets']:
    items.append(dict(target=row['productionRelativeTarget'], baselineSha256=row['beforeSHA256'],
                      sha256=row['sha256'], source=str(layout / row['candidatePath']), kind='modified'))
items += json.loads((version / 'manifest.json').read_text(encoding='utf-8'))['files']
assert len(items) == 6
patches = []
for row in items:
    target, source = root / row['target'], Path(row['source'])
    assert sha(target) == row['baselineSha256'] and sha(source) == row['sha256']
    delivered = base / 'files' / row['target']
    delivered.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, delivered)
    row['source'] = str(delivered)
    patches.extend(difflib.unified_diff(target.read_text(encoding='utf-8').splitlines(True),
                                      delivered.read_text(encoding='utf-8').splitlines(True),
                                      fromfile='a/' + row['target'], tofile='b/' + row['target']))
patch = base / 'final-layout-version.patch'
patch.write_text(''.join(patches), encoding='utf-8', newline='')
(base / 'manifest.json').write_text(json.dumps(dict(files=items, patchSha256=sha(patch),
    upstreamLayoutFreeze=sha(layout / 'freeze.json'), upstreamVersionManifest=sha(version / 'manifest.json'),
    sourceMathChanged=False, dependenciesChanged=False, version='0.13.6'), ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(dict(files=6, sourceMathChanged=False, dependenciesChanged=False)))
