from pathlib import Path
import json,hashlib,shutil
root=Path.cwd().resolve();read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'));sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
check_path=root/'output/path-array-checks-004-1012.json';check=read(check_path);assert check['exitCode']==0 and check['inputsUnchanged'] and check['tests']['frontend']==3385
parallel_changes=[]
for r in check['inputs']:
 if sha(root/r['file'])!=r['sha256']:
  assert r['file']=='src/App.tsx',r['file']
  parallel_changes.append(dict(file=r['file'],testedSHA256=r['sha256'],currentSHA256=sha(root/r['file']),scope='New independent DiagramWorkspace integration written after this fixed main acceptance; preserved, not included in P73 checks.'))
source_path=root/'output/parallel/path-array-main-root-004-1012/ROOT-SOURCE-FROZEN.json';source=read(source_path);assert sha(source_path)=='10e94c0491491fcc451d14c9010e827b048ab7ad6bdc337d843ef14b54c2f4f0'
for r in source['files']:
 assert sha(root/r['snapshot'])==r['sha256'],r['path']
 if r['path']!='src/App.tsx':assert sha(root/r['path'])==r['sha256'],r['path']
for r in source['compiledBundleCopies']:assert sha(root/r['copy'])==r['sha256'],r['path']
actual_path=root/'output/playwright/path-array-main-1012/downloads-004/browser-checks.json';actual=read(actual_path)
assert actual['verified'] and actual['checks']==131 and len(actual['cases'])==len(actual['rebuiltCases'])==8 and len(actual['downloads'])==34 and len(actual['receipts'])==16 and actual['errors']==[] and not actual['fixtureResponseUsed'] and not actual['stagingCallbackUsed']
assert actual['bundle']==source['bundle']=='/assets/main-Ccoo1Gyg.js'
peer=root/'output/parallel/path-array-actual-reader-1012';freeze_path=peer/'freeze-final-004.json';assert sha(freeze_path)=='bf624272db904a36f6de97a62d65748a8d18d989405e1a084d0db4b6b50742bd';peer_freeze=read(freeze_path)
for r in peer_freeze['files']:assert sha(peer/r['path'])==r['sha256'],r['path']
for r in peer_freeze['references']:
 if Path(r['path']).resolve()==root/'src/App.tsx':
  assert sha(root/'output/parallel/path-array-main-root-004-1012/source-snapshot/src/App.tsx')==r['sha256'],r['path']
 else:assert sha(r['path'])==r['sha256'],r['path']
summary=read(peer/'summary-004.json');assert summary['verified'] and summary['failedGuards']==0 and summary['ordinaryLINEs']==393 and summary['actualUserButtonDownloads']==34
old_path=root/'output/audits/processing-r12-final-1011.json';old=read(old_path)
for r in old['snapshots']:assert sha(root/old['archive']/r['file'])==r['sha256'],r['file']
release_path=root/'release/验收-v0.13.6-20261011.json';release=read(release_path)
for r in release['artifacts']:assert sha(root/r['file'])==r['sha256'],r['file']
records=['path-array-core-root-1012','semigeneral-source-delta-root-1012','path-array-ui-root-1012','path-array-handle-delta-root-1012','path-array-units-delta-root-1012','linear-space-runtime-delta-root-1012']
changed={}
for name in records:
 data=read(root/f'output/parallel/{name}-integrated-1010.json');assert data['verified']
 for r in data['files']:changed[r['file']]=r['after']
assert len(changed)==21,len(changed)
for name,digest in changed.items():
 if name!='src/App.tsx':assert sha(root/name)==digest,name
backup=root/'output/path-array-docs-before-1012';assert not backup.exists();backup.mkdir()
for name in ['README.md','docs/Origamica当前剩余范围-20261009.md','docs/P73-路径纸带与一般Miura创作-20261012.md']:
 p=backup/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/name,p)
doc=root/'docs/P73-路径纸带与一般Miura创作-20261012.md';text=doc.read_text(encoding='utf8')
start=text.index('验收进行中：');end=text.index('\n\n实用目标',start)
text=text[:start]+'''最终统一验收（第四轮固定快照）：3385 项前端单测、TypeScript 与 Vite 构建通过；1337 后端、7 桌面、66 服务检查以全部对应输入 SHA 未改变为条件复用。131 项真实主界面断言、34 个实际按钮文件、16 次实际保存、8 个磁盘 UUID 和独立全文件回读通过，393 个普通 LINE 无增删或重复加工，尺度、位置及一次 Y 转换一致。24 个实际 JSON/FOLD 在 Chrome→Node 的来源校验通过。

折链纸带 v2 保存原数学函数计算追踪，并按原运算顺序精确重放整个来源、材料和线段；16 EPS 容限仅用于原派生函数返回，不用于移动顶点。旧 v1 保留参数读取与同运行时严格校验；缺原追踪的旧跨运行时文件不会被伪造认证，用户可明确重建为 v2。前三轮失败保持记录，不计最终成功。第三轮的同参数重建已由第四轮每种构造的有效改参、同 UUID 保存和新文件回读补足。

完成报告：[path-array-report-1012.json](../output/path-array-report-1012.json)。独立验收：[最终验收说明](../output/parallel/path-array-actual-reader-1012/最终验收-004.md)。实际验收后共享 App 另加入折序绘图工作区，已保留该并行工作；该 App 合并状态尚不属于上述固定快照验收。''' + text[end:]
doc.write_text(text,encoding='utf8')
readme=root/'README.md';text=readme.read_text(encoding='utf8');intro='P73 实用路径纸面（2026-10-12，源码版）：路径波纹 A/B/P/Tachi、折链／空间点列纸带、一般／嫁接 Miura 八种模式已接可视参数、采用后改参、保存重开和普通导出；3385 前端、131 真实操作与 34 按钮文件独立回读通过，见[入口与验收](docs/P73-路径纸带与一般Miura创作-20261012.md)。来源跨运行时误拒、标准90°和重合投影拖点已修复。九组新实用缺口完成六组，其余三组与四条范围边界继续；旧 v0.13.6 未更新，软件导入／实机未验证。\n\n';readme.write_text(text.replace('\n\n','\n\n'+intro,1),encoding='utf8')
remaining=root/'docs/Origamica当前剩余范围-20261009.md';text=remaining.read_text(encoding='utf8');intro='P73 最新范围更正（2026-10-12）：原目录复核确认九组具名实用工作流，不以旧当前菜单／五项收口“0”表示整个目标完成。本批八模式完成其中六组：一般、嫁接、半广义、Tachi、线性折链和空间点列纸带；3385 前端、131 实际操作、34 按钮文件／16 保存及独立回读通过，见[P73说明](P73-路径纸带与一般Miura创作-20261012.md)。剩余三组为双稳态折管、褶锥／多次切片、平折／Troublewit 折带；前后两组有冻结核心／界面候选但尚未主接入。任意空间曲线纸面、重塑／Ribbon、Strain／RotationalPleats、单纸基础模型四条边界继续核查／实施。完整原目录及九组正证见[实用目标闭环审查](../output/parallel/practical-objective-completion-1011/实用目标闭环审查.md)。未打包，旧包与历史记录保留。\n\n';remaining.write_text(text.replace('\n\n','\n\n'+intro,1),encoding='utf8')
report_path=root/'output/path-array-report-1012.json';assert not report_path.exists()
report=dict(verified=True,scope='Fixed eight-source-model acceptance snapshot / 6 of the 9 newly confirmed practical workflows; entire objective continues',sourceOnly=True,packaged=False,published=False,tests=check['tests'],checkFile=check_path.relative_to(root).as_posix(),checkSHA256=sha(check_path),actualBrowserChecks=131,actualDownloads=34,actualPOSTs=16,actualUUIDs=8,independentChecks=summary['independentStdlibChecks'],ordinaryLINEs=393,crossRuntimeGuards=24,actualEvidence=actual_path.relative_to(root).as_posix(),actualSHA256=sha(actual_path),sourceFreeze=source_path.relative_to(root).as_posix(),sourceFreezeSHA256=sha(source_path),bundle=source['bundle'],bundleSHA256=summary['bundleByteSHA256'],peerFreeze=freeze_path.relative_to(root).as_posix(),peerFreezeSHA256=sha(freeze_path),changedFiles=[dict(file=k,sha256=v) for k,v in changed.items()],guardedReuse=check['guardedReuse'],oldP72ArchiveVerified=len(old['snapshots']),oldPortableArtifactsPreserved=release['artifacts'],parallelChangesAfterMainAcceptance=parallel_changes,currentMergedAppVerified=False,softwareImportVerified=False,machineTrialVerified=False,machineSpeedupPromised=False)
report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
paths={};add=lambda p:paths.setdefault(Path(p).resolve(),True)
for p in [check_path,root/'output/path-array-checks-004-1012.log',report_path,source_path,actual_path,freeze_path,old_path,release_path,doc,readme,remaining]:add(p)
for r in check['inputs']:add(root/r['file'])
for r in source['files']:add(root/r['snapshot'])
for r in source['compiledBundleCopies']:add(root/r['copy'])
for r in peer_freeze['files']:add(peer/r['path'])
for r in peer_freeze['references']:add(r['path'])
for name in records:
 p=root/f'output/parallel/{name}-integrated-1010.json';add(p)
 before=root/f'output/parallel/integration-{name}-1010-before'
 for q in before.rglob('*'):
  if q.is_file():add(q)
for q in (root/'output/playwright/path-array-main-1012/downloads-004').iterdir():
 if q.is_file():add(q)
for p in backup.rglob('*'):
 if p.is_file():add(p)
for p in [root/'scripts/finish-path-array-1012.py',root/'scripts/path-array-main-1012.browser.js',root/'scripts/run-path-array-checks-004-1012.mjs',root/'scripts/capture-path-array-main-004-1012.py']:add(p)
parallel=root/'output/path-array-parallel-work-preserved-1012';assert not parallel.exists();parallel.mkdir()
for r in parallel_changes:
 p=parallel/r['file'];p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/r['file'],p);assert sha(p)==r['currentSHA256'];add(p)
(parallel/'changes.json').write_text(json.dumps(parallel_changes,ensure_ascii=False,indent=2),encoding='utf8');add(parallel/'changes.json')
archive=root/'output/audits/path-array-artifacts-1012';assert not archive.exists();archive.mkdir(parents=True)
rows=[]
for p in sorted(paths,key=str):
 assert p.is_relative_to(root),str(p)
 name=p.relative_to(root).as_posix();actual_source=root/'output/parallel/path-array-main-root-004-1012/source-snapshot/src/App.tsx' if name=='src/App.tsx' else p
 dest=archive/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(actual_source,dest);assert sha(actual_source)==sha(dest)
 rows.append(dict(file=name,sha256=sha(dest),bytes=dest.stat().st_size))
final=root/'output/audits/path-array-final-1012.json';assert not final.exists();final.write_text(json.dumps(dict(verified=True,archive=archive.relative_to(root).as_posix(),snapshots=rows,sourceFreezeSHA256=sha(source_path),reportSHA256=sha(report_path),previousP72SnapshotsVerified=len(old['snapshots']),physicalVerification=False,goalComplete=False),ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(verified=True,changedFiles=len(changed),archiveFiles=len(rows),actualChecks=131,actualFiles=34,frontend=3385,entireGoalComplete=False),ensure_ascii=False))
