from pathlib import Path
import hashlib,json,sys
root=Path.cwd().resolve();digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert len(sys.argv)>2,'传入全新报告路径及本批按应用顺序排列的集成记录'
out=(root/sys.argv[1]).resolve();assert out.is_relative_to(root/'output') and not out.exists()
records=sys.argv[2:];previous=json.loads((root/'output/audits/original-topology-factors-final-1010.json').read_text(encoding='utf8'))
for row in previous['snapshots']:
 saved=root/previous['archive']/row['file']
 assert saved.stat().st_size==row['bytes'] and digest(saved)==row['sha256'],row['file']
original={row['file']:row['sha256'] for row in previous['snapshots']};latest={};new=[]
for file in records:
 record_path=(root/file).resolve();assert record_path.is_relative_to(root/'output/parallel') and file.endswith('-integrated-1010.json')
 record=json.loads(record_path.read_text(encoding='utf8'));assert record['verified']
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
  name=file.relative_to(root).as_posix();assert name in original or name in latest,name
cores=['src/core/dxf.ts','src/core/cpPathOptimizer.ts','src/core/cpProcessingExport.ts','backend/tessellation_flasher.py']
for file in cores:assert digest(root/file)==original[file],file
report=dict(verified=True,previousArchiveFilesVerified=len(previous['snapshots']),previousArchive=previous['archive'],
 unchangedProductionInputs=unchanged,mappedExistingChanges=changed,recordedNewFiles=new,integrationReports=records,
 noUnmappedProductionChanges=True,unchangedCores=cores,ordinaryAndOptimizedDXFPreserved=True,
 lastSourceHashes=latest)
with out.open('x',encoding='utf8') as stream:json.dump(report,stream,ensure_ascii=False,indent=2)
print(json.dumps(dict(verified=True,preserved=len(previous['snapshots']),mappedChanges=len(changed),newFiles=len(new),unchanged=unchanged)))
