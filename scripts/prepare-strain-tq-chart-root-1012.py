from pathlib import Path
import hashlib, json, shutil

root = Path.cwd().resolve()
base = root / 'output/parallel/strain-tq-chart-binding-delta-1012'
out = root / 'output/parallel/strain-tq-chart-root-delivery-1012'
assert not out.exists()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(base / 'manifest.json') == 'e942198aeae1d8debbb62fbff7e9e8773d7a3f20b709ef76a6c196b9ea82fd1a'
assert sha(base / 'freeze.json') == '2356ae9565f985f44a117ac98ff97122123d27ad1a122c27eb6963bc131885b2'
manifest = json.loads((base / 'manifest.json').read_text(encoding='utf8'))
out.mkdir()
files = []
for row in manifest['targetFiles']:
    source = Path(row['candidate'])
    assert sha(source) == row['sha256']
    assert sha(root / row['target']) == row['baselineSHA256'], row['target']
    dest = out / row['target']
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, dest)
    files.append(dict(target=row['target'], source=str(dest), baselineSha256=row['baselineSHA256'], sha256=row['sha256'], kind='replace'))
patch = base / 'candidate.patch'
assert sha(patch) == 'a5a9016526b42790c00a4671e0203274484461ac516112ed824d4601ec24ab8f'
shutil.copy2(patch, out / 'chart.patch')
(out / 'manifest.json').write_text(json.dumps(dict(files=files, patchSha256=sha(patch), originalManifestSHA256=sha(base/'manifest.json'), originalFreezeSHA256=sha(base/'freeze.json')), ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps(dict(verified=True, targets=len(files)), ensure_ascii=False))
