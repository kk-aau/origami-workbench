from pathlib import Path
import hashlib,json,shutil
root=Path.cwd().resolve();sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
checkp=root/'output/tube-strip-checks-001-1012.json';checks=read(checkp);assert checks['exitCode']==0 and checks['inputsUnchanged']
sourcep=root/'output/parallel/tube-strip-main-root-001-1012/ROOT-SOURCE-FROZEN.json';source=read(sourcep)
assert sha(sourcep)=='f8280b82c6c052354792d2d5991123a33c38d9ffd5b510638b8cc4be42bfe94c'
for r in source['files']:assert sha(root/r['snapshot'])==r['sha256']
for r in source['compiledBundleCopies']:assert sha(root/r['copy'])==r['sha256']
actualp=root/'output/playwright/tube-strip-main-1012/downloads-002/browser-checks.json';actual=read(actualp)
assert actual['verified'] and actual['checks']==94 and len(actual['downloads'])==32 and len(actual['receipts'])==10 and not actual['errors']
peer=root/'output/parallel/tube-strip-actual-reader-1012';manifest=read(peer/'manifest.json')
assert sha(peer/'manifest.json')=='321a9e8714ab9784908a6c3a76ec77e0e7d35a5d5620bac94d035ab732167e21'
assert sha(peer/'freeze.json')=='1ec6c89715250047c5cd99f11136b97dc390a0251f6b2bda8cf1422220fcd1e8'
for r in manifest['files']:assert sha(peer/r['path'])==r['sha256']
for r in manifest['references']:assert sha(r['path'])==r['sha256'],r['path']
verification=read(peer/'verification.json');assert verification['verified'] and verification['actualDownloads']==32 and verification['nodeSourceGuardFiles']==25 and verification['actualDiskProjects']==5
records=['tube-strip-tube-core-root-1012','tube-strip-flat-core-root-1012','tube-strip-tube-ui-root-1012','tube-strip-flat-ui-root-1012','tube-strip-wiring-root-1012'];changed={}
for name in records:
 data=read(root/f'output/parallel/{name}-integrated-1010.json');assert data['verified']
 for r in data['files']:changed[r['file']]=r['after'];assert sha(root/r['file'])==r['after']
assert len(changed)==13
backup=root/'output/tube-strip-docs-before-1012';assert not backup.exists();backup.mkdir()
for name in ['README.md','docs/Origamica当前剩余范围-20261009.md']:
 dest=backup/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/name,dest)
doc=root/'docs/P74-双稳态折管与平折纸带创作-20261012.md';assert not doc.exists()
doc.write_text('''# P74 双稳态折管与平折纸带创作

在“镶嵌设计 → 空间构造类型”新增“双稳态三角折管 CP”和“平折路径纸带／Troublewit CP”。采用后回到折痕编辑，通过“修改双稳态折管参数”或“修改平折纸带参数”继续改造；同种构造重建保留工程名称和 UUID。

| 构造 | 可实际编辑与查看 |
| --- | --- |
| 双稳态三角折管 | 周向分段、逐层两种设计高度、旋向、增删层、重复层；带毫米刻度的高度拖点，真实 CP 与两个已核静态形态，相机切换保持视角 |
| 一般路径纸带 | XY 目标路径拖点与数值表、增删点、宽度、展角、自动或逐折 M/V；矩形、三角、梯形的有限材料 CP 与实际平折终态 |
| Troublewit 自定长度 | 起点、逐段长度与绝对方向、增删段；原纸带宽 1 mm 保持 |
| 标准 Troublewit | 起点与五段方向；原长度 3、3、7、3、3 只读 |

预览支持毫米刻度、滚轮缩放和平移。当前参数有效才可采用，非法空值不沿用旧图；取消不改工程。未知平折层序时只显示线框，避免假遮挡。

| 统一验收 | 实际结果 |
| --- | --- |
| 当前合并源码检查 | 3427 前端测试、7 桌面测试、TypeScript 与 Vite 1120 模块构建通过；后端 1337、服务 66 项以对应输入 SHA 相同为条件复用 |
| 主 App | 94 个实际操作检查；两种折管层配方与三种纸带及有效改参重建，共 10 个构造状态 |
| 文件 | 32 个实际下载（30 个 JSON/FOLD/普通 DXF 与两份取消前后工程），原几何、毫米、位置、一次 Y 转换与每边一次覆盖通过 |
| 工程 | 10 次真实保存、5 个磁盘工程，改参数重建保 UUID，FOLD 与工程库重开恢复来源 |
| 独立来源回读 | 20 个 Chrome JSON/FOLD 与 5 个磁盘工程共 25 次通过；保持材料有效且同步改纸幅／线段的微移和配方篡改均拒绝 |
| 独立验收器 | 16 项回归测试通过，覆盖 19 个原字面算例、10 个实际文件组及 13 类负例 |
| 固定版本 | 810 份源码快照、29 份构建副本、实际 HTTP 主 bundle 字节一致；测试服务仅固定静态资源，保留原项目与后台 API |

原折管左缝 M/0 是原源赋型异常，本地纸面显式采用 B/0，原记录和两缝独立身份保留；不焊空间重合点。两静态状态分别核面内距离、闭缝与有向角，不能据此承诺连续运动、碰撞、全纸层序或物理双稳态。原纸带静态半转终态保留，M/V 在几何半转上的歧义不被伪造消除。

共享构建曾更新 source map，已保留，并改用不可变构建重新完成全部操作。首轮独立 DXF 节头解析器错误及构建 SHA 阻断均保留历史，不计最终验收。

修改目标共 13 个：两个核心、两个测试、两个原来源 fixture、两个界面及 CSS、App、TessellationPanel、SpaceConstructionMenu。完整 SHA 和证据见[报告](../output/tube-strip-report-1012.json)及[独立验收说明](../output/parallel/tube-strip-actual-reader-1012/交付说明.md)。

九组新增实用工作流目前完成八组；褶锥／多次切片下一批接入。非螺旋空间曲线纸面、曲面展开／重塑、旋转褶皱及单纸基础模型继续落实。整个目标未完成。本批为源码更新，旧 v0.13.6 便携包未覆盖；全部实用功能完成后再打包。刻字软件导入、机器试压及实机提速未验证。
''',encoding='utf8')
intro='P74（2026-10-12，源码版）：双稳态三角折管与一般／Troublewit 平折纸带可视创作已接入，采用后可改参、保存和重开；3427 前端、94 主界面操作和 32 按钮文件独立回读通过，见[入口与验收](docs/P74-双稳态折管与平折纸带创作-20261012.md)。九组新实用工作流完成八组，剩余褶锥及原具名边界继续；旧包未覆盖。\n\n'
readme=root/'README.md';text=readme.read_text(encoding='utf8');readme.write_text(text.replace('\n\n','\n\n'+intro,1),encoding='utf8')
remaining=root/'docs/Origamica当前剩余范围-20261009.md';text=remaining.read_text(encoding='utf8');intro='P74 最新状态（2026-10-12）：双稳态三角折管与平折／Troublewit 纸带已完成主界面、有效改参及工程／普通文件闭环，九组实用工作流完成八组；3427 前端、94 操作、32 实际文件、10 保存、5 UUID 与 25 来源回读通过，见[P74说明](P74-双稳态折管与平折纸带创作-20261012.md)。褶锥／多次切片、非螺旋空间曲线有限纸面已准备核心和可视候选，继续主接入；曲面展开／重塑、旋转褶皱与单纸基础模型继续按原实际用途落实。未宣布整体完成，未打包。\n\n';remaining.write_text(text.replace('\n\n','\n\n'+intro,1),encoding='utf8')
reportp=root/'output/tube-strip-report-1012.json';assert not reportp.exists()
report=dict(verified=True,sourceOnly=True,packaged=False,goalComplete=False,tests=checks['tests'],checkFile=checkp.relative_to(root).as_posix(),checkSHA256=sha(checkp),actualChecks=94,actualFiles=32,actualPOSTs=10,actualDiskUUIDs=5,sourceGuards=25,sourceFreeze=sourcep.relative_to(root).as_posix(),sourceFreezeSHA256=sha(sourcep),bundle=source['bundle'],actualEvidence=actualp.relative_to(root).as_posix(),actualSHA256=sha(actualp),peerFreezeSHA256=sha(peer/'freeze.json'),peerVerification=verification,changedFiles=[dict(file=k,sha256=v) for k,v in changed.items()],remaining='one of the nine new practical workflows plus named practical boundaries',softwareImportVerified=False,machineTrialVerified=False,machineSpeedupPromised=False)
reportp.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
paths=set();add=lambda p:paths.add(Path(p).resolve())
for p in [checkp,root/'output/tube-strip-checks-001-1012.log',sourcep,actualp,reportp,doc,readme,remaining,root/'scripts/finish-tube-strip-1012.py']:add(p)
for r in source['files']:add(root/r['snapshot'])
for r in source['compiledBundleCopies']:add(root/r['copy'])
for r in manifest['files']:add(peer/r['path'])
for r in manifest['references']:add(r['path'])
for name in records:
 add(root/f'output/parallel/{name}-integrated-1010.json')
 for p in (root/f'output/parallel/integration-{name}-1010-before').rglob('*'):
  if p.is_file():add(p)
for folder in [root/'output/playwright/tube-strip-main-1012/downloads-002',backup,root/'output/parallel/tube-strip-runtime-002-1012']:
 for p in folder.rglob('*'):
  if p.is_file():add(p)
for name in changed:add(root/name)
archive=root/'output/audits/tube-strip-artifacts-1012';assert not archive.exists();archive.mkdir(parents=True);rows=[]
for p in sorted(paths,key=str):
 assert p.is_relative_to(root),str(p);name=p.relative_to(root).as_posix();dest=archive/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest);assert sha(dest)==sha(p);rows.append(dict(file=name,sha256=sha(dest),bytes=dest.stat().st_size))
final=root/'output/audits/tube-strip-final-1012.json';assert not final.exists();final.write_text(json.dumps(dict(verified=True,archive=archive.relative_to(root).as_posix(),snapshots=rows,reportSHA256=sha(reportp),goalComplete=False,physicalVerification=False),ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(verified=True,changedFiles=13,archiveFiles=len(rows),actualChecks=94,actualFiles=32,frontend=3427,goalComplete=False),ensure_ascii=False))
