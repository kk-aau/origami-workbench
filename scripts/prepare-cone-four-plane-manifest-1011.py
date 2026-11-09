from pathlib import Path
import hashlib
import json

root = Path.cwd().resolve()
base = root / 'output/parallel/original-cone-four-plane-cp-4039-1011'
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
frozen = json.loads((base / 'freeze.json').read_text(encoding='utf8'))
assert len(frozen['files']) == 74
for row in frozen['files']:
    file = (base / row.get('path', row.get('file'))).resolve()
    assert file.is_relative_to(root / 'output')
    assert sha(file) == row['sha256'], file
old = json.loads((root / 'output/audits/original-planar-ruled-final-1011.json').read_text(encoding='utf8'))
assert len(old['snapshots']) == 3485
for row in old['snapshots']:
    assert sha(root / old['archive'] / row['file']) == row['sha256'], row['file']
manifest = json.loads((base / 'manifest.json').read_text(encoding='utf8'))
assert sha(base / 'manifest.json') == frozen['manifestSha256']
references = []
for ref in manifest['independentSourceReferences']:
    index_file = (base / ref['path']).resolve()
    assert index_file.is_relative_to(root / 'output')
    assert sha(index_file) == ref['sha256']
    index = json.loads(index_file.read_text(encoding='utf8'))
    assert len(index['files']) == ref['files']
    for row in index['files']:
        file = (index_file.parent / row.get('path', row.get('file'))).resolve()
        assert file.is_relative_to(root / 'output')
        assert sha(file) == row['sha256'], file
    references.append(dict(index=str(index_file.relative_to(root)), sha256=sha(index_file), files=ref['files']))
expected = {
    'src/app/coneFourPlaneCP4039.ts', 'src/components/ConeFourPlaneCP4039Dialog.tsx',
    'src/components/ConeFourPlaneCP4039Dialog.css', 'tests/app/coneFourPlaneCP4039.test.ts',
    'tests/fixtures/cone-four-plane-cp-4039-20261011.json',
}
assert {row['path'] for row in manifest['targets']} == expected
rows = []
for row in manifest['targets']:
    assert not (root / row['path']).exists(), row['path']
    after = base / 'delivery/after' / row['path']
    assert sha(after) == row['sha256']
    rows.append(dict(target=row['path'], baselineSha256=None, sha256=row['sha256'], source=str(after)))
patch = base / manifest['patch']
assert sha(patch) == manifest['patchSha256']
target = base / 'root-integration-manifest-1011.json'
assert not target.exists()
target.write_text(json.dumps(dict(files=rows, patchSha256=sha(patch), frozenFilesVerified=74, previousP58FrozenFilesVerified=3485, independentReferences=references, allFiveFilesNew=True), ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps(dict(targets=5, frozen=74, previous=3485, independentFiles=sum(row['files'] for row in references))))
