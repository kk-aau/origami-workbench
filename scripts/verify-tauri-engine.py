"""Read-only engine reuse verification, including embedded PyInstaller PYZ."""
from pathlib import Path
import argparse, hashlib, json, marshal, struct, zlib

root=Path(__file__).resolve().parent.parent
version=json.loads((root/'package.json').read_text(encoding='utf-8'))['version']
candidate=json.loads((root/'desktop-tauri/release.json').read_text(encoding='utf-8'))['candidate']
release_id=f'{version}-{candidate}'
parser=argparse.ArgumentParser()
parser.add_argument('--engine',default='build/tessellation/zhezhi-tess')
parser.add_argument('--output',default=f'output/tauri-release-{release_id}/engine-reuse.json')
parser.add_argument('--rebuilt-regression',help='Verified rebuilt-engine comparison report, bound to the complete engine manifest')
args=parser.parse_args()
engine=(root/args.engine).resolve()
output=(root/args.output).resolve()
assert output.is_relative_to(root), 'Evidence must remain in migration project'
baseline=json.loads((root/'migration/source-baseline.json').read_text(encoding='utf-8-sig'))
original=root.parent/'workbench'
def sha(file):return hashlib.sha256(file.read_bytes()).hexdigest()
files=[{'path':p.relative_to(engine).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(engine.rglob('*')) if p.is_file()]
expected=[{'path':r['path'].split('build/tessellation/zhezhi-tess/',1)[1],'bytes':r['bytes'],'sha256':r['sha256']} for r in baseline['files'] if r['path'].startswith('build/tessellation/zhezhi-tess/')]
historical=original/'output/slim-round2-20261018/engine26-file-manifest.json'
source_rows=[r for r in baseline['files'] if r['path'].startswith(('backend/','vendor/')) or r['path'].startswith('requirements') or r['path']=='scripts/build-tessellation.ps1']
regression=None
if args.rebuilt_regression:
    regression_path=(root/args.rebuilt_regression).resolve()
    assert regression_path.is_relative_to(root)
    regression=json.loads(regression_path.read_text(encoding='utf-8-sig'))
    assert regression['passed'] and regression['id']==release_id
    assert regression['engineManifest']==files, 'Rebuilt engine changed after regression'
    assert regression['cases'] and regression['sourceInputs'] and regression['regressionBoundary']
    for row in regression['sourceInputs']:
        assert sha(root/row['path'])==row['sha256'], f"Engine source changed after regression: {row['path']}"
    changed=regression['sourceChanges']
else:
    assert sorted(files,key=lambda r:r['path'])==sorted(expected,key=lambda r:r['path']), 'Engine differs from copied source baseline'
    historical_files=json.loads(historical.read_text(encoding='utf-8-sig'))
    assert sorted(files,key=lambda r:r['path'])==sorted(historical_files,key=lambda r:r['path']), 'Engine differs from validated v0.13.26'
    changed=[r['path'] for r in source_rows if not (root/r['path']).is_file() or sha(root/r['path'])!=r['sha256'] or sha(original/r['path'])!=r['sha256']]
    assert not changed, changed
exe=(engine/'zhezhi-tess.exe').read_bytes()
cookie=exe.rfind(b'MEI\x0c\x0b\x0a\x0b\x0e');assert cookie>=0
magic,size,toc_offset,toc_size,py_version,python_lib=struct.unpack('!8sIIII64s',exe[cookie:cookie+88])
archive_start=cookie+88-size
toc=exe[archive_start+toc_offset:archive_start+toc_offset+toc_size]
entries={};offset=0
while offset<len(toc):
    length,position,stored,raw,compressed,kind=struct.unpack('!iIIIBc',toc[offset:offset+18])
    assert length>=18 and offset+length<=len(toc)
    name=toc[offset+18:offset+length].rstrip(b'\0').decode('utf-8')
    entries[name]=(position,stored,raw,compressed,kind.decode())
    offset+=length
position,stored,raw,compressed,_=entries['PYZ.pyz']
pyz=exe[archive_start+position:archive_start+position+stored]
if compressed:pyz=zlib.decompress(pyz)
assert len(pyz)==raw and pyz.startswith(b'PYZ\0')
pyz_toc=struct.unpack('!i',pyz[8:12])[0]
modules=dict(marshal.loads(pyz[pyz_toc:]))
banned=['numba','llvmlite','matplotlib','PIL','tkinter','IPython']
def excluded(name):
    value=name.lower().replace('/','.').replace('\\','.')
    return any(value==b.lower() or value.startswith(b.lower()+'.') or value.startswith(b.lower()+'-') for b in banned)
bad_modules=[m for m in modules if excluded(m)]
bad_pkg=[m for m in entries if excluded(m)]
bad_paths=[r['path'] for r in files if any(excluded('/'.join(r['path'].split('/')[i:])) for i in range(len(r['path'].split('/'))))]
assert not bad_modules and not bad_pkg and not bad_paths
assert 'pleat._acceleration' in modules and 'pleat._optional' in modules
report={'passed':True,'sourceVersion':'0.13.36','engineOrigin':'validated v0.13.26, reused by v0.13.36','reusedFor':release_id,'directory':str(engine),'files':len(files),'bytes':sum(r['bytes'] for r in files),'engineManifest':files,'sourceFilesCompared':len(source_rows),'sourceChanges':changed,'banned':banned,'unexpectedPaths':bad_paths,'unexpectedPkg':bad_pkg,'unexpectedPyzModules':bad_modules,'pkgEntries':len(entries),'pyzModules':len(modules),'embeddedPythonVersion':py_version,'lightweightHelpersPresent':True,'historicalManifest':str(historical),'historicalManifestSha256':sha(historical),'regressionBoundary':'沿用同字节引擎已有1358项Python回归，本轮未重跑；新实包GUI计算须单独验收。'}
if regression:
    report.update(sourceVersion=version,engineOrigin='rebuilt from current locked source',engineRebuilt=True,sourceFilesCompared=len(regression['sourceInputs']),regressionBoundary=regression['regressionBoundary'],regressionReport=str(regression_path),regressionReportSha256=sha(regression_path))
    report.pop('historicalManifest');report.pop('historicalManifestSha256')
output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='engineManifest'},ensure_ascii=False,indent=2))
