from pathlib import Path
import hashlib
import json

root = Path.cwd().resolve()
hash_file = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
indexes = [
    ('original-nonuniform-spiral-3968-cp-source-1011/SOURCE-CONTRACT-FROZEN.json', '33d2b0f148b67698870b5f1566cc3a7efe9849d247825a435210e3dcaae6c051', 38),
    ('original-nonuniform-spiral-3968-cp-independent-source-1011/freeze.json', 'd4c74a8f0d63d78499bd0f70bf7c5d5d216067ff713574bad8cf922d05185be7', 26),
    ('original-nonuniform-spiral-3968-cp-width-supplement-1011/freeze.json', 'cfee9ae36e68e6e4f7376a7617ccd1f37f806806eff7a35070c79f401f1b6703', 23),
    ('original-nonuniform-spiral-3968-root-wiring-r2-1011/freeze.json', 'ef0bd7445998f8d40dfb2d1862cc4fa65877f3befcb2df95c57fe3acbd5722c1', 4),
]
rows = []
for name, expected_sha, count in indexes:
    p = root / 'output/parallel' / name
    assert hash_file(p) == expected_sha, name
    packet = json.loads(p.read_text(encoding='utf8'))
    assert len(packet['files']) == count, name
    for item in packet['files']:
        f = (root / item['file']).resolve() if 'file' in item else (p.parent / item['path']).resolve()
        assert f.is_relative_to(p.parent), str(f)
        assert hash_file(f) == item['sha256'], str(f)
    rows.append(dict(file=str(p.relative_to(root)).replace('\\', '/'), sha256=expected_sha, checkedFiles=count))
notebook = root / 'tmp/Origamica-15.0-reference.nb'
notebook_sha = '19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9'
assert hash_file(notebook) == notebook_sha
before = [('src/App.tsx','c5504bb4eecd24f47a6f4f6ae9259432e02c0800bd813d4acfe1ee0fbd2d6d8d'),
          ('src/components/TessellationPanel.tsx','c3a624154e0688a63ce04756d1a6a0b7594b6e2762d6aef6ba1708fb7217eb13')]
for name, expected_sha in before:
    assert hash_file(root / name) == expected_sha
new_targets = ['src/app/nonuniformSpiralCP3968.ts','src/components/NonuniformSpiralCP3968Dialog.tsx',
               'src/components/NonuniformSpiralCP3968Dialog.css','tests/app/nonuniformSpiralCP3968.test.ts',
               'tests/fixtures/nonuniform-spiral-cp-3968-20261011.json']
assert all(not (root / p).exists() for p in new_targets)
out = root / 'output/original-nonuniform-spiral-source-phase-1011.json'
assert not out.exists()
out.write_text(json.dumps(dict(verified=True, indexes=rows, checkedFiles=sum(r['checkedFiles'] for r in rows),
    notebookSha256=notebook_sha, productionUnchanged=True, newTargetsAbsent=True,
    mathematicalLimit='Conditional local inset only; every actual native finite graph still requires validation; no Wolfram, interval ODE or finite rigid 3D certificate.'), ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps(dict(verified=True,checkedFiles=sum(r['checkedFiles'] for r in rows),productionUnchanged=True)))
