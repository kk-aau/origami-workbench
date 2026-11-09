from pathlib import Path
import hashlib, json, difflib

root=Path.cwd().resolve()
out=root/'output/parallel/rotational-pleats-backend-tests-root-1012'
assert not out.exists()
out.mkdir()
original=root/'output/parallel/rotational-pleats-strain-1012/tests_backend.py'
source=original.read_text(encoding='utf8')
needle="OUT=Path(__file__).resolve().parent;sys.path.insert(0,str(OUT/'candidate/backend'))"
assert source.count(needle)==1
source=source.replace(needle,"ROOT=Path(__file__).resolve().parents[1];FIXTURE=json.loads((ROOT/'tests/fixtures/rotational-pleats-engineering-roots-1012.json').read_text(encoding='utf8'))['cases']")
source=source.replace("return json.loads((OUT/(name+'-candidate-query.json')).read_text(encoding='utf8'))['query']", "return copy.deepcopy(FIXTURE[name]['query'])")
source=source.replace("old=json.loads((OUT/(model+'-candidate-root.json')).read_text(encoding='utf8'))", "old=FIXTURE[model]")
assert 'OUT/' not in source and 'candidate/backend' not in source
name='backend/test_tessellation_rotational_pleats_strain.py'
assert not (root/name).exists()
dest=out/name
dest.parent.mkdir(parents=True)
dest.write_text(source,encoding='utf8')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
patch=out/'backend-tests.patch'
patch.write_text(''.join(difflib.unified_diff([],source.splitlines(True),fromfile='/dev/null',tofile='b/'+name)),encoding='utf8')
(out/'manifest.json').write_text(json.dumps(dict(files=[dict(target=name,source=str(dest),baselineSha256=None,sha256=sha(dest),kind='new')],patchSha256=sha(patch),originalTestPath=str(original),originalTestSHA256=sha(original),fixturePath='tests/fixtures/rotational-pleats-engineering-roots-1012.json',tests=5,actualBackendImport=True),ensure_ascii=False,indent=2),encoding='utf8')
