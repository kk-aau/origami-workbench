from pathlib import Path
import hashlib
import json

root = Path.cwd().resolve()
base = root / 'output/parallel/original-cone-four-plane-apex-source-1011'
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
index_file = base / 'SOURCE-APEX-FROZEN.json'
assert sha(index_file) == 'b06e4fa10b4cfd6e0dd9bb97d3f6de2cd3d03b83cb3ecaebfa4acb02bc61e288'
index = json.loads(index_file.read_text(encoding='utf8'))
assert len(index['files']) == 20
for row in index['files']:
    file = (base / row.get('path', row.get('file'))).resolve()
    assert file.is_relative_to(base)
    assert sha(file) == row['sha256'], file
manifest = json.loads((base / 'manifest.json').read_text(encoding='utf8'))
assert manifest['independentChecks'] == 91818
assert manifest['precision'] == 80
for key in ['producerImported', 'backendImported', 'serviceStarted', 'actualBrowserRun', 'productionWritten']:
    assert manifest[key] is False, key
assert manifest['userDownloadsCreated'] == 0
oracle = json.loads((base / 'independent-apex-oracle.json').read_text(encoding='utf8'))
assert oracle['verified'] is True and oracle['passed'] is True
assert oracle['checks'] == 91818
assert oracle['safeRadialGapLowerBounds'] == [1.1, 1.1, .5, .7]
domain = manifest['paperDomain']
assert domain['parameterRectangleInjective'] is False
assert domain['quotientSheetInjective'] is True
assert domain['apexInverseParameterUnique'] is False
assert domain['JacobianAtApex'] == 0
assert domain['uniformStrictPositiveJacobianLowerBoundWholePaper'] is None
assert sha(root / 'tmp/Origamica-15.0-reference.nb') == '19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9'
previous = json.loads((root / 'output/audits/original-cone-four-plane-final-1011.json').read_text(encoding='utf8'))
assert len(previous['snapshots']) == 3462
for row in previous['snapshots']:
    assert sha(root / previous['archive'] / row['file']) == row['sha256'], row['file']
for name, value in previous['preservation']['lastSourceHashes'].items():
    assert sha(root / name) == value, name
for ref in manifest['oldFreezePreservation']:
    other = root / ref['directory']
    assert sha(other / ref['index']) == ref['indexSHA256']
    frozen = json.loads((other / ref['index']).read_text(encoding='utf8'))
    assert len(frozen['files']) == ref['fileCount']
    for row in frozen['files']:
        assert sha(other / row.get('path', row.get('file'))) == row['sha256']
out = root / 'output/original-cone-four-plane-apex-source-phase-verified-1011.json'
assert not out.exists()
report = dict(verified=True, index=str(index_file.relative_to(root)), indexSha256=sha(index_file), listedFilesVerified=20,
    independentMathematicalChecks=91818, precision=80, originalNotebookSha256=sha(root / 'tmp/Origamica-15.0-reference.nb'),
    previousP59ArchiveFilesVerified=3462, currentP59SourceTargetsUnchanged=7,
    quotientSheetInjective=True, parameterRectangleInjective=False, jacobianAtApex=0,
    currentApexImplementationVerified=False, mainAppVerified=False, userDownloads=0,
    flatFoldVerified=False, layersVerified=False, threeDVerified=False, completeOrigamicaGoal=False)
out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps(dict(verified=True, listed=20, independentMathematicalChecks=91818, previousArchive=3462, implementationVerified=False)))
