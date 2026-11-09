from pathlib import Path
import hashlib, json, shutil

root = Path.cwd().resolve()
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
read = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))
checkp = root / 'output/cone-space-checks-008-1012.json'
checks = read(checkp)
assert checks['exitCode'] == 0 and checks['inputsUnchanged']
sourcep = root / 'output/parallel/cone-space-main-root-004-1012/ROOT-SOURCE-FROZEN.json'
assert sha(sourcep) == '58f9a96914a264559308bf3bfa523c94666d56da0be3edefe40e0ec867fcb3a2'
source = read(sourcep)
snapshot = {r['path']: root / r['snapshot'] for r in source['files']}
for r in source['files']: assert sha(root / r['snapshot']) == r['sha256']
for r in source['compiledBundleCopies']: assert sha(root / r['copy']) == r['sha256']
actualp = root / 'output/playwright/cone-space-main-1012/downloads-004/browser-checks.json'
actual = read(actualp)
assert actual['verified'] and actual['checks'] == 171 and len(actual['downloads']) == 53 and len(actual['receipts']) == 17 and not actual['errors']
peer = root / 'output/parallel/cone-space-actual-reader-1012'
assert sha(peer / 'manifest.json') == 'fd48452cdcd822360b79a10223d932e573457ec03cc9586f000b1f6f31713a0d'
assert sha(peer / 'freeze.json') == 'a0fe0332c0c302b486edfc14403f38b3431322d47f98ce5fb911e9ec5a8a6df6'
assert sha(peer / 'verification.json') == '2987158880bc53b0485c5b3bfa09073e66a6e34db25788481a12722dfe9d069b'
manifest = read(peer / 'manifest.json')
for r in manifest['files']: assert sha(peer / r['path']) == r['sha256']
for r in manifest['references']: assert sha(r['path']) == r['sha256'], r['path']
verification = read(peer / 'verification.json')
assert verification['verified'] and verification['actualDownloads'] == 53 and verification['nodeSourceGuardFiles'] == 42
records = ['cone-space-generic-root-1012','cone-space-cone-core-root-1012','cone-space-cone-ui-root-1012','cone-space-wiring-root-1012','cone-space-layout-root-1012','cone-space-height-root-1012','cone-space-final-height-root-1012','cone-space-all-height-root-1012']
changed = {}
for name in records:
    data = read(root / f'output/parallel/{name}-integrated-1010.json')
    assert data['verified']
    for r in data['files']: changed[r['file']] = r['after']
assert len(changed) == 16
work = root / 'output/parallel/cone-space-check-snapshot-005-1012/work'
for name, digest in changed.items(): assert sha(snapshot.get(name, work / name)) == digest, name

backup = root / 'output/cone-space-docs-before-1012'
assert not backup.exists()
backup.mkdir()
for name in ['README.md','docs/Origamica当前剩余范围-20261009.md']:
    dest = backup / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(root / name, dest)
doc = root / 'docs/P75-褶锥与空间曲折有限纸面创作-20261012.md'
assert not doc.exists()
doc.write_text('''# P75 褶锥与空间曲折有限纸面创作

入口为“镶嵌设计 → 空间构造类型 → 褶锥／多次切片 CP”或“空间曲折 · 有限弦纸张 CP”。采用后在折痕编辑点“修改褶锥与切片参数”或“修改空间曲折纸面参数”，有效改参重建保留工程名称和 UUID。

| 构造 | 可实际操作 |
| --- | --- |
| 褶锥 | 周向周期、锥内角、相位、切片法向与缩减、增减切片；Simple、单次、重复多次和原 Wave24；毫米 CP 与三维目标对照 |
| 褶锥峰谷 | 默认保留原赋型；明确选择“按目标三维形态重算峰谷”后按原有向角重算，逐边保留原值与本地映射 |
| 非螺旋空间曲折 | 直接编辑 X(s)、Y(s)、Z(s)、Γ(s)、方向、参数域、带宽与分段；原二维恢复生成有限弦纸面，而非只读公式窗口 |
| 单位与查看 | 原源单位到毫米只转换一次；单位调整重放同一 native；两图独立缩放、平移，三维视角只改变查看 |

默认原褶锥赋型存在目标角异常，因此默认三维仅作为诊断参考。显式重算只有面内距离、有向角和赋型全部通过才创建认证静态 Scene；不把非等距构形伪装成可折三维。原锥内角可能只改变三维 FF，二维 CP 不因此强行改变。

空间曲折采用的是有限弦近似：曲折保留 U／未赋型，可采用后设置山谷；纸边为 B/0。完整原域、初值和原 native 坐标保留，不采用归一化网格，不增加校验母线或三角压痕。自交、焦点或未完成原域禁用采用。该三维投影为参考，不宣称连续曲面、平折层序或碰撞认证。

| 验收 | 结果 |
| --- | --- |
| 固定源码检查 | 3475 前端测试通过；CSS 修正后按其余源码 SHA 完全相同复用结果，重新通过 TypeScript 和 Vite 1131 模块构建 |
| 后端／服务／桌面 | 1337／66／7 项此前通过，输入 SHA 相同才复用 |
| 实际主 App | 171 操作检查；预览、非法输入、取消、改参、采用、FOLD 与工程库重开、1024／1366／1920 布局通过 |
| 实际文件与工程 | 53 个下载、17 次 POST、8 个磁盘工程；普通 JSON/FOLD/DXF 位置、毫米尺度、一次 Y 转换及每边一次覆盖通过 |
| 独立来源检查 | 42 次 Chrome／磁盘 Node 回读；有效材料微移、配方与 trace 篡改各 42 次全部拒绝 |
| 原数学对照 | 20020 源／ODE 标量、1360 高精度闭式标量、9 个锥体原字面样例及 13 项验收器回归通过 |
| 实际后台与版本 | 27 次成功原 API 响应与 7 份保存 native 逐值匹配；822 源码快照、31 编译文件及实际 HTTP bundle 完全一致 |

首三次真实布局失败完整保留：单列导致预览过矮、640 高度窗口溢出、768 高度侧栏提示覆盖采用栏。最终 actual004 加强检查后全过；不将先前数学通过替代界面通过。共享折序绘图模块的后续修改另行保留，验收绑定固定副本，不覆盖其它工作。

生产目标共 16 个：两个核心、三个核心／预览测试、两个来源 fixture、两个对话框及 CSS、Worker 与预览模块、App、TessellationPanel、SpaceConstructionMenu，详见[完整报告](../output/cone-space-report-1012.json)和[独立验收](../output/parallel/cone-space-actual-reader-1012/verification.json)。

九组新增实用工作流现均完成；整体目标还包括单纸基础模型、原曲面展开纸形与旋转褶皱，继续落实和验收。本批仅源码，未打包；旧 v0.13.6 包保留。刻字软件导入、机器试压、连续运动及实机提速未验证。
''', encoding='utf8')
intro = 'P75（2026-10-12，源码版）：褶锥／多次切片与可编辑空间曲折有限纸面已接入并通过 171 项实际主界面检查、53 文件独立回读，见[入口与验收](docs/P75-褶锥与空间曲折有限纸面创作-20261012.md)。九组新增实用工作流完成；单纸模型、展开纸形与旋转褶皱继续收束，整体目标未宣布完成，旧包保留。\n\n'
readme = root / 'README.md'
readme.write_text(readme.read_text(encoding='utf8').replace('\n\n','\n\n'+intro,1), encoding='utf8')
remaining = root / 'docs/Origamica当前剩余范围-20261009.md'
intro = 'P75 最新状态（2026-10-12）：褶锥／多次切片与非螺旋空间曲折有限纸面实际创作已完成，九组新增实用工作流全部闭环；171 操作、53 实际下载、17 保存、8 UUID 与 42 来源 guard 通过。见[P75](P75-褶锥与空间曲折有限纸面创作-20261012.md)。单纸基础模型、原展开纸形和旋转褶皱继续，整体目标尚未完成，未打包。\n\n'
remaining.write_text(remaining.read_text(encoding='utf8').replace('\n\n','\n\n'+intro,1), encoding='utf8')
reportp = root / 'output/cone-space-report-1012.json'
assert not reportp.exists()
report = dict(verified=True,sourceOnly=True,packaged=False,goalComplete=False,tests=checks['tests'],guardedReuse=checks['guardedReuse'],checkFile=checkp.relative_to(root).as_posix(),checkSHA256=sha(checkp),actualChecks=171,actualFiles=53,actualPOSTs=17,actualDiskUUIDs=8,sourceGuards=42,sourceFreeze=sourcep.relative_to(root).as_posix(),sourceFreezeSHA256=sha(sourcep),actualEvidence=actualp.relative_to(root).as_posix(),actualSHA256=sha(actualp),peerFreezeSHA256=sha(peer/'freeze.json'),peerVerification=verification,changedFiles=[dict(file=k,verifiedFrozenSHA256=v) for k,v in changed.items()],remaining='Basic paper models, saved developable paper outlines, rotational pleats and final practical-scope audit',softwareImportVerified=False,machineTrialVerified=False,machineSpeedupPromised=False)
reportp.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
paths = set()
add = lambda p: paths.add(Path(p).resolve())
for p in [checkp,sourcep,actualp,reportp,doc,readme,remaining,root/'scripts/finish-cone-space-1012.py']: add(p)
for r in source['files']: add(root / r['snapshot'])
for r in source['compiledBundleCopies']: add(root / r['copy'])
for r in manifest['files']: add(peer / r['path'])
for r in manifest['references']: add(r['path'])
for name in changed: add(snapshot.get(name, work / name))
for name in records:
    add(root / f'output/parallel/{name}-integrated-1010.json')
    for p in (root / f'output/parallel/integration-{name}-1010-before').rglob('*'):
        if p.is_file(): add(p)
for p in backup.rglob('*'):
    if p.is_file(): add(p)
for p in (root / 'output/playwright/cone-space-main-1012/downloads-004').rglob('*'):
    if p.is_file(): add(p)
for index in range(1,9):
    for suffix in ['json','log']:
        p = root / f'output/cone-space-checks-{index:03d}-1012.{suffix}'
        if p.exists(): add(p)
for p in (root / 'output/parallel/cone-space-main-root-004-1012').glob('*.json'): add(p)
add(root / 'output/parallel/cone-space-main-root-004-1012/server.mjs')
archive = root / 'output/audits/cone-space-artifacts-1012'
assert not archive.exists()
archive.mkdir(parents=True)
rows = []
for p in sorted(paths,key=str):
    assert p.is_relative_to(root), str(p)
    name = p.relative_to(root).as_posix()
    dest = archive / name
    dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(p,dest)
    assert sha(dest) == sha(p)
    rows.append(dict(file=name,sha256=sha(dest),bytes=dest.stat().st_size))
final = root / 'output/audits/cone-space-final-1012.json'
assert not final.exists()
final.write_text(json.dumps(dict(verified=True,archive=archive.relative_to(root).as_posix(),snapshots=rows,reportSHA256=sha(reportp),goalComplete=False,physicalVerification=False),ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(verified=True,changedFiles=len(changed),archiveFiles=len(rows),actualChecks=171,actualFiles=53,frontend=3475,goalComplete=False),ensure_ascii=False))
