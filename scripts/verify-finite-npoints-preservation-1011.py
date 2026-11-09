from pathlib import Path
import hashlib,json
root=Path.cwd().resolve();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
baseline=json.loads((root/'output/audits/original-constructible-final-1011.json').read_text(encoding='utf8'))
original={r['file']:r['sha256'] for r in baseline['snapshots']}
for row in baseline['snapshots']:assert sha(root/baseline['archive']/row['file'])==row['sha256'],row['file']
record_name='output/parallel/original-discrete-curve-npoints-integrated-1010.json'
record=json.loads((root/record_name).read_text(encoding='utf8'));assert record['verified']
latest={}
for row in record['files']:
    assert row['before']==original.get(row['file']),row['file']
    assert sha(root/row['file'])==row['after'],row['file']
    latest[row['file']]=row['after']
unchanged=0
for name,value in original.items():
    if name.startswith(('src/','backend/','tests/')) or name=='package.json':
        current=sha(root/name)
        assert current==latest.get(name,value),name
        if current==value:unchanged+=1
for folder in ['src','backend','tests']:
    for file in (root/folder).rglob('*'):
        if not file.is_file() or '__pycache__' in file.parts:continue
        name=file.relative_to(root).as_posix();assert name in original or name in latest,name
cores=['src/core/dxf.ts','src/core/formats.ts','src/core/geometry.ts','src/core/flatFold.ts','src/core/cpPathOptimizer.ts','src/core/cpProcessingExport.ts',
    'backend/tessellation_curved_discretize_native.py','backend/tessellation_curved_conic_section_generic.py']
for name in cores:
    if name in original:assert sha(root/name)==original[name],name
target=root/'output/original-finite-npoints-preservation-1011.json';assert not target.exists()
report=dict(verified=True,previousArchive=baseline['archive'],previousArchiveFilesVerified=len(baseline['snapshots']),
    integrationReports=[record_name],mappedFiles=len(latest),lastSourceHashes=latest,unchangedProductionInputs=unchanged,
    noUnmappedProductionChanges=True,cores=cores,completeOrigamicaGoal=False)
target.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(verified=True,previousFiles=len(baseline['snapshots']),mapped=len(latest),unchanged=unchanged)))
