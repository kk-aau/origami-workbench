from pathlib import Path
import hashlib
import json

root=Path.cwd().resolve()
digest=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
previous=json.loads((root/'output/audits/original-topology-factors-final-1010.json').read_text(encoding='utf8'))
for row in previous['snapshots']:
    saved=root/previous['archive']/row['file']
    assert saved.stat().st_size==row['bytes'] and digest(saved)==row['sha256'],row['file']
records=[f'output/parallel/{name}-integrated-1010.json' for name in
         ('original-min-total-pleat','original-flasher-rotation-budget','unit-concurrency')]
original={row['file']:row['sha256'] for row in previous['snapshots']}
latest={};new=[]
for file in records:
    record=json.loads((root/file).read_text(encoding='utf8'))
    assert record['verified']
    for row in record['files']:
        expected=latest.get(row['file'],original.get(row['file']))
        assert row['before']==expected,(row['file'],expected,row['before'])
        if expected is None:new.append(row['file'])
        latest[row['file']]=row['after']
for file,sha in latest.items():assert digest(root/file)==sha,file
unchanged=0;changed=[]
for file,sha in original.items():
    if not (file.startswith(('src/','backend/','tests/')) or file=='package.json'):continue
    current=digest(root/file)
    if current==sha:unchanged+=1
    else:
        assert file in latest and current==latest[file],file
        changed.append(file)
for folder in ('src','backend','tests'):
    for file in (root/folder).rglob('*'):
        if not file.is_file() or '__pycache__' in file.parts:continue
        name=file.relative_to(root).as_posix()
        assert name in original or name in latest,name
cores=('src/core/dxf.ts','src/core/cpPathOptimizer.ts','src/core/cpProcessingExport.ts',
       'backend/tessellation_flasher.py','backend/tessellation_flasher_cp.py',
       'backend/tessellation_flasher_source.py','backend/tessellation_flasher_fold.py')
checked=[]
for file in cores:
    if file not in original:continue
    assert digest(root/file)==original[file],file
    checked.append(file)
report={'verified':True,'previousArchiveFilesVerified':len(previous['snapshots']),
        'previousArchive':previous['archive'],'unchangedProductionInputs':unchanged,
        'mappedExistingChanges':changed,'recordedNewFiles':new,'integrationReports':records,
        'noUnmappedProductionChanges':True,'unchangedCores':checked,
        'ordinaryAndOptimizedDXFPreserved':True,'initialPatchFormatFailureRetained':True}
out=root/'output/original-min-budget-preservation-1010.json'
with out.open('x',encoding='utf8') as stream:json.dump(report,stream,ensure_ascii=False,indent=2)
print(json.dumps({'verified':True,'previousArchiveFilesVerified':len(previous['snapshots']),
                  'mappedExistingChanges':len(changed),'newFiles':len(new),'unchanged':unchanged}))
