from pathlib import Path
import hashlib,json,shutil

root=Path.cwd().resolve()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
base=root/'output/parallel/strain-tq-source-trace-delta-1012'
out=root/'output/parallel/strain-tq-trace-root-delivery-1012'
assert not out.exists()
out.mkdir()
assert sha(base/'manifest.json')=='944bbaa250b313c09c8ac3c27cf1bea27b03c21c06a55a17540985d9ad72f98f'
baseline=json.loads((root/'output/parallel/strain-tq-practical-cp-1012/manifest.json').read_text(encoding='utf8'))
before={r['path']:r['sha256'] for r in baseline['targets']}
manifest=json.loads((base/'manifest.json').read_text(encoding='utf8'))
files=[]
for r in manifest['files']:
    if not r['path'].startswith('candidate/'):
        continue
    name=r['path'][len('candidate/'):]
    p=base/r['path']
    assert sha(p)==r['sha256'] and sha(root/name)==before[name],name
    dest=out/name
    dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(p,dest)
    files.append(dict(target=name,source=str(dest),baselineSha256=before[name],sha256=r['sha256'],kind='replace'))
assert len(files)==2
patch=base/'candidate.patch'
assert sha(patch)=='f6a345d0c64ea5780c2304f76067cf85787a4405f39ec21842bb125c22e60ad3'
shutil.copy2(patch,out/'trace.patch')
(out/'manifest.json').write_text(json.dumps(dict(files=files,patchSha256=sha(patch),sourceManifestSHA256=sha(base/'manifest.json')),ensure_ascii=False,indent=2),encoding='utf8')
