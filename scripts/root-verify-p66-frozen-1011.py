from pathlib import Path
import hashlib
import json
import sys

root = Path.cwd().resolve()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
rows = []
for name in sys.argv[2:]:
    index = (root / name).resolve()
    data = json.loads(index.read_text(encoding='utf-8-sig'))
    assert isinstance(data.get('files'), list), name
    verified = []
    for key in ['files', 'authorBrowserFiles', 'actualFiles', 'nonUserInputs',
                'actualUserDownloads', 'actualNonUserInputs', 'actualUserFiles',
                'externalInputs', 'references', 'sourceBindings']:
        values = data.get(key)
        if not isinstance(values, list):
            continue
        for row in values:
            if not isinstance(row, dict) or 'sha256' not in row:
                continue
            raw = row.get('file', row.get('path'))
            if not raw:
                continue
            p = Path(raw)
            if not p.is_absolute():
                p = index.parent / p if (index.parent / p).is_file() else root / p
            p = p.resolve()
            assert p.is_relative_to(root) and p.is_file(), str(p)
            assert sha(p) == row['sha256'], str(p)
            verified.append(dict(file=p.relative_to(root).as_posix(), sha256=row['sha256']))
    rows.append(dict(index=name, sha256=sha(index), files=len(data['files']),
                     verifiedExplicitRows=len(verified), verified=verified))
target = root / sys.argv[1]
assert not target.exists(), '保留以前的核验记录'
target.write_text(json.dumps(dict(verified=True, indexes=rows), ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(dict(verified=True, indexes=len(rows), rows=sum(r['verifiedExplicitRows'] for r in rows))))
