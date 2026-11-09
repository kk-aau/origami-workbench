from pathlib import Path
import hashlib,json,difflib

root=Path.cwd().resolve()
out=root/'output/parallel/strain-tq-backend-tests-root-1012'
assert not out.exists()
out.mkdir()
original=root/'output/parallel/strain-tq-practical-cp-1012/test_backend.py'
source=original.read_text(encoding='utf8')
needle="HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE/'candidate/backend'))"
assert source.count(needle)==1
source=source.replace(needle,"ROOT=Path(__file__).resolve().parents[1]")
source=source.replace("HERE/'candidate/tests/fixtures/strain-tq-source-1012.json'", "ROOT/'tests/fixtures/strain-tq-source-1012.json'")
assert "HERE/" not in source and 'candidate/backend' not in source
name='backend/test_tessellation_strain_tq_practical.py'
assert not (root/name).exists()
dest=out/name
dest.parent.mkdir(parents=True)
dest.write_text(source,encoding='utf8')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
patch=out/'backend-tests.patch'
patch.write_text(''.join(difflib.unified_diff([],source.splitlines(True),fromfile='/dev/null',tofile='b/'+name)),encoding='utf8')
(out/'manifest.json').write_text(json.dumps(dict(files=[dict(target=name,source=str(dest),baselineSha256=None,sha256=sha(dest),kind='new')],patchSha256=sha(patch),originalTestPath=str(original),originalTestSHA256=sha(original),tests=10,actualBackendImport=True),ensure_ascii=False,indent=2),encoding='utf8')
