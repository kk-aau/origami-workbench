from pathlib import Path
import hashlib
import json

root = Path.cwd().resolve()
base = root / 'output/parallel/original-courteous-graph-1010'
original = base / 'delivery-manifest.json'
manifest_sha = '3e72499442eb163bb707a29d57915ef449e856a49e05e986f40ebf6ea95e6818'
patch_sha = '8b92d8785e916b35a70d16e13d3d42c2c7983cb632f75dd9bd099c3bf6ae7e1f'
assert hashlib.sha256(original.read_bytes()).hexdigest() == manifest_sha
assert hashlib.sha256((base / 'courteous-graph.patch').read_bytes()).hexdigest() == patch_sha
raw = json.loads(original.read_text(encoding='utf8'))
files = []
for row in raw['targets']:
    source = (base / 'delivery' / row['path']).resolve()
    assert source.is_relative_to(base)
    assert hashlib.sha256(source.read_bytes()).hexdigest() == row['afterSha256'], row['path']
    files.append({
        'target': row['path'], 'baselineSha256': row['baselineSha256'],
        'sha256': row['afterSha256'], 'source': str(source),
        'kind': 'new fixture separate from patch' if not row['patchIncluded'] else row['kind'],
    })
assert len(files) == 16
with (base / 'root-integration-manifest.json').open('x', encoding='utf8') as stream:
    json.dump({'patchSha256': patch_sha, 'sourceManifest': str(original),
               'sourceManifestSha256': manifest_sha, 'files': files,
               'producerManifestUnchanged': True}, stream, indent=2)
print('Prepared exact hash-verified Graph adapter; frozen delivery unchanged.')
