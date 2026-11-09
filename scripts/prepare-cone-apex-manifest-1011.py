from pathlib import Path
import hashlib
import json

root = Path.cwd().resolve()
base = root / 'output/parallel/original-cone-four-plane-apex-cp-1011'
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
frozen = json.loads((base / 'DELIVERY-FROZEN.json').read_text(encoding='utf8'))
assert len(frozen['files']) == 16
for row in frozen['files']:
    file = (base / row.get('path', row.get('file'))).resolve()
    assert file.is_relative_to(base)
    assert not any(part in ['deps', 'node_modules'] for part in file.relative_to(base).parts)
    assert sha(file) == row['sha256'], file
manifest_file = base / 'delivery/manifest.json'
manifest = json.loads(manifest_file.read_text(encoding='utf8'))
assert sha(manifest_file) == frozen['manifestSha256']
previous_file = root / 'output/audits/original-cone-four-plane-final-1011.json'
previous = json.loads(previous_file.read_text(encoding='utf8'))
assert len(previous['snapshots']) == 3462
original = {row['file']: row['sha256'] for row in previous['snapshots']}
for row in previous['snapshots']:
    assert sha(root / previous['archive'] / row['file']) == row['sha256'], row['file']
expected = {
    'src/app/coneFourPlaneCP4039.ts', 'src/components/ConeFourPlaneCP4039Dialog.tsx',
    'src/components/ConeFourPlaneCP4039Dialog.css', 'tests/app/coneFourPlaneCP4039.test.ts',
    'tests/fixtures/cone-four-plane-cp-4039-20261011.json',
}
assert {row['path'] for row in manifest['targets']} == expected
rows = []
for row in manifest['targets']:
    name = row['path']
    before, after = base / 'delivery/before' / name, base / 'delivery/after' / name
    assert sha(root / name) == original[name], name
    assert sha(before) == original[name], name
    assert sha(after) == row['sha256'], name
    rows.append(dict(target=name, baselineSha256=original[name], sha256=sha(after), source=str(after)))
patch = (base / manifest['patch']).resolve()
assert patch.is_relative_to(base)
assert sha(patch) == manifest['patchSha256']
source_base = root / 'output/parallel/original-cone-four-plane-apex-source-1011'
source_index = source_base / 'SOURCE-APEX-FROZEN.json'
assert sha(source_index) == 'b06e4fa10b4cfd6e0dd9bb97d3f6de2cd3d03b83cb3ecaebfa4acb02bc61e288'
source = json.loads(source_index.read_text(encoding='utf8'))
assert len(source['files']) == 20
for row in source['files']:
    assert sha(source_base / row.get('path', row.get('file'))) == row['sha256']
target = base / 'root-integration-manifest-1011.json'
assert not target.exists()
target.write_text(json.dumps(dict(files=rows, patchSha256=sha(patch), frozenFilesVerified=len(frozen['files']),
    previousP59FrozenFilesVerified=3462, sourceFilesVerified=20,
    samePublicRootEntries=True, sharedBackendAndCoreNotPatched=True), ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps(dict(targets=5, frozen=len(frozen['files']), previous=3462, source=20)))
