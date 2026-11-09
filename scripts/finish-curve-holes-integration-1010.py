from pathlib import Path
import hashlib
import json

root = Path.cwd().resolve()
base = root / 'output/parallel/complex-holes-1010/delivery'
manifest = json.loads((base / 'manifest.json').read_text(encoding='utf8'))['files']
backup = root / 'output/parallel/integration-curve-holes-1010-before'
records = json.loads((backup / 'before.json').read_text(encoding='utf8'))
for item, record in zip(manifest, records, strict=True):
    target, source = (root / item['target']).resolve(), (base / 'files' / item['target']).resolve()
    assert target.is_relative_to(root) and source.is_relative_to(base)
    assert hashlib.sha256(source.read_bytes()).hexdigest() == item['newSha256']
    if item['operation'] == 'add':
        assert record['before'] is None
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())
    elif record['before'] == record['sourceBefore']:
        assert target.read_text(encoding='utf8') == source.read_text(encoding='utf8'), item['target']
        if target.read_bytes() != source.read_bytes():
            target.write_bytes(source.read_bytes())
    record['mergedAfter'] = hashlib.sha256(target.read_bytes()).hexdigest()
(root / 'output/parallel/curve-holes-integrated-1010.json').write_text(json.dumps({'verified': True, 'files': records}, ensure_ascii=False, indent=2), encoding='utf8')
print('All curve-hole files verified; restored only two newly added files affected by a patch delimiter.')
