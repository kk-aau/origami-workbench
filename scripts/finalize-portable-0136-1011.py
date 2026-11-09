from pathlib import Path
import hashlib
import json

root = Path.cwd().resolve()
read = lambda p: json.loads((root / p).read_text(encoding='utf-8-sig'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
report = root / 'release/验收-v0.13.6-20261011.json'
sums = root / 'release/SHA256SUMS-0.13.6.txt'
assert not report.exists() and not sums.exists(), '保留已有交付记录'
main = read('output/original-uniform-helix-extended-report-1011.json')
archive = read('output/audits/original-uniform-helix-extended-final-1011.json')
package_path = 'output/parallel/original-package-0.13.6-independent-actual-acceptance-1011/portable-payload-readback-001.json'
package = read(package_path)
smoke = read('output/desktop-portable-0.13.6-1011/smoke-result.json')
assert main['verified'] and archive['verified'] and main['practicalBranchComplete']
assert package['verified'] and not package['errors'] and package['shaFilesUnchanged']
assert smoke['passed'] == 139 and smoke['packaged'] is True
old = read('output/package-0.13.6-previous-releases-preserved-before-1011.json')
for row in old['artifacts']:
    p = Path(row['file'])
    assert p.stat().st_size == row['bytes'] and sha(p) == row['sha256']
for row in old['olderVersionedFiles']:
    p = root / 'release' / row['file']
    assert p.is_file() and p.stat().st_size == row['bytes'], row['file']
artifacts = []
for name in ['Zhezhi-Workbench-0.13.6-Portable-x64.exe', 'Zhezhi-Workbench-0.13.6-Source.zip']:
    p = root / 'release' / name
    artifacts.append(dict(file=p.relative_to(root).as_posix(), bytes=p.stat().st_size, sha256=sha(p)))
sums.write_text(''.join(r['sha256'] + '  ' + Path(r['file']).name + '\n' for r in artifacts), encoding='utf-8')
result = dict(version='0.13.6', date='2026-10-11', verified=True, artifacts=artifacts,
    scope='均匀螺旋扩展及截至本次验收的实用构造；可预览、采用、保存和导出，用户创作目标继续。',
    packagingResources=dict(preferLocal=True, electron='44.4.2',
        electronDist='node_modules/electron/dist',
        successfulBuildLog='output/package-portable-0.13.6-local-electron-1011.log',
        priorNetworkAttemptFailedAndRetained='output/package-portable-0.13.6-1011.log',
        successfulBuildDownloadedRuntime=False),
    tests=dict(project=main['tests'], actualMainChecks=main['actualMainChecks'],
        actualUserFiles=main['userButtonExportFiles'], coreImports=main['actualCoreImports'],
        parentStates=main['finalLayoutRecords'], coreChecks=main['independent']['core']['checks'],
        actualFileBindingChecks=main['independent']['numericBinding']['checks'],
        mathChecksReused=173909, mathRerun=False, actualPortableSmoke=139,
        actualPortablePayloadChecks=package['checks']),
    evidence=dict(branchReport='output/original-uniform-helix-extended-report-1011.json',
        branchArchive='output/audits/original-uniform-helix-extended-final-1011.json',
        branchArchiveSHA256=sha(root / 'output/audits/original-uniform-helix-extended-final-1011.json'),
        payloadReport=package_path, payloadReportSHA256=sha(root / package_path),
        actualPayloadExtractedFromPortable=True,
        smokeReport='output/desktop-portable-0.13.6-1011/smoke-result.json'),
    modifiedProductionFiles=list(main['preservation']['lastSourceHashes']),
    oldReleasesPreserved=True, oldReleaseBytesVerified=[r['file'] for r in old['artifacts']],
    engineFiles=435, sourceFiles=3333, distFiles=26, licenseFiles=75,
    unverified=['P66全部参数在原生桌面逐项操作（已主浏览器验收并核对相同编译资产）',
        '刻字软件实际导入与机器试压', '安装版安装/卸载', '完整用户创作目标尚未完成'],
    newlyPreparedVisualEditorCandidatesIncluded=False, goalStatus='active',
    packed=True, published=False, machineOperated=False)
report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(dict(verified=True, portableBytes=artifacts[0]['bytes'],
    sourceBytes=artifacts[1]['bytes'], payloadChecks=package['checks'], smokeChecks=139), ensure_ascii=False))
