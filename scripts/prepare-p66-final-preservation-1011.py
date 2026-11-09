from pathlib import Path

root = Path.cwd()
s = (root / 'scripts/verify-uniform-helix-extended-preservation-1011.py').read_text(encoding='utf-8')
changes = {
    "['original-uniform-helix-extended-root-delivery']":
    "['original-uniform-helix-extended-root-delivery', 'original-uniform-helix-extended-final-layout-version']",
    'assert len(mapped) == 10': 'assert len(mapped) == 14',
    'assert census == set(protected) | set(mapped), sorted(census - set(protected) - set(mapped))':
    "mapped_scope = {name for name in mapped if name.startswith(('src/', 'backend/', 'tests/'))}\nassert census == set(protected) | mapped_scope, sorted(census - set(protected) - mapped_scope)",
    "target = root / 'output/original-uniform-helix-extended-preservation-1011.json'":
    "target = root / 'output/original-uniform-helix-extended-final-preservation-1011.json'",
}
for before, after in changes.items():
    assert s.count(before) == 1, before
    s = s.replace(before, after, 1)
p = root / 'scripts/verify-uniform-helix-extended-final-preservation-1011.py'
assert not p.exists()
p.write_text(s, encoding='utf-8')
