from pathlib import Path
import hashlib
import json

root = Path.cwd().resolve()
base = root / 'output/parallel/original-cone-four-plane-root-wiring-1011'
assert base.is_relative_to(root / 'output/parallel')
patch = base / 'entry.patch'
manifest_file = base / 'manifest.json'
manifest = json.loads(manifest_file.read_text(encoding='utf8'))
sha = lambda data: hashlib.sha256(data).hexdigest()
before = patch.read_bytes()
assert sha(before) == manifest['patchSha256']
assert b'\r\n' in before
for file, data in [('initial-entry.patch', before), ('initial-manifest.json', manifest_file.read_bytes())]:
    target = base / file
    assert not target.exists()
    target.write_bytes(data)
after = before.replace(b'\r\n', b'\n')
patch.write_bytes(after)
manifest['patchSha256'] = sha(after)
manifest['draftPatchLineEndingFix'] = dict(before=sha(before), after=sha(after), retained='initial-entry.patch', productionWritten=False)
manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps(dict(normalizedPatchLineEndings=True, productionWritten=False)))
