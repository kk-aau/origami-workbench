from pathlib import Path
import hashlib
import json
import difflib
import shutil

root = Path.cwd().resolve()
base = root / 'output/parallel/practical-editors-root-delivery-1011'
assert not base.exists(), '保留既有交付'
base.mkdir(parents=True)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
tile = root / 'output/parallel/private-custom-tile-editing-1011'
discrete = root / 'output/parallel/private-discrete-npoints-editor-1011'
rows = [dict(target='src/components/TileAssemblyEditor.tsx',
    baselineSha256='1f869976c240104a8e51680513ce1e6060f2e159ecb33513898e18baa0e50ccf',
    sha256='6a7b02733985bd177a68e0ae4ad15e17e1a7c340a4c9d0d49492eb778c2164f2',
    source=tile / 'src/components/TileAssemblyEditor.tsx')]
manifest = json.loads((discrete / 'delivery/manifest.json').read_text(encoding='utf-8'))
for row in manifest['targets']:
    rows.append(dict(target=row['file'], baselineSha256=row['before'], sha256=row['after'],
                     source=discrete / 'work' / row['file']))
assert len(rows) == 6
changes = []
for row in rows:
    target, source = root / row['target'], Path(row['source'])
    before = sha(target) if target.exists() else None
    assert before == row['baselineSha256'] and sha(source) == row['sha256'], row['target']
    delivered = base / 'files' / row['target']
    delivered.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, delivered)
    row['source'] = str(delivered)
    row['kind'] = 'modified' if before else 'new'
    changes.extend(difflib.unified_diff(target.read_text(encoding='utf-8').splitlines(True) if before else [],
        delivered.read_text(encoding='utf-8').splitlines(True),
        fromfile='a/' + row['target'] if before else '/dev/null', tofile='b/' + row['target']))
patch = base / 'practical-editors.patch'
patch.write_text(''.join(changes), encoding='utf-8', newline='')
(base / 'manifest.json').write_text(json.dumps(dict(files=rows, patchSha256=sha(patch),
    sourceMathOrUnitsChanged=False, existingPackageModified=False,
    upstreamIndexes=[dict(file=p.relative_to(root).as_posix(), sha256=sha(p)) for p in
        [tile / 'freeze.json', discrete / 'freeze.json', discrete / 'delivery/freeze.json']]),
    ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(dict(files=6, oldPackageModified=False, sourceMathOrUnitsChanged=False)))
